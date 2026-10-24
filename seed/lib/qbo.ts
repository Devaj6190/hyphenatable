// QuickBooks Online seed plan and a write client restricted to the SANDBOX host (A-06).
// The plan is pure; the client is used only by `seed/push-qbo.ts --live`.
//
// Shapes follow QBO REST v3 (Purchase, Bill, Customer with Job/ParentRef, Vendor, Account). Our marker
// `payrollpilot:<id>` goes in PrivateNote (Purchase, Bill) or Notes (Customer, Vendor). Re-seeding deletes
// our own Purchases and Bills through the API (`?operation=delete`); it never uses "Clear data and reset".

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type Rec = Record<string, unknown>;
export const marker = (ourId: string) => `payrollpilot:${ourId}`;
const dollars = (cents: number) => Math.round(cents) / 100;

export const QBO_SANDBOX_BASE = "https://sandbox-quickbooks.api.intuit.com/v3";
export const QBO_TOKEN_URL =
  "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
export const QBO_MINOR_VERSION = "75";
export const PRIVATE_DIR = join(import.meta.dir, "..", "..", "data", "private");
/** Separate from the read connector's data/private/qbo-token.json so the two never race on rotation. */
export const QBO_SEED_TOKEN_PATH = join(PRIVATE_DIR, "qbo-seed-token.json");

export const ACCOUNT_KIND = "Expense"; // AccountType for the expense accounts we may create
export const CARD_ACCOUNT_NAME = "Company A Card (payrollpilot)";

// ---------------------------------------------------------------- plan

/** Ref filled from the id map at execution time: { $ref: "<kind>:<key>" }. */
export type Ref = { $ref: string };
const ref = (kind: string, key: string): Ref => ({ $ref: `${kind}:${key}` });

export type QboStep = {
  object: "accounts" | "vendors" | "customers" | "jobs" | "purchases" | "bills";
  key: string;
  /** "ensure" = look up by name, create only if missing; "create" = always ours (marked). */
  mode: "ensure" | "create";
  entity: "Account" | "Vendor" | "Customer" | "Purchase" | "Bill";
  lookup?: { field: string; value: string };
  /** For records that must be ours: a name match is adopted only if Notes carries this marker. */
  requireMarker?: string;
  body: Rec;
  note?: string;
};

export type QboIdMap = Partial<
  Record<QboStep["object"] | "cardAccount", Record<string, string>>
>;
export type QboFixtures = { expenses: Rec[]; jobs: Rec[] };

/**
 * Vendor invoices pushed as Bills (plan step 2: "Bills for two vendor invoices"): the first two past-cycle
 * Equipment Rental expenses. Past cycles only, so the current cycle's Purchase count stays as in the fixtures.
 */
export function billIds(
  fx: QboFixtures,
  currentPeriodStartDate: string,
): string[] {
  return fx.expenses
    .filter(
      (x) =>
        x.source === "qbo" &&
        x.accountName === "Equipment Rental" &&
        (x.date as string) < currentPeriodStartDate,
    )
    .sort(
      (a, b) =>
        String(a.date).localeCompare(String(b.date)) ||
        String(a.id).localeCompare(String(b.id)),
    )
    .slice(0, 2)
    .map((x) => x.id as string);
}

export function buildQboPlan(
  fx: QboFixtures,
  map: QboIdMap,
  opts: { currentPeriodStartDate: string; companyName: string },
) {
  const steps: QboStep[] = [];
  const add = (s: QboStep) => {
    if (map[s.object]?.[s.key]) return;
    steps.push(s);
  };
  const qbo = fx.expenses.filter((x) => x.source === "qbo");
  const bills = new Set(billIds(fx, opts.currentPeriodStartDate));
  const jobs = new Map(fx.jobs.map((j) => [j.id as string, j]));

  // accounts (expense accounts by name, plus the card the purchases are paid from)
  for (const name of [
    ...new Set(qbo.map((x) => x.accountName as string)),
  ].sort()) {
    add({
      object: "accounts",
      key: name,
      mode: "ensure",
      entity: "Account",
      lookup: { field: "Name", value: name },
      body: { Name: name, AccountType: ACCOUNT_KIND },
    });
  }
  add({
    object: "accounts",
    key: CARD_ACCOUNT_NAME,
    mode: "ensure",
    entity: "Account",
    lookup: { field: "Name", value: CARD_ACCOUNT_NAME },
    body: { Name: CARD_ACCOUNT_NAME, AccountType: "Credit Card" },
  });

  // vendors (fake business names)
  for (const v of [
    ...new Set(qbo.map((x) => x.vendor as string).filter(Boolean)),
  ].sort()) {
    add({
      object: "vendors",
      key: v,
      mode: "ensure",
      entity: "Vendor",
      lookup: { field: "DisplayName", value: v },
      body: { DisplayName: v, Notes: "payrollpilot:vendor" },
    });
  }

  // customers: one parent per client, one sub-customer (Job: true) per job, DisplayName = job number
  const clients = [
    ...new Set(fx.jobs.map((j) => j.clientRef as string)),
  ].sort();
  for (const c of clients) {
    const name = `${opts.companyName} client ${c}`;
    add({
      object: "customers",
      key: c,
      mode: "ensure",
      entity: "Customer",
      lookup: { field: "DisplayName", value: name },
      requireMarker: marker(c),
      body: { DisplayName: name, Notes: marker(c) },
    });
  }
  for (const j of fx.jobs) {
    const num = String(j.jobNumber);
    add({
      object: "jobs",
      key: j.id as string,
      mode: "ensure",
      entity: "Customer",
      lookup: { field: "DisplayName", value: num },
      requireMarker: marker(j.id as string),
      body: {
        DisplayName: num,
        Job: true,
        BillWithParent: true,
        ParentRef: ref("customers", j.clientRef as string),
        Notes: marker(j.id as string),
      },
    });
  }

  // purchases and bills
  for (const x of qbo) {
    const id = x.id as string;
    const detail: Rec = {
      AccountRef: ref("accounts", x.accountName as string),
    };
    if (x.matchedJobId) {
      if (!jobs.has(x.matchedJobId as string))
        throw new Error(`${id}: unknown job ${x.matchedJobId}`);
      detail.CustomerRef = ref("jobs", x.matchedJobId as string);
    }
    const line = {
      Amount: dollars(x.amountCents as number),
      DetailType: "AccountBasedExpenseLineDetail",
      Description: x.description,
      AccountBasedExpenseLineDetail: detail,
    };
    if (bills.has(id)) {
      add({
        object: "bills",
        key: id,
        mode: "create",
        entity: "Bill",
        body: {
          VendorRef: ref("vendors", x.vendor as string),
          TxnDate: x.date,
          PrivateNote: marker(id),
          Line: [line],
        },
        note: "vendor invoice",
      });
    } else {
      add({
        object: "purchases",
        key: id,
        mode: "create",
        entity: "Purchase",
        body: {
          PaymentType: "CreditCard",
          AccountRef: ref("accounts", CARD_ACCOUNT_NAME),
          TxnDate: x.date,
          EntityRef: { ...ref("vendors", x.vendor as string), type: "Vendor" },
          PrivateNote: marker(id),
          Line: [line],
        },
        note: x.matchedJobId
          ? undefined
          : x.kind === "job_cost"
            ? "job cost with NO job tag (CHK-14 if current cycle)"
            : `untagged ${x.accountName}`,
      });
    }
  }
  return { steps, bills: [...bills] };
}

/** Replaces { $ref } with { value: id } (QBO reference shape). Missing refs are reported, never guessed. */
export function resolveQboRefs(
  v: unknown,
  map: QboIdMap,
  missing: string[] = [],
): unknown {
  if (Array.isArray(v)) return v.map((x) => resolveQboRefs(x, map, missing));
  if (v && typeof v === "object") {
    if ("$ref" in v) {
      const [kind, ...rest] = String((v as Ref).$ref).split(":");
      const id = map[kind as keyof QboIdMap]?.[rest.join(":")];
      if (!id) missing.push((v as Ref).$ref);
      const extra = Object.fromEntries(
        Object.entries(v).filter(([k]) => k !== "$ref"),
      );
      return { value: id ?? null, ...extra };
    }
    return Object.fromEntries(
      Object.entries(v).map(([k, x]) => [k, resolveQboRefs(x, map, missing)]),
    );
  }
  return v;
}

// ---------------------------------------------------------------- client (sandbox only)

export type Tokens = {
  accessToken: string | null;
  accessTokenExpiresAt: number | null;
  refreshToken: string;
};

export function writePrivateJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2), { mode: 0o600 });
  renameSync(tmp, path);
}
export function readJsonOrNull<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

export function qboSeedAuthFromEnv(
  env: Record<string, string | undefined> = process.env,
) {
  const {
    QBO_CLIENT_ID: clientId,
    QBO_CLIENT_SECRET: clientSecret,
    QBO_REALM_ID: realmId,
  } = env;
  if (!clientId || !clientSecret || !realmId)
    throw new Error(
      "QBO_CLIENT_ID, QBO_CLIENT_SECRET and QBO_REALM_ID must be set",
    );
  return { clientId, clientSecret, realmId };
}

/** Every request URL is built here; anything that is not the sandbox host is refused. */
export function sandboxUrl(
  realmId: string,
  path: string,
  query: Record<string, string> = {},
): string {
  const url = `${QBO_SANDBOX_BASE}/company/${encodeURIComponent(realmId)}/${path}?${new URLSearchParams({ ...query, minorversion: QBO_MINOR_VERSION })}`;
  if (!url.startsWith("https://sandbox-quickbooks.api.intuit.com/"))
    throw new Error(`refusing non-sandbox QuickBooks host: ${url}`);
  return url;
}

export class QboSeedClient {
  private tokens: Tokens;
  private last = 0;
  constructor(
    private auth: { clientId: string; clientSecret: string; realmId: string },
    private fetchImpl: typeof fetch = fetch,
    private sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((r) => setTimeout(r, ms)),
    initial?: Tokens,
  ) {
    const t = initial ?? readJsonOrNull<Tokens>(QBO_SEED_TOKEN_PATH);
    if (!t)
      throw new Error(
        `no QBO seed token at ${QBO_SEED_TOKEN_PATH}; run \`bun run seed/push-qbo.ts init-token <refresh token>\` (OAuth Playground, sandbox)`,
      );
    this.tokens = t;
  }

  private async refresh() {
    const res = await this.fetchImpl(QBO_TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.auth.clientId}:${this.auth.clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: this.tokens.refreshToken,
      }),
    });
    if (!res.ok)
      throw new Error(`QBO token refresh failed: HTTP ${res.status}`);
    const j = (await res.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in?: number;
    };
    this.tokens = {
      accessToken: j.access_token,
      accessTokenExpiresAt: Date.now() + (j.expires_in ?? 3600) * 1000,
      refreshToken: j.refresh_token,
    };
    writePrivateJson(QBO_SEED_TOKEN_PATH, this.tokens);
  }

  /** At most 10 requests/s; on 429 sleep 60 s (plan step 4). */
  async request(
    method: "GET" | "POST",
    url: string,
    body?: unknown,
  ): Promise<Rec> {
    for (let attempt = 1; attempt <= 5; attempt++) {
      const wait = this.last + 110 - Date.now();
      if (wait > 0) await this.sleep(wait);
      this.last = Date.now();
      if (
        !this.tokens.accessToken ||
        (this.tokens.accessTokenExpiresAt ?? 0) - 60_000 < Date.now()
      )
        await this.refresh();
      const res = await this.fetchImpl(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.tokens.accessToken}`,
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (res.status === 429) {
        await this.sleep(60_000);
        continue;
      }
      if (res.status === 401 && attempt === 1) {
        this.tokens.accessToken = null;
        continue;
      }
      const json = (await res.json().catch(() => ({}))) as Rec;
      if (!res.ok || json.Fault)
        throw new Error(
          `QBO ${method} ${url.split("?")[0].split("/v3/")[1]}: HTTP ${res.status} ${JSON.stringify(json.Fault ?? json).slice(0, 300)}`,
        );
      return json;
    }
    throw new Error("QBO request failed after retries");
  }

  query(sql: string) {
    if (!/^\s*select\s/i.test(sql)) throw new Error("query() runs SELECT only");
    return this.request(
      "GET",
      sandboxUrl(this.auth.realmId, "query", { query: sql }),
    );
  }
  create(entity: string, body: Rec) {
    return this.request(
      "POST",
      sandboxUrl(this.auth.realmId, entity.toLowerCase()),
      body,
    );
  }
  /** Deletes one of OUR transactions (Purchase or Bill). Callers must have checked the marker. */
  deleteTxn(entity: "Purchase" | "Bill", id: string, syncToken: string) {
    return this.request(
      "POST",
      sandboxUrl(this.auth.realmId, entity.toLowerCase(), {
        operation: "delete",
      }),
      { Id: id, SyncToken: syncToken },
    );
  }
}
