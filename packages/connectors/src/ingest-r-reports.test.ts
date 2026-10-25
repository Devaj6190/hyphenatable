// ingest-r with the Jobber report CSVs, on SYNTHETIC replicas (fake names, clients, addresses).
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { JOBBER_TIMESHEETS_CSV } from "./exports/__fixtures__/make-r-replicas.ts";
import {
  EXPENSE_REPORT_CSV,
  INVOICES_REPORT_CSV,
  ONE_OFF_JOBS_CSV,
  QUOTES_REPORT_CSV,
  RECURRING_JOBS_CSV,
  TRANSACTION_LIST_CSV,
} from "./exports/__fixtures__/make-r-report-replicas.ts";
import { ingestR } from "./ingest-r.ts";

describe("ingest-r with Jobber report CSVs (replicas)", () => {
  it("anonymizes every report into joined worker / client / job ids; no free text or real name survives", async () => {
    const dir = join(await mkdtemp(join(tmpdir(), "pp-rrep-")), "r");
    await mkdir(dir, { recursive: true });
    const files: Record<string, string> = {
      "Timesheets.csv": JOBBER_TIMESHEETS_CSV,
      "Expense Report.csv": EXPENSE_REPORT_CSV,
      "Transaction List.csv": TRANSACTION_LIST_CSV,
      "Invoices Report.csv": INVOICES_REPORT_CSV,
      "Quotes Report.csv": QUOTES_REPORT_CSV,
      "One-off Jobs.csv": ONE_OFF_JOBS_CSV,
      "Recurring Jobs.csv": RECURRING_JOBS_CSV,
    };
    for (const [n, t] of Object.entries(files))
      await writeFile(join(dir, n), t);
    const p = (n: string) => [join(dir, n)];
    const c = await ingestR({
      privateDir: dir,
      timezone: "America/New_York",
      timesheets: p("Timesheets.csv"),
      journals: [],
      jobberExpenses: p("Expense Report.csv"),
      transactions: p("Transaction List.csv"),
      invoices: p("Invoices Report.csv"),
      quotes: p("Quotes Report.csv"),
      jobsOneOff: p("One-off Jobs.csv"),
      jobsRecurring: p("Recurring Jobs.csv"),
      now: () => new Date("2026-10-24T12:00:00Z"),
    });
    expect(c).toMatchObject({
      jobberExpenses: 3,
      laborPaidAsExpense: 1,
      transactions: 4,
      invoices: 2,
      quotes: 2,
      jobsReport: 3,
    });
    expect(c.syncRuns.every((s) => s.complete)).toBe(true);

    const out = await readFile(c.outPath as string, "utf8");
    const b = JSON.parse(out);
    const avery = b.timeEntries.find(
      (e: { teamLeader?: boolean; workerId: string }) => e,
    )?.workerId;
    // one person, one worker id across timesheets and reports
    expect(b.jobberExpenses[0].enteredByWorkerId).toBe(avery);
    expect(b.invoices[1].salespersonWorkerId).toBe(avery);
    // one job number, one job id across expense, transactions, invoice, quote and jobs report
    const j527 = b.jobberExpenses[0].jobId;
    expect([
      b.transactions[0].jobIds[0],
      b.invoices[0].jobIds[0],
      b.quotes[0].jobIds[0],
      b.jobsReport[0].jobId,
    ]).toEqual([j527, j527, j527, j527]);
    // payments positive, refunds negative; deposit vs final
    expect(
      b.transactions.map((t: { kind: string; amountCents: number }) => [
        t.kind,
        t.amountCents,
      ]),
    ).toEqual([
      ["invoice", 125040],
      ["final", 95040],
      ["deposit", 30000],
      ["refund", -5000],
    ]);
    expect(b.jobberExpenses[2]).toMatchObject({
      kind: "labor_paid_as_expense",
      category: "labor",
      hasDetails: true,
      reimbursableToWorkerId: null,
    });
    expect(b.jobsReport.map((r: { kind: string }) => r.kind)).toEqual([
      "one_off",
      "one_off",
      "recurring",
    ]);
    expect(b.clients.map((x: { name: string }) => x.name).sort()).toEqual([
      "Client C01",
      "Client C02",
    ]);

    for (const s of [
      "Avery",
      "Jordan",
      "Brookside",
      "Maple",
      "Fake Lane",
      "Fake Road",
      "02134",
      "3 yards",
      "Spring cleanup",
      "Weekly lawn",
      "Hedge trim",
      "Pat Quinlan",
      "Mulch install",
    ]) {
      expect(out).not.toContain(s);
    }
    const tokens = (await readFile(join(dir, "real-tokens.txt"), "utf8"))
      .trim()
      .split("\n");
    for (const t of tokens)
      expect(out.toLowerCase()).not.toMatch(new RegExp(`\\b${t}\\b`));
  });
});
