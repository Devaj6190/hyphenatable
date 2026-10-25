// ingest-r with the QBO Transaction Detail by Account workbook and Venmo statements, on SYNTHETIC replicas.
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  tdaWorkbook,
  VENMO_CSV,
} from "./exports/__fixtures__/make-r-money-replicas.ts";
import { JOBBER_TIMESHEETS_CSV } from "./exports/__fixtures__/make-r-replicas.ts";
import { EXPENSE_REPORT_CSV } from "./exports/__fixtures__/make-r-report-replicas.ts";
import { ingestR } from "./ingest-r.ts";

describe("ingest-r with the QBO ledger and Venmo (replicas)", () => {
  it("turns payees into worker ids or pseudonyms, funding into tokens, notes into classes; nothing real survives", async () => {
    const dir = join(await mkdtemp(join(tmpdir(), "pp-rmoney-")), "r");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "Timesheets.csv"), JOBBER_TIMESHEETS_CSV);
    await writeFile(join(dir, "Expense Report.csv"), EXPENSE_REPORT_CSV);
    await writeFile(join(dir, "Owner Fake TDA.xlsx"), await tdaWorkbook());
    await writeFile(join(dir, "VenmoStatement_Sep_2026.csv"), VENMO_CSV);
    const c = await ingestR({
      privateDir: dir,
      timezone: "America/New_York",
      timesheets: [join(dir, "Timesheets.csv")],
      journals: [],
      jobberExpenses: [join(dir, "Expense Report.csv")],
      qboLedger: [join(dir, "Owner Fake TDA.xlsx")],
      venmo: [join(dir, "VenmoStatement_Sep_2026.csv")],
      now: () => new Date("2026-10-24T12:00:00Z"),
    });
    expect(c).toMatchObject({ ledgerLines: 4, venmo: 6, venmoToWorkers: 3 });
    expect(c.syncRuns.every((s) => s.complete)).toBe(true);

    const out = await readFile(c.outPath as string, "utf8");
    const b = JSON.parse(out);
    const workerIds = new Set(b.workers.map((w: { id: string }) => w.id));
    const jordan = b.jobberExpenses[1].reimbursableToWorkerId;

    // ledger: a worker payee is a worker id, everyone else a vendor pseudonym; descriptions become categories
    expect(b.ledger.map((l: { vendor: string | null }) => l.vendor)).toEqual([
      "Vendor V01",
      "Vendor V01",
      "Vendor V02",
      null,
    ]);
    expect(workerIds.has(b.ledger[3].payeeWorkerId)).toBe(true);
    expect(b.ledger[0]).toMatchObject({
      accountName: "Job Supplies",
      amountCents: 21437,
      category: "mulch",
      splitAccount: "bank:A",
    });

    // venmo: classes; the Jordan payment equals the Jobber gas expense (+1 day) so it is a reimbursement
    expect(b.venmo.map((v: { class: string }) => v.class)).toEqual([
      "wage",
      "reimbursement",
      "personal_or_unknown",
      "tip",
      "personal_or_unknown",
      "personal_or_unknown",
    ]);
    expect(b.venmo[1]).toMatchObject({
      counterpartyWorkerId: jordan,
      matchedExpenseId: b.jobberExpenses[1].id,
    });
    // "sam" (first name only, unique) is Sam Okafor, the ledger's worker payee
    expect(b.venmo[3].counterpartyWorkerId).toBe(b.ledger[3].payeeWorkerId);
    expect(b.venmo[2]).toMatchObject({
      counterparty: "Party P01",
      counterpartyWorkerId: null,
      fundingToken: "venmo_balance",
    });
    expect(
      b.venmo.map((v: { fundingToken: string | null }) => v.fundingToken),
    ).toEqual([
      "bank:B",
      "bank:B",
      "venmo_balance",
      "bank:C",
      null,
      "venmo_balance",
    ]);
    expect(b.venmo[5].destinationToken).toBe("bank:B");
    expect(b.venmoSummary.byClass).toEqual({
      wage: { count: 1, cents: -60000 },
      reimbursement: { count: 1, cents: -4800 },
      personal_or_unknown: { count: 3, cents: -3550 },
      tip: { count: 1, cents: -4000 },
    });
    expect(b.venmoSummary.byFunding["bank:B"]).toEqual({
      count: 2,
      outCents: 64800,
      inCents: 0,
      workerPayments: 2,
    });
    expect(c.venmoByClass).toContain("personal_or_unknown 3");

    for (const s of [
      "Avery",
      "Jordan",
      "Okafor",
      "Riley",
      "Owner",
      "Hollis",
      "Quikfill",
      "Fakebank",
      "Otherbank",
      "1234",
      "9876",
      "dinner",
      "rent share",
      "grabbing",
      "9/14",
      "Brookside",
      "topsoil",
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
