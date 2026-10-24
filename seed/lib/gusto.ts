// Gusto demo seed (A-07): plan (pure) and a narrow writer. Maps our workers onto the demo company's
// employees and sets their compensations. It never touches payrolls: there is no prepare, update,
// calculate or submit path here (B's draft writer owns payroll writes; submit exists nowhere).
//
// Reads go through A1's read-only GustoClient (packages/connectors). Writes go through GustoSeedWriter,
// which shares that client's token store and refresh, so the rotating refresh token in
// data/private/gusto-token.json is only ever refreshed in one place.

import { GUSTO_API_VERSION, type GustoClient, gustoUrl } from "../../packages/connectors/src/gusto/client.ts";
import type { StoredTokens, TokenStore } from "../../packages/connectors/src/tokens.ts";

export type Rec = Record<string, unknown>;

/** The only write endpoints this seed may call. Anything else (and every /payrolls write) is refused. */
export const WRITE_ALLOWLIST: { method: "PUT" | "POST"; re: RegExp }[] = [
  { method: "PUT", re: /^\/v1\/compensations\/[A-Za-z0-9-]+$/ },
  { method: "POST", re: /^\/v1\/companies\/[A-Za-z0-9-]+\/employees$/ },
  { method: "POST", re: /^\/v1\/employees\/[A-Za-z0-9-]+\/jobs$/ },
];

export function assertWritable(method: string, path: string) {
  if (/payroll/i.test(path)) throw new Error(`refusing Gusto ${method} ${path}: payroll writes belong to B's draft writer, and submit is never called`);
  if (!WRITE_ALLOWLIST.some((a) => a.method === method && a.re.test(path))) throw new Error(`refusing Gusto ${method} ${path}: not on the seed allowlist`);
}

// ---------------------------------------------------------------- plan

export type GustoTarget = {
  workerId: string;
  displayName: string;
  /** "existing" = take the next onboarded demo employee by uuid order; "new_hire" = create, leave onboarding unfinished. */
  source: "existing" | "new_hire";
  compensation: { rate: string; paymentUnit: string; flsaStatus: string } | null;
};

export type GustoPlan = { targets: GustoTarget[]; skipped: { workerId: string; reason: string }[] };

export function buildGustoPlan(workers: Rec[]): GustoPlan {
  const targets: GustoTarget[] = [];
  const skipped: GustoPlan["skipped"] = [];
  for (const w of workers) {
    const g = w.gusto as Rec | null;
    if (!g) {
      skipped.push({ workerId: w.id as string, reason: `${w.payType}: paid outside Gusto (Venmo list), never sent to Gusto` });
      continue;
    }
    const rate = g.rateCents as number | null;
    targets.push({
      workerId: w.id as string,
      displayName: w.displayName as string,
      source: g.onboarded === false ? "new_hire" : "existing",
      // Never invent a rate: a null rate in the config means "leave the demo compensation as it is".
      compensation: rate == null ? null : { rate: (rate / 100).toFixed(2), paymentUnit: g.paymentUnit as string, flsaStatus: g.flsaStatus as string },
    });
  }
  return { targets, skipped };
}

type DemoEmployee = { uuid: string; first_name?: string; last_name?: string; onboarded?: boolean; terminated?: boolean; jobs?: { uuid: string; current_compensation_uuid?: string; compensations?: { uuid: string; version: string }[] }[] };

/** Assigns demo employees to targets: onboarded, not terminated, by uuid order. Deterministic; never reuses one. */
export function assignExisting(targets: GustoTarget[], employees: DemoEmployee[], already: Record<string, string> = {}): Record<string, string> {
  const out: Record<string, string> = { ...already };
  const used = new Set(Object.values(out));
  const pool = employees.filter((e) => e.onboarded === true && e.terminated !== true && !used.has(e.uuid)).sort((a, b) => a.uuid.localeCompare(b.uuid));
  for (const t of targets.filter((x) => x.source === "existing")) {
    if (out[t.workerId]) continue;
    const next = pool.shift();
    if (!next) throw new Error(`demo company has too few onboarded employees: none left for ${t.workerId} (plan A-07 fallback: fewer workers, or keep demo employees as-is)`);
    out[t.workerId] = next.uuid;
  }
  return out;
}

/** The unprocessed regular payroll whose pay period covers the cycle's end date (read only). */
export function pickPayroll(payrolls: Rec[], cycleStart: string, cycleEnd: string): { uuid: string | null; candidates: string[] } {
  const period = (p: Rec) => (p.pay_period as Rec | undefined) ?? {};
  const uuid = (p: Rec) => (p.payroll_uuid ?? p.uuid) as string;
  const candidates = payrolls.map((p) => `${uuid(p)} ${period(p).start_date}..${period(p).end_date}`);
  const covering = payrolls.filter((p) => String(period(p).start_date) <= cycleEnd && String(period(p).end_date) >= cycleEnd);
  const best = covering.find((p) => String(period(p).start_date) <= cycleStart) ?? covering[0];
  return { uuid: best ? uuid(best) : null, candidates };
}

export type GustoMap = {
  companyUuid?: string;
  workers?: Record<string, { employeeUuid: string; jobUuid: string | null; compensationUuid: string | null }>;
  gustoPayrollId?: string | null;
};

// ---------------------------------------------------------------- writer

/** Write calls only, sharing the reader's token store; refreshes through the reader (one refresh path). */
export class GustoSeedWriter {
  constructor(
    private reader: Pick<GustoClient, "refresh">,
    private store: TokenStore,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  private async token(): Promise<string> {
    const t: StoredTokens | null = await this.store.load();
    if (t?.accessToken && t.accessTokenExpiresAt && t.accessTokenExpiresAt - 60_000 > Date.now()) return t.accessToken;
    return (await this.reader.refresh()).accessToken as string;
  }

  async send(method: "PUT" | "POST", path: string, body: Rec): Promise<Rec> {
    assertWritable(method, path);
    const url = gustoUrl(path); // host lock: api.gusto-demo.com only
    for (let attempt = 1; attempt <= 2; attempt++) {
      const res = await this.fetchImpl(url, {
        method,
        headers: { Authorization: `Bearer ${await this.token()}`, "X-Gusto-API-Version": GUSTO_API_VERSION, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 401 && attempt === 1) {
        await this.reader.refresh();
        continue;
      }
      const json = (await res.json().catch(() => ({}))) as Rec;
      if (!res.ok) throw new Error(`Gusto ${method} ${path}: HTTP ${res.status} ${JSON.stringify(json).slice(0, 300)}`);
      return json;
    }
    throw new Error(`Gusto ${method} ${path}: unauthorized after refresh`);
  }
}
