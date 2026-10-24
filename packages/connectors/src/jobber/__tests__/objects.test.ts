import { describe, expect, it } from "vitest";
import { pullCycle } from "../index.ts";
import { paymentKind } from "../objects.ts";
import { fakeJobberFetch, fixtures, memoryTokenStore } from "./fakeJobber.ts";

const J1 = "jobber:Z2lkOi8vSm9iYmVyL0pvYi8yMDAx";
const J2 = "jobber:Z2lkOi8vSm9iYmVyL0pvYi8yMDAy";
const Q1 = "jobber:Z2lkOi8vSm9iYmVyL1F1b3RlLzQwMDE=";
const auth = (fetchImpl: typeof fetch) => ({
  clientId: "cid", clientSecret: "csecret", fetchImpl, sleepImpl: async () => {},
  tokenStore: memoryTokenStore({ accessToken: null, accessTokenExpiresAt: null, refreshToken: "fake-refresh-0" }),
});
const pull = (fx = fixtures()) => {
  const fake = fakeJobberFetch(fx);
  return pullCycle(auth(fake.fetch), "a", "2026-10-11", "2026-10-24", { timezone: "America/Los_Angeles", now: () => new Date("2026-10-24T12:00:00Z") }).then((r) => ({ ...r, calls: fake.calls }));
};
const runOf = (r: Awaited<ReturnType<typeof pull>>, object: string) => r.syncRuns.find((s) => s.object === object);

describe("pullCycle objects (recorded fixtures)", () => {
  it("pulls every object with one complete SyncRun each", async () => {
    const r = await pull();
    expect(r.syncRuns.map((s) => [s.object, s.pulled, s.expected, s.complete])).toEqual([
      ["users", 4, 4, true],
      ["timeSheetEntries", 5, 5, true],
      ["visits", 1, 1, true],
      ["quotes", 1, 1, true],
      ["invoices", 1, 1, true],
      ["paymentRecords", 2, 2, true],
      ["expenses", 2, 2, true],
      ["jobs", 2, 2, true],
    ]);
    // range filters use the period in UTC
    const v = r.calls.graphql.find((c) => c.operation === "PayrollPilot_visits");
    expect(v?.variables).toMatchObject({ from: "2026-10-11T07:00:00.000Z", to: "2026-10-25T07:00:00.000Z", first: 50 });
    // jobs fetched by id: everything referenced by entries, visits, quotes, invoices, expenses
    const j = r.calls.graphql.find((c) => c.operation === "PayrollPilot_jobs");
    expect((j?.variables.ids as string[]).sort()).toEqual(["Z2lkOi8vSm9iYmVyL0pvYi8yMDAx", "Z2lkOi8vSm9iYmVyL0pvYi8yMDAy"]);
  });

  it("normalizes jobs, quotes with salesperson, invoices to section 6 with cents and UTC", async () => {
    const { records } = await pull();
    expect(records.jobs.find((x) => x.id === J1)).toEqual({
      id: J1, companyId: "a", sourceId: "Z2lkOi8vSm9iYmVyL0pvYi8yMDAx", jobNumber: 101, title: "Spring cleanup",
      clientRef: "jobber:Z2lkOi8vSm9iYmVyL0NsaWVudC85MDAx", status: "requires_invoicing",
      salespersonWorkerId: "jobber:Z2lkOi8vSm9iYmVyL1VzZXIvMTAwMw==", quoteId: Q1, parentJobId: null,
      startAt: "2026-10-12T15:00:00.000Z", endAt: null, totalCents: 125040,
    });
    expect(records.jobs.find((x) => x.id === J2)?.totalCents).toBe(98015);
    expect(records.quotes[0]).toMatchObject({ jobId: J1, salespersonWorkerId: "jobber:Z2lkOi8vSm9iYmVyL1VzZXIvMTAwMw==", status: "converted", amountCents: 125040, sentAt: "2026-10-11T18:00:00.000Z" });
    expect(records.invoices[0]).toMatchObject({ jobId: J1, status: "paid", totalCents: 125040, issuedDate: "2026-10-20T07:00:00.000Z", dueDate: "2026-11-03T08:00:00.000Z" });
    expect(records.visits[0]).toMatchObject({ jobId: J2, isComplete: true, assignedWorkerIds: ["jobber:Z2lkOi8vSm9iYmVyL1VzZXIvMTAwMg=="], startAt: "2026-10-13T15:00:00.000Z" });
  });

  it("payment on a quote is a deposit, on an invoice final", async () => {
    const { records } = await pull();
    expect(records.payments.map((p) => [p.kind, p.amountCents, p.quoteId !== null, p.invoiceId !== null])).toEqual([
      ["deposit", 30000, true, false],
      ["final", 95040, false, true],
    ]);
    expect(paymentKind({ quote: { id: "q" }, invoice: { id: "i" } })).toBe("deposit");
    expect(paymentKind({ quote: null, invoice: null })).toBe("unknown");
  });

  it("expenses: linked job carried, missing total stays null, kind left to classification", async () => {
    const { records } = await pull();
    const [mulch, dump] = records.expenses;
    expect(mulch).toMatchObject({ source: "jobber", amountCents: 21437, matchedJobId: J1, matchConfidence: null, accountName: "Materials", kind: "unknown", description: "Mulch" });
    expect(dump).toMatchObject({ amountCents: null, matchedJobId: null, accountName: null, description: "Dump fee - transfer station" });
  });

  it("a quote on several jobs gets no jobId (never picks one)", async () => {
    const fx = fixtures();
    const q = fx.objects.quotes[0];
    if (q) q.jobs = { totalCount: 2, nodes: [{ id: "Z2lkOi8vSm9iYmVyL0pvYi8yMDAx" }, { id: "Z2lkOi8vSm9iYmVyL0pvYi8yMDAy" }] };
    const { records } = await pull(fx);
    expect(records.quotes[0]?.jobId).toBeNull();
  });

  it("totalCount above the pulled count makes only that object's run incomplete", async () => {
    const fx = fixtures();
    (fx.objects.totalCounts as Record<string, number>).expenses = 3;
    const r = await pull(fx);
    expect(runOf(r, "expenses")).toMatchObject({ complete: false, pulled: 2, expected: 3, error: "expenses: pulled 2, totalCount 3 (diff -1)" });
    expect(r.syncRuns.filter((s) => !s.complete).map((s) => s.object)).toEqual(["expenses"]);
  });

  it("a truncated nested list (assigned users) marks visits incomplete", async () => {
    const fx = fixtures();
    const v = fx.objects.visits[0];
    if (v) v.assignedUsers.totalCount = 12;
    const r = await pull(fx);
    expect(runOf(r, "visits")?.complete).toBe(false);
    expect(runOf(r, "visits")?.error).toContain("truncated at 10 on Z2lkOi8vSm9iYmVyL1Zpc2l0LzMwMDE=");
  });

  it("a referenced job Jobber does not return makes jobs incomplete with its id", async () => {
    const fx = fixtures();
    fx.objects.jobs = fx.objects.jobs.slice(0, 1);
    const r = await pull(fx);
    expect(runOf(r, "jobs")).toMatchObject({ complete: false, pulled: 1, expected: 2 });
    expect(runOf(r, "jobs")?.error).toContain("Z2lkOi8vSm9iYmVyL0pvYi8yMDAy");
  });
});
