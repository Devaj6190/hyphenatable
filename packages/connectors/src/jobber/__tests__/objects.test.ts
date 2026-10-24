import { describe, expect, it } from "vitest";
import { pullCycle } from "../index.ts";
import {
  JOBBER_INVOICE_ADJUSTMENT,
  normalizePayment,
  paymentKind,
} from "../objects.ts";
import { fakeJobberFetch, fixtures, memoryTokenStore } from "./fakeJobber.ts";

const J1 = "jobber:Z2lkOi8vSm9iYmVyL0pvYi8yMDAx";
const J2 = "jobber:Z2lkOi8vSm9iYmVyL0pvYi8yMDAy";
const Q1 = "jobber:Z2lkOi8vSm9iYmVyL1F1b3RlLzQwMDE=";
const auth = (fetchImpl: typeof fetch) => ({
  clientId: "cid",
  clientSecret: "csecret",
  fetchImpl,
  sleepImpl: async () => {},
  tokenStore: memoryTokenStore({
    accessToken: null,
    accessTokenExpiresAt: null,
    refreshToken: "fake-refresh-0",
  }),
});
const pull = (fx = fixtures(), hidden?: string[]) => {
  const fake = fakeJobberFetch(fx, { hidden });
  return pullCycle(auth(fake.fetch), "a", "2026-10-11", "2026-10-24", {
    timezone: "America/Los_Angeles",
    now: () => new Date("2026-10-24T12:00:00Z"),
  }).then((r) => ({ ...r, calls: fake.calls }));
};
const runOf = (r: Awaited<ReturnType<typeof pull>>, object: string) =>
  r.syncRuns.find((s) => s.object === object);

describe("pullCycle objects (recorded fixtures)", () => {
  it("pulls every object with one complete SyncRun each", async () => {
    const r = await pull();
    expect(
      r.syncRuns.map((s) => [s.object, s.pulled, s.expected, s.complete]),
    ).toEqual([
      ["users", 4, 4, true],
      ["timeSheetEntries", 5, 5, true],
      ["visits", 1, 1, true],
      ["quotes", 2, 2, true], // 1 sent in the period + 1 never sent, brought by its job,
      ["invoices", 1, 1, true],
      ["paymentRecords", 2, 2, true],
      ["expenses", 2, 2, true],
      ["jobs", 2, 2, true],
    ]);
    // range filters use the period in UTC
    const v = r.calls.graphql.find(
      (c) => c.operation === "PayrollPilot_visits",
    );
    expect(v?.variables).toMatchObject({
      from: "2026-10-11T07:00:00.000Z",
      to: "2026-10-25T07:00:00.000Z",
      first: 50,
    });
    // jobs fetched by id: everything referenced by entries, visits, quotes, invoices, expenses
    const j = r.calls.graphql.find((c) => c.operation === "PayrollPilot_jobs");
    expect((j?.variables.ids as string[]).sort()).toEqual([
      "Z2lkOi8vSm9iYmVyL0pvYi8yMDAx",
      "Z2lkOi8vSm9iYmVyL0pvYi8yMDAy",
    ]);
  });

  it("normalizes jobs, quotes with salesperson, invoices to section 6 with cents and UTC", async () => {
    const { records } = await pull();
    expect(records.jobs.find((x) => x.id === J1)).toEqual({
      id: J1,
      companyId: "a",
      sourceId: "Z2lkOi8vSm9iYmVyL0pvYi8yMDAx",
      jobNumber: 101,
      title: "Spring cleanup",
      clientRef: "jobber:Z2lkOi8vSm9iYmVyL0NsaWVudC85MDAx",
      status: "requires_invoicing",
      salespersonWorkerId: "jobber:Z2lkOi8vSm9iYmVyL1VzZXIvMTAwMw==",
      quoteId: Q1,
      parentJobId: null,
      startAt: "2026-10-12T15:00:00.000Z",
      endAt: null,
      totalCents: 125040,
    });
    expect(records.jobs.find((x) => x.id === J2)?.totalCents).toBe(98015);
    expect(records.quotes[0]).toMatchObject({
      jobId: J1,
      salespersonWorkerId: "jobber:Z2lkOi8vSm9iYmVyL1VzZXIvMTAwMw==",
      status: "converted",
      amountCents: 125040,
      sentAt: "2026-10-11T18:00:00.000Z",
    });
    expect(records.invoices[0]).toMatchObject({
      jobId: J1,
      status: "paid",
      totalCents: 125040,
      issuedDate: "2026-10-20T07:00:00.000Z",
      dueDate: "2026-11-03T08:00:00.000Z",
    });
    expect(records.visits[0]).toMatchObject({
      jobId: J2,
      isComplete: true,
      assignedWorkerIds: ["jobber:Z2lkOi8vSm9iYmVyL1VzZXIvMTAwMg=="],
      startAt: "2026-10-13T15:00:00.000Z",
    });
  });

  it("payment on a quote is a deposit, on an invoice final", async () => {
    const { records } = await pull();
    expect(
      records.payments.map((p) => [
        p.kind,
        p.amountCents,
        p.quoteId !== null,
        p.invoiceId !== null,
      ]),
    ).toEqual([
      ["deposit", 30000, true, false],
      ["final", 95040, false, true],
    ]);
    expect(paymentKind({ quote: { id: "q" }, invoice: { id: "i" } })).toBe(
      "deposit",
    );
    expect(paymentKind({ quote: null, invoice: null })).toBe("unknown");
  });

  it("expenses: linked job carried, missing total stays null, kind left to classification", async () => {
    const { records } = await pull();
    const [mulch, dump] = records.expenses;
    expect(mulch).toMatchObject({
      source: "jobber",
      amountCents: 21437,
      matchedJobId: J1,
      matchConfidence: null,
      accountName: "Materials",
      kind: "unknown",
      description: "Mulch",
    });
    expect(dump).toMatchObject({
      amountCents: null,
      matchedJobId: null,
      accountName: null,
      description: "Dump fee - transfer station",
    });
  });

  it("expenses: reimbursable-to worker and status from the paymentStatus filter, null when absent", async () => {
    const { records } = await pull();
    const [mulch, dump] = records.expenses;
    expect(mulch).toMatchObject({
      reimbursableToWorkerId: "jobber:Z2lkOi8vSm9iYmVyL1VzZXIvMTAwMg==",
      reimbursementStatus: "PENDING_REIMBURSEMENT",
    });
    expect(dump).toMatchObject({
      reimbursableToWorkerId: null,
      reimbursementStatus: null,
    });
  });

  it("expenses: unknown reimbursement status leaves nulls and marks the run incomplete", async () => {
    const fx = fixtures();
    (fx.objects.expenseStatus as Record<string, unknown>).PAID = undefined;
    const r = await pull(fx);
    expect(r.records.expenses[0]?.reimbursementStatus).toBeNull();
    expect(runOf(r, "expenses")?.complete).toBe(false);
    expect(runOf(r, "expenses")?.error).toContain(
      "reimbursement status unavailable",
    );
  });

  it("a converted quote that was never sent comes in through its job (sentAt alone would miss it)", async () => {
    const r = await pull();
    const unsent = r.records.quotes.find(
      (q) => q.sourceId === "Z2lkOi8vSm9iYmVyL1F1b3RlLzQwMDI=",
    );
    expect(unsent).toMatchObject({
      jobId: J2,
      sentAt: null,
      status: "converted",
      amountCents: 98015,
      salespersonWorkerId: "jobber:Z2lkOi8vSm9iYmVyL1VzZXIvMTAwMg==",
    });
    // the sent one is not duplicated by its job's inline quote
    expect(
      r.records.quotes.filter(
        (q) => q.sourceId === "Z2lkOi8vSm9iYmVyL1F1b3RlLzQwMDE=",
      ),
    ).toHaveLength(1);
    expect(runOf(r, "quotes")?.method).toContain(
      "+ quotes of 1 in-scope job(s)",
    );
  });

  it("a quote on several jobs gets no jobId (never picks one)", async () => {
    const fx = fixtures();
    const q = fx.objects.quotes[0];
    if (q)
      q.jobs = {
        totalCount: 2,
        nodes: [
          { id: "Z2lkOi8vSm9iYmVyL0pvYi8yMDAx" },
          { id: "Z2lkOi8vSm9iYmVyL0pvYi8yMDAy" },
        ],
      };
    const { records } = await pull(fx);
    expect(records.quotes[0]?.jobId).toBeNull();
  });

  it("totalCount above the pulled count makes only that object's run incomplete", async () => {
    const fx = fixtures();
    (fx.objects.totalCounts as Record<string, number>).expenses = 3;
    const r = await pull(fx);
    expect(runOf(r, "expenses")).toMatchObject({
      complete: false,
      pulled: 2,
      expected: 3,
      error: "expenses: pulled 2, totalCount 3 (diff -1)",
    });
    expect(r.syncRuns.filter((s) => !s.complete).map((s) => s.object)).toEqual([
      "expenses",
    ]);
  });

  it("a truncated nested list (assigned users) marks visits incomplete", async () => {
    const fx = fixtures();
    const v = fx.objects.visits[0];
    if (v) v.assignedUsers.totalCount = 12;
    const r = await pull(fx);
    expect(runOf(r, "visits")?.complete).toBe(false);
    expect(runOf(r, "visits")?.error).toContain(
      "truncated at 10 on Z2lkOi8vSm9iYmVyL1Zpc2l0LzMwMDE=",
    );
  });

  it("a referenced job Jobber does not return makes jobs incomplete with its id", async () => {
    const fx = fixtures();
    fx.objects.jobs = fx.objects.jobs.slice(0, 1);
    const r = await pull(fx);
    expect(runOf(r, "jobs")).toMatchObject({
      complete: false,
      pulled: 1,
      expected: 2,
    });
    expect(runOf(r, "jobs")?.error).toContain("Z2lkOi8vSm9iYmVyL0pvYi8yMDAy");
  });
});

describe("fields hidden from the app (live trial account, 2026-10-24)", () => {
  it("User.labourRate and Expense.accountingCode hidden -> not requested, null, runs still complete", async () => {
    const r = await pull(fixtures(), [
      "User.labourRate",
      "Expense.accountingCode",
    ]);
    expect(
      r.syncRuns.filter((s) => !s.complete).map((s) => [s.object, s.error]),
    ).toEqual([]);
    expect(
      r.records.workers.every((w) => w.jobber?.labourRateCents === null),
    ).toBe(true);
    expect(r.records.expenses.every((x) => x.accountName === null)).toBe(true);
    expect(runOf(r, "users")?.method).toContain("User.labourRate hidden");
    expect(runOf(r, "expenses")?.method).toContain(
      "Expense.accountingCode hidden",
    );
    // one probe per type per pull
    expect(
      r.calls.graphql
        .filter((c) => c.operation === "PayrollPilotTypeFields")
        .map((c) => c.variables.name),
    ).toEqual(["User", "Expense"]);
  });

  it("visible fields are still requested and mapped", async () => {
    const r = await pull();
    expect(
      r.records.workers.find((w) => w.jobber?.labourRateCents === 3115),
    ).toBeDefined();
    expect(r.records.expenses[0]?.accountName).toBe("Materials");
  });
});

describe("Jobber's own invoice records (live trial, 2026-10-24)", () => {
  const auto = {
    __typename: "OtherPaymentRecord",
    id: "P-auto",
    amount: 8140,
    entryDate: "2026-10-14T04:00:00Z",
    paymentType: null,
    adjustmentType: "INVOICE",
    paymentOrigin: "UNKNOWN_ORIGIN",
    invoice: { id: "I1" },
    quote: null,
  };
  it("are kept and traceable but never a final payment", () => {
    expect(normalizePayment(auto, "a")).toEqual({
      id: "jobber:P-auto",
      companyId: "a",
      sourceId: "P-auto",
      invoiceId: "jobber:I1",
      quoteId: null,
      entryDate: "2026-10-14T04:00:00.000Z",
      amountCents: 814000,
      paymentType: JOBBER_INVOICE_ADJUSTMENT,
      kind: "unknown",
    });
  });
  it("only that exact shape: a real 'Other' payment or a known origin stays a final", () => {
    expect(paymentKind({ ...auto, paymentOrigin: "MANUAL" })).toBe("final");
    expect(paymentKind({ ...auto, __typename: "CashPaymentRecord" })).toBe(
      "final",
    );
    expect(paymentKind({ ...auto, adjustmentType: "PAYMENT" })).toBe("final");
    expect(
      normalizePayment(
        { ...auto, __typename: "CheckPaymentRecord", paymentType: "CHEQUE" },
        "a",
      ).paymentType,
    ).toBe("CHEQUE");
  });
});
