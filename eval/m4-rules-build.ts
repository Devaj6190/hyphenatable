// Builds data/private/r/m4-rules.json (the M4 setup) from three private inputs:
//   owner-facts.json   what the owner stated (REAL first names: read here, never written or printed)
//   pseudonyms.json    ingest-r's map, real-name key → pseudonymous display name (anonymize.ts PseudonymMap)
//   out/*.json         ingest-r's anonymized bundles (worker ids, paid rows with pay-type amounts and hours)
// Names resolve to ids by the first-name word of the map's keys; ambiguous or missing names are counted as
// unresolved, never guessed. The output holds ids only; a leak check refuses to write if any word of a real
// name appears in it. Prints counts only.
//   bun run m4-rules-build.ts [--private data/private/r]
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { REPO, readJson } from "./lib/io";
import { AnonBundle, mergeBundles, type RSetup, STAGE2_PAY_TYPE } from "./m4-r";
import { insidePrivate } from "./m4-r-run";

const Weekday = z.enum([
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
]);
const WEEK = Weekday.options;

export const OwnerFacts = z.object({
  source: z.literal("owner_stated"),
  timezone: z.string(),
  payFrequency: z.enum(["weekly", "biweekly"]),
  overtime: z.object({
    workweekStartsOn: Weekday,
    weeklyHours: z.number().positive(),
    multiplier: z.number().positive(),
    dailyOvertime: z
      .array(
        z.object({
          overHours: z.number().positive(),
          multiplier: z.number().positive(),
        }),
      )
      .nullable(),
  }),
  longShiftReviewHours: z.number().positive().nullable(),
  venmo: z.object({
    latestCycle: z.array(z.string()),
    earlierCycle: z.array(z.string()),
    movedVenmoToGusto: z.array(z.string()),
  }),
  salaried: z.array(z.string()),
  commission: z.object({
    plan: z.unknown(),
    recordedRecipients: z.array(z.string()),
  }),
  managerProfitShare: z.object({ recipients: z.array(z.string()) }),
});
export type OwnerFacts = z.infer<typeof OwnerFacts>;

export const Pseudonyms = z.object({
  workers: z.record(z.string(), z.string()),
});

/** Same normalization as anonymize.ts `nameKey`: lowercase ASCII words, apostrophes join, sorted. */
export function nameWords(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ'’`]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}
export const nameKey = (s: string) => nameWords(s).sort().join(" ");

export type BuildCounts = {
  workers: number;
  hourly: number;
  multiRate: number;
  salaried: number;
  venmo: number;
  excludedOther: number;
  namesResolved: number;
  namesUnresolved: number;
  stage2Recipients: number;
};
export type Built = {
  setup: RSetup & { stage2RecipientIds: string[] };
  counts: BuildCounts;
};

export function buildRules(
  facts: OwnerFacts,
  pseudonyms: z.infer<typeof Pseudonyms>,
  bundle: AnonBundle,
): Built {
  const idsByDisplay = new Map<string, string[]>();
  for (const w of bundle.workers)
    idsByDisplay.set(w.displayName, [
      ...(idsByDisplay.get(w.displayName) ?? []),
      w.id,
    ]);
  const keys = Object.keys(pseudonyms.workers);
  let resolved = 0;
  let unresolved = 0;
  const toIds = (key: string | null): string[] => {
    const display = key === null ? undefined : pseudonyms.workers[key];
    const ids = display ? (idsByDisplay.get(display) ?? []) : [];
    if (ids.length) resolved++;
    else unresolved++;
    return ids;
  };
  /** A first name (one or more words): the map key that contains every word, if exactly one does. */
  const byFirst = (first: string) => {
    const ws = nameWords(first);
    const hits = ws.length
      ? keys.filter((k) => ws.every((w) => k.split(" ").includes(w)))
      : [];
    return toIds(hits.length === 1 ? hits[0] : null);
  };
  const byFull = (full: string) =>
    toIds(keys.includes(nameKey(full)) ? nameKey(full) : null);

  const moved = new Set(facts.venmo.movedVenmoToGusto.flatMap(byFirst));
  const venmo = new Set(
    [
      ...facts.venmo.latestCycle.flatMap(byFirst),
      ...facts.venmo.earlierCycle.flatMap(byFull),
    ].filter((id) => !moved.has(id)),
  );
  const salaried = new Set(facts.salaried.flatMap(byFirst));
  const stage2 = [
    ...new Set([
      ...facts.commission.recordedRecipients.flatMap(byFirst),
      ...facts.managerProfitShare.recipients.flatMap(byFirst),
    ]),
  ].sort();

  const regularRows = (id: string) =>
    bundle.paid.filter(
      (p) => p.workerId === id && (p.sectionKind ?? "regular") === "regular",
    );
  const workers: RSetup["workers"] = [];
  const excluded: NonNullable<RSetup["excluded"]> = [];
  const counts = {
    hourly: 0,
    multiRate: 0,
    salaried: 0,
    venmo: 0,
    excludedOther: 0,
  };
  for (const w of [...bundle.workers].sort((a, b) =>
    a.id.localeCompare(b.id),
  )) {
    const rows = regularRows(w.id);
    if (venmo.has(w.id)) {
      workers.push({
        id: w.id,
        payType: "contractor_venmo",
        rateCents: null,
        paymentUnit: null,
      });
      excluded.push({ id: w.id, reason: "paid outside Gusto" });
      counts.venmo++;
      continue;
    }
    if (rows.length && rows.every((p) => p.payKind === "owner_draw")) {
      excluded.push({ id: w.id, reason: "owner draw, not wages" });
      counts.excludedOther++;
      continue;
    }
    if (salaried.has(w.id)) {
      const amounts = [
        ...new Set(
          rows
            .map((p) => p.earningsCents?.Salary)
            .filter((x): x is number => typeof x === "number"),
        ),
      ];
      if (
        amounts.length === 1 &&
        rows.every((p) => p.earningsCents?.Salary === amounts[0])
      ) {
        workers.push({
          id: w.id,
          payType: "salary",
          rateCents: amounts[0],
          paymentUnit: "Paycheck",
        });
        counts.salaried++;
      } else {
        excluded.push({
          id: w.id,
          reason: "salaried: per-period salary not consistent in the journal",
        });
        counts.excludedOther++;
      }
      continue;
    }
    // Hourly: the Regular rate(s) the journal paid. Several distinct rates = the rate depends on the job role.
    const rates = new Set<number>();
    for (const p of rows) {
      if (p.payKind === "owner_draw") continue;
      for (const [name, h] of Object.entries(p.hours ?? {})) {
        if (!/^regular/i.test(name) || STAGE2_PAY_TYPE.test(name) || !(h > 0))
          continue;
        const rate =
          p.ratesCents?.[name] ??
          Math.round((p.earningsCents?.[name] ?? 0) / h);
        if (rate > 0) rates.add(rate);
      }
    }
    if (rates.size === 0) {
      excluded.push({ id: w.id, reason: "no regular rate in the journal" });
      counts.excludedOther++;
    } else if (rates.size === 1) {
      workers.push({
        id: w.id,
        payType: "hourly",
        rateCents: [...rates][0],
        paymentUnit: "Hour",
      });
      counts.hourly++;
    } else {
      workers.push({
        id: w.id,
        payType: "hourly",
        rateCents: null,
        paymentUnit: "Hour",
        multiRate: true,
        rates: [...rates].sort((a, b) => a - b),
      });
      counts.multiRate++;
    }
  }

  const o = facts.overtime;
  const start = WEEK.indexOf(o.workweekStartsOn);
  const rules: RSetup["rules"] = [
    {
      id: "r-m4-rule-ot",
      companyId: bundle.companyId,
      type: "overtime_policy",
      params: {
        workweek: `${o.workweekStartsOn}-${WEEK[(start + 6) % 7]}`,
        weeklyHours: o.weeklyHours,
        multiplier: o.multiplier,
        dailyHours: null,
        ...(o.dailyOvertime
          ? {
              daily: o.dailyOvertime,
              weekly: { overHours: o.weeklyHours, multiplier: o.multiplier },
            }
          : {}),
        seventhConsecutiveDay: null,
      },
      status: "active",
    },
  ];
  if (facts.longShiftReviewHours !== null)
    rules.push({
      id: "r-m4-rule-long",
      companyId: bundle.companyId,
      type: "long_shift_threshold",
      params: { hours: facts.longShiftReviewHours },
      status: "active",
    });
  return {
    setup: {
      source: "owner_stated",
      timezone: facts.timezone,
      payFrequency: facts.payFrequency,
      workers,
      rules,
      excluded,
      stage2RecipientIds: stage2,
    },
    counts: {
      workers: bundle.workers.length,
      ...counts,
      namesResolved: resolved,
      namesUnresolved: unresolved,
      stage2Recipients: stage2.length,
    },
  };
}

/** Throws if any word of a real name (from the facts or the map keys) appears in `json`. */
export function assertNoNames(
  json: string,
  facts: OwnerFacts,
  pseudonyms: z.infer<typeof Pseudonyms>,
) {
  const real = new Set([
    ...[
      ...facts.venmo.latestCycle,
      ...facts.venmo.earlierCycle,
      ...facts.venmo.movedVenmoToGusto,
      ...facts.salaried,
      ...facts.commission.recordedRecipients,
      ...facts.managerProfitShare.recipients,
    ].flatMap(nameWords),
    ...Object.keys(pseudonyms.workers).flatMap((k) => k.split(" ")),
  ]);
  const leaked = nameWords(json).filter((w) => real.has(w) && w.length > 1);
  if (leaked.length)
    throw new Error(
      `refusing to write: ${leaked.length} real-name word(s) in the output`,
    );
}

export function runBuild(privateDir: string): BuildCounts {
  if (!insidePrivate(privateDir))
    throw new Error("the Company R directory must be inside data/private/");
  const facts = OwnerFacts.parse(
    readJson(join(privateDir, "owner-facts.json")),
  );
  const pseudonyms = Pseudonyms.parse(
    readJson(join(privateDir, "pseudonyms.json")),
  );
  const outDir = join(privateDir, "out");
  const files = existsSync(outDir)
    ? readdirSync(outDir)
        .filter((f) => f.endsWith(".json"))
        .sort()
    : [];
  if (!files.length) throw new Error("no ingest-r output");
  const bundle = mergeBundles(
    files.map((f) => AnonBundle.parse(readJson(join(outDir, f)))),
  );
  const { setup, counts } = buildRules(facts, pseudonyms, bundle);
  const json = `${JSON.stringify(setup, null, 2)}\n`;
  assertNoNames(json, facts, pseudonyms);
  writeFileSync(join(privateDir, "m4-rules.json"), json, { mode: 0o600 });
  return counts;
}

if (import.meta.main) {
  const i = process.argv.indexOf("--private");
  const dir =
    i >= 0 && process.argv[i + 1]
      ? process.argv[i + 1]
      : join(REPO, "data/private/r");
  const c = runBuild(dir);
  console.log(
    `m4-rules.json: ${c.workers} workers; ${c.hourly} hourly (one rate), ${c.multiRate} multi-rate, ${c.salaried} salaried, ${c.venmo} Venmo (excluded), ${c.excludedOther} other excluded; names resolved ${c.namesResolved}, unresolved ${c.namesUnresolved}; ${c.stage2Recipients} Stage 2 recipients`,
  );
}
