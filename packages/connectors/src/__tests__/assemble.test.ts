import { describe, expect, it } from "vitest";
import {
  type AssembleInput,
  assembleDataset,
  summarizeDataset,
} from "../assemble.ts";
import { resolvePeriod } from "../time.ts";

const period = resolvePeriod("2026-10-10", "2026-10-23", "America/New_York");
const cycle = {
  id: "a-c05",
  periodStart: period.startUtc,
  periodEnd: "2026-10-24T03:59:59.999Z",
};

const fx: AssembleInput["fx"] = {
  workers: [
    {
      id: "a-w01",
      displayName: "Fixture One",
      role: "field",
      payType: "hourly",
      managerId: "a-w11",
      jobber: { userId: "jobber-user:a-w01" },
      gusto: {
        employeeUuid: "00000000-0000-4000-a000-000000000001",
        rateCents: 2800,
      },
    },
    {
      id: "a-w11",
      displayName: "Fixture Manager",
      role: "manager",
      payType: "hourly",
      managerId: null,
      jobber: { userId: "jobber-user:a-w11" },
      gusto: null,
    },
  ],
  timeEntries: [
    {
      id: "a-te-0101",
      cycleId: "a-c05",
      workerId: "a-w01",
      approvedBy: "a-w11",
      jobId: "a-j01",
      visitId: "a-v01",
      startAt: "2026-10-12T13:00:00.000Z",
    },
    {
      id: "a-te-1001",
      cycleId: "a-c04",
      workerId: "a-w01",
      jobId: "a-j09",
      visitId: null,
      startAt: "2026-09-30T13:00:00.000Z",
    },
  ],
  jobs: [
    {
      id: "a-j01",
      quoteId: "a-q01",
      clientRef: "a-cl-01",
      salespersonWorkerId: "a-w11",
      parentJobId: null,
    },
    { id: "a-j09", quoteId: null },
  ],
  quotes: [{ id: "a-q01", jobId: "a-j01", salespersonWorkerId: "a-w11" }],
  visits: [
    {
      id: "a-v01",
      jobId: "a-j01",
      startAt: "2026-10-12T13:00:00.000Z",
      assignedWorkerIds: ["a-w01"],
    },
  ],
  invoices: [
    { id: "a-in01", jobId: "a-j01", issuedDate: "2026-10-14" },
    { id: "a-in00", jobId: "a-j09", issuedDate: "2026-10-01" },
    { id: "a-in99", jobId: "a-j09", issuedDate: "2026-09-01" },
  ],
  payments: [
    {
      id: "a-pay01",
      invoiceId: "a-in01",
      quoteId: null,
      entryDate: "2026-10-20",
      amountCents: 50000,
      kind: "final",
    },
    // paid in this cycle on an invoice issued before it: the invoice (and its job) must come along
    {
      id: "a-pay00",
      invoiceId: "a-in00",
      quoteId: null,
      entryDate: "2026-10-15",
      amountCents: 1000,
      kind: "final",
    },
  ],
  expenses: [
    {
      id: "a-ex-0001",
      source: "jobber",
      date: "2026-10-12",
      matchedJobId: "a-j01",
    },
    {
      id: "a-ex-0007",
      source: "qbo",
      date: "2026-10-13",
      matchedJobId: "a-j01",
    },
  ],
  pastPayrolls: [{ id: "a-pp-101", workerId: "a-w01", grossCents: 245000 }],
};
const maps: AssembleInput["maps"] = {
  jobber: {
    users: { "a-w01": "U1", "a-w11": "U11" },
    jobs: { "a-j01": "J1" },
    visits: { "a-v01": "V1" },
    quotes: { "a-q01": "Q1" },
    invoices: { "a-in01": "I1" },
    expenses: { "a-ex-0001": "E1" },
    clients: { "a-cl-01": "C1" },
    visitCompletes: { "a-v01": "done" },
  },
  qbo: {},
  gusto: { workers: { "a-w01": { employeeUuid: "g-1" } } },
};
const user = (id: string) => ({
  id: `jobber:${id}`,
  companyId: "a",
  displayName: `Trial ${id}`,
  role: null,
  payType: null,
  status: "active",
  managerId: null,
  contactRef: null,
  jobber: { userId: id, labourRateCents: null, status: "NOT_INVITED" },
  gusto: null,
  venmoRateCents: null,
});
const live: AssembleInput["live"] = {
  jobber: {
    workers: [user("U1"), user("U11"), user("U99")],
    timeEntries: [],
    jobs: [
      {
        id: "jobber:J1",
        sourceId: "J1",
        quoteId: "jobber:Q1",
        clientRef: "jobber:C1",
      },
    ],
    visits: [{ id: "jobber:V1", sourceId: "V1", jobId: "jobber:J1" }],
    quotes: [{ id: "jobber:Q1", sourceId: "Q1", jobId: "jobber:J1" }],
    invoices: [{ id: "jobber:I1", sourceId: "I1", jobId: "jobber:J1" }],
    payments: [
      {
        id: "jobber:P9",
        sourceId: "P9",
        invoiceId: "jobber:I1",
        quoteId: null,
        kind: "unknown",
        paymentType: "jobber_invoice_adjustment",
        amountCents: 814000,
      },
    ],
    expenses: [{ id: "jobber:E1", sourceId: "E1", matchedJobId: "jobber:J1" }],
    webUris: {
      J1: "https://secure.getjobber.com/work_orders/1",
      I1: "https://secure.getjobber.com/invoices/1",
    },
  } as never,
  gusto: {
    workers: [
      {
        id: "gusto:employee:g-1",
        gusto: {
          employeeUuid: "g-1",
          contractorUuid: null,
          jobUuid: "gj",
          rateCents: 2900,
          paymentUnit: "Hour",
          flsaStatus: "Nonexempt",
          onboarded: true,
        },
      } as never,
    ],
    payrolls: [
      {
        id: "gusto:payroll:p1",
        sourceId: "p1",
        employees: [
          {
            workerId: "gusto:employee:g-1",
            employeeUuid: "g-1",
            grossCents: 1,
          },
        ],
      } as never,
    ],
  },
  syncRuns: [
    {
      id: "x",
      companyId: "a",
      cycleId: "a-c05",
      source: "jobber",
      object: "users",
      startedAt: "",
      finishedAt: "",
      pulled: 3,
      expected: 3,
      complete: true,
      method: "",
      error: null,
    },
  ],
};
const d = assembleDataset({
  companyId: "a",
  cycle,
  period,
  fx,
  maps,
  live,
  now: () => new Date("2026-10-24T12:00:00Z"),
});
const byOur = (t: keyof typeof d.tables, ourId: string) =>
  d.tables[t].find((r) => r.ourId === ourId);

describe("assembleDataset", () => {
  it("workers: fixture config + live Jobber / Gusto blocks, canonical live ids, references remapped", () => {
    expect(byOur("workers", "a-w01")).toMatchObject({
      id: "jobber:U1",
      origin: "live",
      role: "field",
      payType: "hourly",
      managerId: "jobber:U11",
      displayName: "Trial U1",
      jobber: { userId: "U1", status: "NOT_INVITED" },
      gusto: { employeeUuid: "g-1", rateCents: 2900 },
    });
    // a live user the map does not know is kept, untagged, and counted
    expect(d.tables.workers.find((w) => w.id === "jobber:U99")).toMatchObject({
      origin: "live",
      ourId: null,
    });
    expect(d.unmatched.users).toBe(1);
  });

  it("fixture-only time entries join live ids; other cycles are left out", () => {
    expect(d.tables.timeEntries).toHaveLength(1);
    expect(d.tables.timeEntries[0]).toMatchObject({
      id: "a-te-0101",
      origin: "fixture",
      ourId: "a-te-0101",
      workerId: "jobber:U1",
      approvedBy: "jobber:U11",
      jobId: "jobber:J1",
      visitId: "jobber:V1",
    });
  });

  it("live records win over their fixture twins, carry ourId and the Jobber web link", () => {
    expect(d.tables.jobs).toEqual([
      expect.objectContaining({
        id: "jobber:J1",
        origin: "live",
        ourId: "a-j01",
        url: "https://secure.getjobber.com/work_orders/1",
      }),
      expect.objectContaining({ id: "a-j09", origin: "fixture" }), // the job of the earlier invoice paid this cycle
    ]);
    expect(d.tables.invoices[0]).toMatchObject({
      origin: "live",
      ourId: "a-in01",
      url: "https://secure.getjobber.com/invoices/1",
    });
    expect(d.tables.quotes).toHaveLength(1);
    expect(d.tables.visits).toHaveLength(1);
  });

  it("payments: fixture payments point at the live invoice; Jobber's invoice adjustments kept but not 'unmatched'", () => {
    expect(byOur("payments", "a-pay01")).toMatchObject({
      origin: "fixture",
      invoiceId: "jobber:I1",
      kind: "final",
    });
    expect(d.tables.payments.find((p) => p.id === "jobber:P9")).toMatchObject({
      origin: "live",
      kind: "unknown",
    });
    expect(d.unmatched.payments).toBeUndefined();
    expect(d.unmatched.jobberInvoiceAdjustments).toBe(1);
  });

  it("expenses: live Jobber + fixture QBO (not pulled) with job links remapped; history workers remapped", () => {
    expect(byOur("expenses", "a-ex-0001")).toMatchObject({
      origin: "live",
      id: "jobber:E1",
    });
    expect(byOur("expenses", "a-ex-0007")).toMatchObject({
      origin: "fixture",
      matchedJobId: "jobber:J1",
    });
    expect(d.sources).toEqual({
      jobber: "live",
      qbo: "fixture",
      gusto: "live",
    });
    expect(d.tables.pastPayrolls[0]).toMatchObject({
      workerId: "jobber:U1",
      origin: "fixture",
    });
    expect(
      (
        d.tables.gustoPayrolls[0] as unknown as {
          employees: { workerId: string }[];
        }
      ).employees[0]?.workerId,
    ).toBe("jobber:U1");
  });

  it("every reference resolves inside the dataset (an earlier invoice paid this cycle comes along)", () => {
    const ids = (t: keyof typeof d.tables) =>
      new Set(d.tables[t].map((r) => r.id));
    const [W, J, V, I, Q] = [
      ids("workers"),
      ids("jobs"),
      ids("visits"),
      ids("invoices"),
      ids("quotes"),
    ];
    const dangling = (
      t: keyof typeof d.tables,
      field: string,
      S: Set<string>,
    ) =>
      d.tables[t]
        .filter((r) => r[field] != null && !S.has(r[field] as string))
        .map((r) => r.id);
    expect([
      ...dangling("timeEntries", "workerId", W),
      ...dangling("timeEntries", "jobId", J),
      ...dangling("timeEntries", "visitId", V),
      ...dangling("visits", "jobId", J),
      ...dangling("quotes", "jobId", J),
      ...dangling("invoices", "jobId", J),
      ...dangling("payments", "invoiceId", I),
      ...dangling("payments", "quoteId", Q),
      ...dangling("expenses", "matchedJobId", J),
      ...dangling("pastPayrolls", "workerId", W),
    ]).toEqual([]);
    expect(byOur("invoices", "a-in00")).toMatchObject({ origin: "fixture" });
    expect(byOur("invoices", "a-in99")).toBeUndefined();
  });

  it("summary is counts only", () => {
    const s = summarizeDataset(d);
    expect(s).toMatch(/timeEntries\s+1\s+live\s+0\s+fixture\s+1/);
    expect(s).toContain("jobberInvoiceAdjustments 1");
    expect(s).not.toMatch(/Trial|Fixture One|U1\b/);
  });

  it("with no live source everything is fixture, ids stay ours where the map has none", () => {
    const f = assembleDataset({
      companyId: "a",
      cycle,
      period,
      fx,
      maps: { jobber: {}, qbo: {}, gusto: {} },
      live: { syncRuns: [] },
    });
    expect(f.tables.timeEntries[0]).toMatchObject({
      id: "a-te-0101",
      workerId: "a-w01",
      jobId: "a-j01",
    });
    expect(f.tables.workers.every((w) => w.origin === "fixture")).toBe(true);
    expect(f.sources).toEqual({
      jobber: "fixture",
      qbo: "fixture",
      gusto: "fixture",
    });
  });
});
