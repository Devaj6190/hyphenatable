// Synthetic inputs only (shaped like A1's real ingest-r output): these tests never read data/private.
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { VENMO_CSV } from "../../packages/connectors/src/exports/__fixtures__/make-r-money-replicas.ts";
import {
  GUSTO_JOURNAL_SECTIONED_CSV,
  JOBBER_TIMESHEETS_CSV,
} from "../../packages/connectors/src/exports/__fixtures__/make-r-replicas.ts";
import {
  EXPENSE_REPORT_CSV,
  INVOICES_REPORT_CSV,
  ONE_OFF_JOBS_CSV,
  QUOTES_REPORT_CSV,
  RECURRING_JOBS_CSV,
  TRANSACTION_LIST_CSV,
} from "../../packages/connectors/src/exports/__fixtures__/make-r-report-replicas.ts";
import { ingestR } from "../../packages/connectors/src/ingest-r.ts";
import { leakCheck, manifest, packageFiles, REPO } from "../build-r-package";
import { buildRPackage, type RPackage, type RRules } from "../lib/r-package";

type R = Record<string, unknown>;
const te = (id: string, workerId: string, date: string, over: R = {}) => ({
  id,
  companyId: "r",
  cycleId: null,
  sourceId: `xlsx:f1#${id}`,
  workerId,
  jobId: "r:j:1",
  visitId: null,
  startAt: `${date}T11:00:00.000Z`,
  endAt: `${date}T19:00:00.000Z`,
  durationSec: 28800,
  ticking: null,
  approved: true,
  approvedBy: null,
  payable: null,
  category: "GENERAL",
  label: null,
  hasNote: false,
  date,
  clientRef: "r:c:1",
  ...over,
});
const bundle = {
  namesAnonymized: true,
  companyId: "r",
  workers: [
    { id: "r:w:own", displayName: "Worker W01" },
    { id: "r:w:hrly", displayName: "Worker W02", teamLeader: true },
    { id: "r:w:norole", displayName: "Worker W03" },
    { id: "r:w:vm", displayName: "Worker W04" },
  ],
  clients: [{ id: "r:c:1", name: "Client C01" }],
  jobs: [
    { id: "r:j:1", jobNumber: 1, title: "Job J001" },
    { id: "r:j:gusto", jobNumber: 9001, title: "Job J9001" },
  ],
  timeEntries: [
    te("te:2", "r:w:hrly", "2026-09-22"),
    te("te:3", "r:w:hrly", "2026-10-06", {
      endAt: null,
      approved: null,
      category: null,
    }),
    te("te:4", "r:w:norole", "2026-09-23"),
    te("te:5", "r:w:hrly", "2026-10-20"),
  ],
  paid: [
    {
      workerId: "r:w:hrly",
      periodStart: "2026-09-21",
      periodEnd: "2026-10-04",
      checkDate: "2026-10-09",
      grossCents: 72000,
      sourceId: "csv:g1#row5",
      sectionKind: "regular",
      payKind: "wage",
      earningsCents: { Regular: 72000 },
      hours: { Regular: 36 },
      jobLines: [
        {
          jobId: "r:j:gusto",
          payType: "Regular",
          hours: 36,
          rateCents: 2000,
          amountCents: 72000,
        },
      ],
      ownerDrawCents: 0,
    },
    {
      workerId: "r:w:hrly",
      periodStart: "2026-09-21",
      periodEnd: "2026-10-04",
      checkDate: "2026-10-12",
      grossCents: 5000,
      sourceId: "csv:g1#row9",
      sectionKind: "off_cycle",
      payKind: "wage",
      earningsCents: { Commission: 5000 },
      hours: {},
      jobLines: [],
      ownerDrawCents: 0,
    },
    {
      workerId: "r:w:hrly",
      periodStart: "2026-09-21",
      periodEnd: "2026-10-04",
      checkDate: null,
      grossCents: 100,
      sourceId: "csv:g1#row11",
      sectionKind: "other",
      payKind: "wage",
      jobLines: [],
      ownerDrawCents: 0,
    },
    {
      workerId: "r:w:own",
      periodStart: "2026-09-21",
      periodEnd: "2026-10-04",
      checkDate: "2026-10-09",
      grossCents: 0,
      sourceId: "csv:g1#row7",
      sectionKind: "regular",
      payKind: "owner_draw",
      jobLines: [],
      ownerDrawCents: 300000,
    },
  ],
  paidByPeriod: [],
  expenses: [
    {
      id: "export:qbo:q1:1:2",
      companyId: "r",
      source: "qbo",
      sourceId: "xlsx:q1#s1row2",
      date: "2026-09-24",
      amountCents: 12345,
      vendor: "Vendor V01",
      description: null,
      accountName: "Materials",
      customerRef: "r:j:1",
      paymentType: "Expense",
      kind: "unknown",
      matchedJobId: null,
      matchConfidence: null,
      reimbursableToWorkerId: null,
      reimbursementStatus: null,
    },
  ],
  jobberExpenses: [
    {
      id: "je:1",
      sourceId: "jobber-expense#1",
      date: "2026-09-23",
      amountCents: 8800,
      jobId: "r:j:1",
      enteredByWorkerId: "r:w:hrly",
      reimbursableToWorkerId: "r:w:hrly",
      clientRef: "r:c:1",
      hasDetails: true,
      category: "fuel",
      kind: "expense",
    },
    {
      id: "je:2",
      sourceId: "jobber-expense#2",
      date: "2026-09-24",
      amountCents: 3000,
      jobId: null,
      enteredByWorkerId: null,
      reimbursableToWorkerId: "r:w:norole",
      clientRef: null,
      hasDetails: false,
      category: null,
      kind: "expense",
    },
  ],
  transactions: [
    {
      id: "tx:1",
      sourceId: "tx#1",
      date: "2026-09-12",
      type: "Deposit",
      kind: "deposit",
      amountCents: 45000,
      jobIds: ["r:j:1"],
      method: "Credit card",
      clientRef: "r:c:1",
    },
    {
      id: "tx:2",
      sourceId: "tx#2",
      date: "2026-10-08",
      type: "Payment",
      kind: "final",
      amountCents: 105000,
      jobIds: ["r:j:1"],
      method: "Check",
      clientRef: "r:c:1",
    },
    {
      id: "tx:3",
      sourceId: "tx#3",
      date: "2026-10-01",
      type: "Invoice",
      kind: "invoice",
      amountCents: 150000,
      jobIds: ["r:j:1"],
      method: null,
      clientRef: "r:c:1",
    },
    {
      id: "tx:4",
      sourceId: "tx#4",
      date: "2026-10-09",
      type: "Refund",
      kind: "refund",
      amountCents: -2000,
      jobIds: ["r:j:1"],
      method: "Check",
      clientRef: "r:c:1",
    },
  ],
  invoices: [
    {
      id: "inv:1",
      sourceId: "inv#7",
      invoiceNumber: "7",
      jobIds: ["r:j:1"],
      clientRef: "r:c:1",
      salespersonWorkerId: null,
      createdDate: "2026-10-01",
      issuedDate: "2026-10-01",
      dueDate: "2026-10-15",
      paidDate: null,
      subtotalCents: 150000,
      taxCents: 0,
      totalCents: 150000,
      balanceCents: 105000,
      depositCents: 45000,
      status: "awaiting_payment",
      category: null,
    },
  ],
  quotes: [
    {
      id: "quo:1",
      sourceId: "quo#12",
      quoteNumber: "12",
      jobIds: ["r:j:1"],
      clientRef: "r:c:1",
      salespersonWorkerId: "r:w:norole",
      draftedDate: "2026-09-08",
      sentDate: "2026-09-10",
      approvedDate: "2026-09-11",
      convertedDate: "2026-09-12",
      totalCents: 150000,
      depositCents: 45000,
      status: "converted",
      category: null,
    },
  ],
  jobsReport: [
    {
      id: "jr:1",
      sourceId: "one-off#1",
      jobId: "r:j:1",
      kind: "one_off",
      clientRef: "r:c:1",
      salespersonWorkerId: "r:w:norole",
      createdDate: "2026-09-01",
      startDate: "2026-09-22",
      endDate: "2026-09-30",
      closedDate: null,
      totalCents: 150000,
      status: "archived",
      category: null,
    },
  ],
  ledger: [],
  venmo: [
    {
      id: "venmo:1",
      sourceId: "venmo#4001",
      datetime: "2026-09-25T15:00:00.000Z",
      venmoType: "Payment",
      status: "Complete",
      direction: "out",
      amountCents: -40000,
      tipCents: null,
      feeCents: null,
      counterpartyWorkerId: "r:w:vm",
      counterparty: null,
      fundingToken: null,
      destinationToken: null,
      class: "wage",
      noteClass: "wage",
      matchedExpenseId: null,
      hasNote: true,
    },
    {
      id: "venmo:2",
      sourceId: "venmo#4002",
      datetime: "2026-09-26T15:00:00.000Z",
      venmoType: "Payment",
      status: "Complete",
      direction: "out",
      amountCents: -2500,
      tipCents: null,
      feeCents: null,
      counterpartyWorkerId: "r:w:hrly",
      counterparty: null,
      fundingToken: null,
      destinationToken: null,
      class: "reimbursement",
      noteClass: "reimbursement",
      matchedExpenseId: "je:1",
      hasNote: true,
    },
    {
      id: "venmo:3",
      sourceId: "venmo#4003",
      datetime: "2026-09-27T15:00:00.000Z",
      venmoType: "Payment",
      status: "Complete",
      direction: "out",
      amountCents: -1000,
      tipCents: null,
      feeCents: null,
      counterpartyWorkerId: null,
      counterparty: "Party P01",
      fundingToken: null,
      destinationToken: null,
      class: "personal_or_unknown",
      noteClass: "unknown",
      matchedExpenseId: null,
      hasNote: false,
    },
    {
      id: "venmo:4",
      sourceId: "venmo#4004",
      datetime: "2026-09-28T15:00:00.000Z",
      venmoType: "Payment",
      status: "Complete",
      direction: "out",
      amountCents: -2000,
      tipCents: null,
      feeCents: null,
      counterpartyWorkerId: "r:w:hrly",
      counterparty: null,
      fundingToken: null,
      destinationToken: null,
      class: "tip",
      noteClass: "tip",
      matchedExpenseId: null,
      hasNote: true,
    },
  ],
  venmoSummary: { byClass: {}, byFunding: {} },
};
const rules: RRules = {
  timezone: "America/New_York",
  payFrequency: "biweekly",
  rules: [
    {
      id: "r-rule-1",
      type: "overtime_policy",
      params: { weeklyHours: 40, multiplier: 1.5 },
      status: "active",
    },
    {
      id: "r-rule-2",
      type: "expense_account_kind",
      params: { accountName: "Materials", kind: "job_cost" },
      status: "active",
    },
  ],
};
const roles = {
  "r:w:hrly": "field",
  "r:w:vm": "field",
  "r:w:own": "owner",
} as const;
const opts = {
  current: { start: "2026-10-05", end: "2026-10-18" },
  roles,
  noSalaried: true,
};
const full = {
  ...opts,
  settings: {
    longShiftHours: 11,
    grossChangePct: 25,
    employeesMayBeTexted: false,
    lowMarginPct: 20,
  },
};

function checkFolders(p: RPackage) {
  const dir = mkdtempSync(join(tmpdir(), "rpkg-"));
  for (const [rel, text] of Object.entries(packageFiles(p))) {
    mkdirSync(join(dir, rel, ".."), { recursive: true });
    writeFileSync(join(dir, rel), text);
  }
  for (const d of ["history", "current"]) {
    const r = spawnSync(
      "bun",
      [
        "run",
        join(REPO, "packages/engine/scripts/check-fixtures.ts"),
        join(dir, d),
      ],
      { encoding: "utf8" },
    );
    expect(`${r.stdout}${r.stderr}`).not.toContain("FAIL");
    expect(r.status).toBe(0);
  }
}

describe("Company R package (synthetic, A1-shaped inputs)", () => {
  const p = buildRPackage([bundle] as never, rules, full);
  const c = p.current as Record<string, R[]>;
  const h = p.history as Record<string, R[]>;

  test("cycles: journal periods plus the current unpaid cycle", () => {
    expect(
      c["cycles.json"].map((x) => [x.periodStart, x.periodEnd, x.stage]),
    ).toEqual([
      ["2026-09-21", "2026-10-04", "closed"],
      ["2026-10-05", "2026-10-18", "setup"],
    ]);
  });

  test("pay type from evidence: journal hours x rate -> hourly, Venmo wage -> contractor_venmo; the rest blocked with reasons", () => {
    expect(
      c["workers.json"].map((w) => [w.id, w.role, w.payType]).sort(),
    ).toEqual([
      ["r:w:hrly", "field", "hourly"],
      ["r:w:vm", "field", "contractor_venmo"],
    ]);
    const why = Object.fromEntries(p.blocked.map((b) => [b.id, b.reason]));
    expect(why["r:w:own"]).toContain("owner paid by owner draws");
    expect(why["r:w:norole"]).toContain("role: none");
  });

  test("jobs from the jobs report only (journal-label jobs excluded); blocked salesperson nulled and recorded", () => {
    expect(
      c["jobs.json"].map((j) => [
        j.id,
        j.clientRef,
        j.salespersonWorkerId,
        j.quoteId,
        j.startAt,
      ]),
    ).toEqual([["r:j:1", "r:c:1", null, "quo:1", "2026-09-22T04:00:00.000Z"]]);
    expect(p.excluded.journalLabelJobs).toBe(1);
    expect(p.unresolved["jobs.salespersonUnresolved"]).toEqual(["jr:1"]);
    expect(p.unresolved["quotes.salespersonUnresolved"]).toEqual(["quo:1"]);
  });

  test("quotes, invoices: report fields mapped to contract fields", () => {
    expect(c["quotes.json"][0]).toMatchObject({
      id: "quo:1",
      jobId: "r:j:1",
      amountCents: 150000,
      sentAt: "2026-09-10T04:00:00.000Z",
      status: "converted",
      salespersonWorkerId: null,
    });
    expect(c["invoices.json"][0]).toMatchObject({
      id: "inv:1",
      jobId: "r:j:1",
      issuedDate: "2026-10-01",
      dueDate: "2026-10-15",
      totalCents: 150000,
    });
  });

  test("payments from transactions: deposit/final kept, refund -> unknown, invoice rows are not payments", () => {
    expect(
      c["payments.json"].map((x) => [x.id, x.kind, x.amountCents]).sort(),
    ).toEqual([
      ["tx:1", "deposit", 45000],
      ["tx:2", "final", 105000],
      ["tx:4", "unknown", -2000],
    ]);
    expect(p.excluded.invoiceTransactions).toBe(1);
  });

  test("expenses: QBO + Jobber expense report; reimbursable to a blocked worker stays unloadable", () => {
    const ex = c["expenses.json"];
    expect(
      ex
        .map((x) => [
          x.id,
          x.source,
          x.kind,
          x.matchedJobId,
          x.reimbursableToWorkerId,
        ])
        .sort(),
    ).toEqual([
      ["export:qbo:q1:1:2", "qbo", "job_cost", null, null],
      ["je:1", "jobber", "unknown", "r:j:1", "r:w:hrly"],
      ["venmo:2", "venmo", "unknown", null, "r:w:hrly"],
    ]);
    expect(p.unloadable.find((u) => u.id === "je:2")?.reasons[0]).toContain(
      "blocked",
    );
    // contract #116: Venmo reimbursements load as source "venmo"
    expect(ex.find((x) => x.id === "venmo:2")).toMatchObject({
      date: "2026-09-26",
      amountCents: 2500,
      reimbursementStatus: "PAID",
      sourceId: "venmo#4002",
    });
  });

  test("time entries: approved/payable/category never invented; after the current cycle is labelled, not an error", () => {
    // contract #110: approved/payable/category are nullable; nulls pass through, never defaulted
    const loaded = c["timeEntries.json"];
    expect(
      loaded.map((e) => [e.id, e.approved, e.payable, e.category, e.ticking]),
    ).toEqual([["te:2", true, null, "GENERAL", false]]);
    // no endAt and no ticking fact: ticking is still required, so te:3 stays unloadable
    expect(
      p.unloadable.find((u) => u.id === "te:3")?.reasons.join(" "),
    ).toContain("ticking");
    expect(
      p.unloadable.find((u) => u.id === "te:4")?.reasons.join(" "),
    ).toContain("blocked");
    expect(p.afterCurrentCycle).toEqual([
      { table: "timeEntries", id: "te:5", date: "2026-10-20" },
    ]);
  });

  test("past payrolls: Gusto wage rows (hours x rate lines) + Venmo wage (counterpartyWorkerId, datetime, |amount|); 'other' sections unloadable", () => {
    expect(
      c["pastPayrolls.json"]
        .map((x) => [x.workerId, x.paidVia, x.grossCents, x.sourceId])
        .sort(),
    ).toEqual([
      ["r:w:hrly", "gusto_off_cycle", 5000, "csv:g1#row9"],
      ["r:w:hrly", "gusto_regular", 72000, "csv:g1#row5"],
      ["r:w:vm", "venmo", 40000, "venmo#4001"],
    ]);
    expect(
      (
        c["pastPayrolls.json"].find((x) => x.paidVia === "gusto_regular")
          ?.earnings as R[]
      )[0],
    ).toEqual({
      name: "Regular",
      hours: 36,
      rateCents: 2000,
      amountCents: 72000,
    });
    expect(
      p.unloadable.find((u) => u.id === "pp:csv:g1#row11")?.reasons[0],
    ).toContain("neither regular nor off-cycle");
    expect(p.ownerDraws).toHaveLength(1);
    expect(p.excluded.personalOrUnknownVenmo).toBe(1);
    expect(p.excluded.venmoNotLoaded).toEqual({ tip: 1 });
  });

  test("history is a subset; the company row waits for settings", () => {
    expect(h["payments.json"].map((x) => x.id)).toEqual(["tx:1"]);
    expect(
      buildRPackage([bundle] as never, rules, opts).current["company.json"],
    ).toBeUndefined();
  });

  test("both folders pass the strict check-fixtures; manifest and leak check", () => {
    checkFolders(p);
    const m = manifest(p, "2026-10-25", { history: "ok", current: "ok" });
    expect(m).toContain("real, anonymized");
    expect(m).toContain("after the current cycle");
    expect(() => leakCheck(packageFiles(p), ["zelda"])).not.toThrow();
    expect(() => leakCheck({ "x.json": '{"n":"Zelda"}' }, ["zelda"])).toThrow(
      "refusing to write",
    );
  });
});

describe("job status from facts only", () => {
  const base = bundle.jobsReport[0];
  const run = (rows: R[]) =>
    buildRPackage(
      [
        {
          ...bundle,
          jobs: [
            { id: "r:j:1", jobNumber: 1, title: "Job J001" },
            { id: "r:j:2", jobNumber: 2, title: "Job J002" },
            { id: "r:j:3", jobNumber: 3, title: "Job J003" },
          ],
          jobsReport: rows,
        },
      ] as never,
      rules,
      full,
    );
  test("Status column wins; else a closed date means closed; else no fact -> unloadable with the reason", () => {
    const p = run([
      { ...base, id: "a", jobId: "r:j:1", status: "Archived" },
      {
        ...base,
        id: "b",
        jobId: "r:j:2",
        status: null,
        closedDate: "2026-10-01",
      },
      { ...base, id: "c", jobId: "r:j:3", status: null, closedDate: null },
    ]);
    const jobs = (p.current as Record<string, R[]>)["jobs.json"];
    expect(jobs.map((j) => [j.id, j.status])).toEqual([
      ["r:j:1", "Archived"],
      ["r:j:2", "closed"],
    ]);
    expect(p.unloadable.find((u) => u.id === "c")?.reasons[0]).toContain(
      "no Status value and no Closed date",
    );
  });
  test("a job in both reports loads from the row that carries the fact", () => {
    const p = run([
      {
        ...base,
        id: "one-off",
        jobId: "r:j:2",
        status: null,
        closedDate: null,
      },
      {
        ...base,
        id: "recurring",
        jobId: "r:j:2",
        status: null,
        closedDate: "2026-10-02",
      },
    ]);
    const jobs = (p.current as Record<string, R[]>)["jobs.json"];
    expect(jobs.map((j) => [j.id, j.status, j.sourceId])).toEqual([
      ["r:j:2", "closed", base.sourceId],
    ]);
    expect(p.excluded.duplicateIds).toBe(1);
  });
});

describe("end to end: A1's replicas through ingest-r, then the package", () => {
  test("loads strictly and nothing real-looking leaks", async () => {
    const dir = join(mkdtempSync(join(tmpdir(), "rpkg-e2e-")), "r");
    mkdirSync(dir, { recursive: true });
    const files: Record<string, string> = {
      "Timesheets.csv": JOBBER_TIMESHEETS_CSV,
      "Journal.csv": GUSTO_JOURNAL_SECTIONED_CSV,
      "Expense Report.csv": EXPENSE_REPORT_CSV,
      "Transaction List.csv": TRANSACTION_LIST_CSV,
      "Invoices Report.csv": INVOICES_REPORT_CSV,
      "Quotes Report.csv": QUOTES_REPORT_CSV,
      "One-off Jobs.csv": ONE_OFF_JOBS_CSV,
      "Recurring Jobs.csv": RECURRING_JOBS_CSV,
      "VenmoStatement_Sep_2026.csv": VENMO_CSV,
    };
    for (const [n, t] of Object.entries(files)) writeFileSync(join(dir, n), t);
    const f = (n: string) => [join(dir, n)];
    const counts = await ingestR({
      privateDir: dir,
      timezone: "America/New_York",
      timesheets: f("Timesheets.csv"),
      journals: f("Journal.csv"),
      jobberExpenses: f("Expense Report.csv"),
      transactions: f("Transaction List.csv"),
      invoices: f("Invoices Report.csv"),
      quotes: f("Quotes Report.csv"),
      jobsOneOff: f("One-off Jobs.csv"),
      jobsRecurring: f("Recurring Jobs.csv"),
      venmo: f("VenmoStatement_Sep_2026.csv"),
      now: () => new Date("2026-10-24T12:00:00Z"),
    });
    const b = JSON.parse(readFileSync(counts.outPath as string, "utf8"));
    const allRoles = Object.fromEntries(
      (b.workers as R[]).map((w) => [w.id, "field"]),
    );
    const p = buildRPackage(
      [b],
      { timezone: "America/New_York", rules: [] },
      { ...full, roles: allRoles },
    );
    checkFolders(p);
    const tokens = readFileSync(join(dir, "real-tokens.txt"), "utf8")
      .split("\n")
      .filter(Boolean);
    expect(() =>
      leakCheck(
        { ...packageFiles(p), "MANIFEST.md": manifest(p, "2026-10-25", {}) },
        tokens,
      ),
    ).not.toThrow();
    const cur = p.current as Record<string, R[]>;
    expect(cur["workers.json"].length + p.blocked.length).toBe(
      (b.workers as R[]).length,
    );
    expect(cur["jobs.json"].length).toBeGreaterThan(0);
    expect(
      cur["quotes.json"].length +
        cur["invoices.json"].length +
        cur["payments.json"].length,
    ).toBeGreaterThan(0);
  });
});
