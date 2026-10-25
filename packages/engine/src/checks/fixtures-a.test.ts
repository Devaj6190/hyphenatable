// Acceptance: the checks against A's planted errors in Company A, cycles a-c05 and a-c06.
// A flag matches an answer-key row when checkId is equal and the subject ids overlap, on the row's
// most specific ids: entryIds, else expenseIds, else jobId, else workerId.
// Precision target: zero unexplained flags.
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import {
  Company,
  Cycle,
  Expense,
  type Flag,
  Invoice,
  Job,
  PastPayroll,
  Payment,
  Quote,
  Rule,
  TimeEntry,
  Visit,
  Worker,
} from "../schemas";
import { valid } from "./__fixtures__/build";
import { pastGross } from "./CHK-22";
import { checks, runAll } from "./index";
import type { CheckInput } from "./types";

const raw = (file: string): unknown[] => {
  const read = (dir: string) =>
    JSON.parse(
      readFileSync(
        new URL(
          `../../../../data/fixtures/a/${dir}${file}.json`,
          import.meta.url,
        ),
        "utf8",
      ),
    );
  // a-c06 ships as an extension folder: concatenate it onto the base file when it exists.
  let ext: unknown[] = [];
  try {
    ext = read("cycles/a-c06/");
  } catch {}
  return [read("")].flat().concat(ext);
};

type KeyRow = {
  id: string;
  cycleId?: string;
  checkId: string;
  subject: Flag["subject"];
};

const cycles = Cycle.array().parse(raw("cycles"));
const pastPayrolls = PastPayroll.array().parse(raw("pastPayrolls"));
const base = {
  company: Company.parse(raw("company")[0]),
  workers: Worker.array().parse(raw("workers")),
  timeEntries: TimeEntry.array().parse(raw("timeEntries")),
  jobs: Job.array().parse(raw("jobs")),
  visits: Visit.array().parse(raw("visits")),
  quotes: Quote.array().parse(raw("quotes")),
  invoices: Invoice.array().parse(raw("invoices")),
  payments: Payment.array().parse(raw("payments")),
  expenses: Expense.array().parse(raw("expenses")),
  // The fixture rules are `proposed` (what onboarding proposes); tests treat them as approved.
  rules: Rule.array()
    .parse(raw("rules"))
    .map((r) => ({ ...r, status: "active" as const })),
};
const inputFor = (cycleId: string): CheckInput => {
  const cycle = cycles.find((c) => c.id === cycleId) as Cycle;
  return {
    ...base,
    cycle,
    pastCycles: { gross: pastGross(cycle, cycles, pastPayrolls) },
  };
};
const key = raw("answer-key") as KeyRow[];

const matches = (f: Flag, r: KeyRow) => {
  if (f.checkId !== r.checkId) return false;
  const s = r.subject;
  if (s.entryIds.length)
    return s.entryIds.some((id) => f.subject.entryIds.includes(id));
  if (s.expenseIds.length)
    return s.expenseIds.some((id) => f.subject.expenseIds.includes(id));
  if (s.jobId) return f.subject.jobId === s.jobId;
  return f.subject.workerId === s.workerId;
};

// CHK-07..12 and CHK-23 are covered by their own tests (CHK-10/11 are being reworked elsewhere);
// the README's "expected but not keyed" list has only CHK-23.
const ids = checks
  .map((c) => c.id as string)
  .filter((id) => id <= "CHK-06" || (id >= "CHK-13" && id <= "CHK-22"));

for (const cycleId of ["a-c05", "a-c06"])
  test(`${cycleId}: CHK-01..06 and CHK-13..22 catch every planted error and nothing else`, () => {
    const input = inputFor(cycleId);
    expect(input.cycle).toBeDefined();
    const flags = valid(runAll(input)).filter((f) => ids.includes(f.checkId));
    const rows = key.filter(
      (r) => ids.includes(r.checkId) && (r.cycleId ?? "a-c05") === cycleId,
    );

    const table = ids.map((checkId) => {
      const keyed = rows.filter((r) => r.checkId === checkId);
      const fired = flags.filter((f) => f.checkId === checkId);
      const caught = keyed.filter((r) => fired.some((f) => matches(f, r)));
      const explained = fired.filter((f) => keyed.some((r) => matches(f, r)));
      return {
        checkId,
        recall: `${caught.length}/${keyed.length}`,
        precision: `${explained.length}/${fired.length}`,
        missed: keyed.filter((r) => !caught.includes(r)).map((r) => r.id),
        unexplained: fired
          .filter((f) => !explained.includes(f))
          .map((f) => f.id),
      };
    });
    console.table(table);

    for (const r of table) {
      expect(r.missed, `${r.checkId} missed`).toEqual([]);
      expect(r.unexplained, `${r.checkId} unexplained`).toEqual([]);
    }
  });
