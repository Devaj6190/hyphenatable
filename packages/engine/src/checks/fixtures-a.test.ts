// Acceptance: CHK-01..06 against A's planted errors in Company A, cycle a-c05.
// A flag matches an answer-key row when checkId is equal and the subject ids overlap
// (entryIds, or workerId when the row has none). Precision target: zero unexplained flags.
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { Company, Cycle, type Flag, TimeEntry, Worker } from "../schemas";
import { valid } from "./__fixtures__/build";
import { checks, runAll } from "./index";

const raw = (file: string): unknown =>
  JSON.parse(
    readFileSync(
      new URL(`../../../../data/fixtures/a/${file}.json`, import.meta.url),
      "utf8",
    ),
  );

type KeyRow = { id: string; checkId: string; subject: Flag["subject"] };

const company = raw("company") as {
  settings: Record<string, unknown>;
} & Record<string, unknown>;
// ponytail: shim until A regenerates company.json with lowMarginPct; drop it then.
company.settings.lowMarginPct ??= 20;

const input = {
  company: Company.parse(company),
  cycle: Cycle.array()
    .parse(raw("cycles"))
    .find((c) => c.id === "a-c05") as Cycle,
  workers: Worker.array().parse(raw("workers")),
  timeEntries: TimeEntry.array().parse(raw("timeEntries")),
  jobs: [],
  visits: [],
  quotes: [],
  invoices: [],
  payments: [],
  expenses: [],
  pastCycles: { gross: {} },
  rules: [],
};

const ids = checks.filter((c) => c.id <= "CHK-06").map((c) => c.id as string);
const key = (raw("answer-key") as KeyRow[]).filter((r) =>
  ids.includes(r.checkId),
);
// The README's "expected but not keyed" list has nothing for CHK-01..06 (only CHK-23).

const matches = (f: Flag, r: KeyRow) =>
  f.checkId === r.checkId &&
  (r.subject.entryIds.length > 0
    ? r.subject.entryIds.some((id) => f.subject.entryIds.includes(id))
    : f.subject.workerId === r.subject.workerId);

test("CHK-01..06 catch every planted a-c05 error and nothing else", () => {
  expect(input.cycle).toBeDefined();
  const flags = valid(runAll(input)).filter((f) => ids.includes(f.checkId));

  const rows = ids.map((checkId) => {
    const keyed = key.filter((r) => r.checkId === checkId);
    const fired = flags.filter((f) => f.checkId === checkId);
    const caught = keyed.filter((r) => fired.some((f) => matches(f, r)));
    const explained = fired.filter((f) => keyed.some((r) => matches(f, r)));
    return {
      checkId,
      keyed: keyed.length,
      flags: fired.length,
      recall: `${caught.length}/${keyed.length}`,
      precision: `${explained.length}/${fired.length}`,
      missed: keyed.filter((r) => !caught.includes(r)).map((r) => r.id),
      unexplained: fired.filter((f) => !explained.includes(f)).map((f) => f.id),
    };
  });
  console.table(rows);

  for (const r of rows) {
    expect(r.missed, `${r.checkId} missed`).toEqual([]);
    expect(r.unexplained, `${r.checkId} unexplained`).toEqual([]);
  }
});
