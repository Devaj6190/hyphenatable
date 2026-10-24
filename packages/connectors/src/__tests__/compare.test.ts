import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  compareGustoEmployees,
  compareIds,
  compareJobber,
  compareQbo,
  type Fixtures,
  formatCompare,
  loadFixtures,
  loadIdMap,
} from "../compare.ts";
import gustoFx from "../gusto/__fixtures__/gusto.json";
import { normalizeEmployee, type RawEmployee } from "../gusto/normalize.ts";
import {
  fakeJobberFetch,
  fixtures as jobberFixtures,
  memoryTokenStore,
} from "../jobber/__tests__/fakeJobber.ts";
import { pullCycle } from "../jobber/index.ts";
import qboFx from "../qbo/__fixtures__/expenses.json";
import {
  normalizeBill,
  normalizePurchase,
  type RawBill,
  type RawPurchase,
} from "../qbo/normalize.ts";
import { resolvePeriod } from "../time.ts";

const period = resolvePeriod("2026-10-11", "2026-10-24", "America/Los_Angeles");
const J = (s: string) => btoa(`gid://Jobber/${s}`);

describe("compareIds", () => {
  it("counts matched, missing, extra; a second record claiming the same id is extra", () => {
    expect(
      compareIds("x", ["a", "b", "c"], ["a", "b", "b", null, "zzz"]),
    ).toEqual({
      object: "x",
      fixture: 3,
      pulled: 5,
      matched: 2,
      missing: 1,
      extra: 3,
    });
  });
});

describe("compareJobber (fake pull + id map)", () => {
  it("resolves through the pusher's map and scopes fixtures to the period", async () => {
    const fake = fakeJobberFetch(jobberFixtures());
    const pulled = await pullCycle(
      {
        clientId: "c",
        clientSecret: "s",
        fetchImpl: fake.fetch,
        sleepImpl: async () => {},
        tokenStore: memoryTokenStore({
          accessToken: null,
          accessTokenExpiresAt: null,
          refreshToken: "r",
        }),
      },
      "a",
      "2026-10-11",
      "2026-10-24",
      { timezone: "America/Los_Angeles" },
    );
    const fx: Fixtures = {
      workers: [
        { id: "a-w01", jobber: { userId: "x" } },
        { id: "a-w02", jobber: { userId: "x" } },
        { id: "a-w09", jobber: null },
      ],
      timeEntries: [
        {
          id: "a-te-0101",
          startAt: "2026-10-12T15:00:00.000Z",
          jobId: "a-j01",
        },
        { id: "a-te-0102", startAt: "2026-10-13T15:00:00.000Z", jobId: null },
        { id: "a-te-0103", startAt: "2026-10-14T15:00:00.000Z", jobId: null },
        { id: "a-te-1001", startAt: "2026-09-01T15:00:00.000Z", jobId: null }, // past cycle: out of scope
      ],
      expenses: [
        {
          id: "a-ex-0001",
          source: "jobber",
          date: "2026-10-12",
          matchedJobId: "a-j01",
        },
        { id: "a-ex-0002", source: "qbo", date: "2026-10-12" },
      ],
    };
    const map = {
      users: { "a-w01": J("User/1002"), "a-w02": J("User/1003") },
      entries: {
        "a-te-0101": J("TimeSheetEntry/5001"),
        "a-te-0102": J("TimeSheetEntry/5002"),
        "a-te-0103": J("TimeSheetEntry/9999"),
      },
      jobs: { "a-j01": J("Job/2001") },
      expenses: { "a-ex-0001": J("Expense/8001") },
    };
    const rows = Object.fromEntries(
      compareJobber(pulled.records, fx, map, period).map((r) => [r.object, r]),
    );
    expect(rows.users).toMatchObject({
      fixture: 2,
      pulled: 4,
      matched: 2,
      missing: 0,
      extra: 2,
    });
    expect(rows.timeSheetEntries).toMatchObject({
      fixture: 3,
      pulled: 5,
      matched: 2,
      missing: 1,
      extra: 3,
    });
    expect(rows.expenses).toMatchObject({
      fixture: 1,
      pulled: 2,
      matched: 1,
      missing: 0,
      extra: 1,
    });
    expect(rows.jobs).toMatchObject({
      fixture: 1,
      matched: 1,
      missing: 0,
      extra: 1,
    });
    // counts only: no names, no upstream ids
    const table = formatCompare(Object.values(rows));
    expect(table).not.toMatch(/Avery|Jordan|Z2lk/);
  });
});

describe("compareJobber scope rules (live trial findings, 2026-10-24)", () => {
  const empty = {
    workers: [],
    timeEntries: [],
    jobs: [],
    visits: [],
    quotes: [],
    invoices: [],
    payments: [],
    expenses: [],
  };
  const fx: Fixtures = {
    visits: [
      { id: "a-v01", startAt: "2026-10-12T15:00:00.000Z", jobId: "a-j01" },
    ],
    jobs: [{ id: "a-j01" }, { id: "a-j10" }],
    // a-q10 was "sent" in the window but its job a-j10 is next month: out of scope; a-q01 has no sentAt but its job is in scope
    quotes: [
      { id: "a-q01", jobId: "a-j01", sentAt: null },
      { id: "a-q10", jobId: "a-j10", sentAt: "2026-10-13T15:00:00.000Z" },
    ],
    invoices: [{ id: "a-in01", issuedDate: "2026-10-14", jobId: "a-j01" }],
    payments: [
      {
        id: "a-pay02",
        invoiceId: "a-in01",
        quoteId: null,
        amountCents: 814000,
        entryDate: "2026-10-20",
      },
      {
        id: "a-pay03",
        invoiceId: "a-in01",
        quoteId: null,
        amountCents: 120000,
        entryDate: "2026-10-14",
      },
    ],
  };
  const map = {
    jobs: { "a-j01": "J1", "a-j10": "J10" },
    quotes: { "a-q01": "Q1", "a-q10": "Q10" },
    invoices: { "a-in01": "I1" },
    visits: { "a-v01": "V1" },
  };
  const pay = (sourceId: string, amountCents: number, entryDate: string) => ({
    id: `jobber:${sourceId}`,
    companyId: "a",
    sourceId,
    invoiceId: "jobber:I1",
    quoteId: null,
    entryDate,
    amountCents,
    paymentType: null,
    kind: "final" as const,
  });

  it("jobs come from entries/visits/invoices/expenses only; quotes are those of in-scope jobs", () => {
    const rows = Object.fromEntries(
      compareJobber(
        {
          ...empty,
          quotes: [{ sourceId: "Q1" }] as never,
          jobs: [{ sourceId: "J1" }] as never,
        },
        fx,
        map,
        period,
      ).map((r) => [r.object, r]),
    );
    expect(rows.jobs).toMatchObject({ fixture: 1, matched: 1, missing: 0 });
    expect(rows.quotes).toMatchObject({
      fixture: 1,
      matched: 1,
      missing: 0,
      extra: 0,
    });
  });

  it("payments without a map entry match by parent, amount and date; Jobber's own invoice-total records stay extra", () => {
    const pulled = [
      pay("P-auto", 814000, "2026-10-14T07:00:00.000Z"),
      pay("P-seed", 120000, "2026-10-14T04:00:00.000Z"),
    ];
    const rows = Object.fromEntries(
      compareJobber(
        { ...empty, payments: pulled } as never,
        fx,
        map,
        period,
      ).map((r) => [r.object, r]),
    );
    // P-auto has a-pay02's amount but is dated 6 days earlier: not ours. P-seed matches a-pay03.
    expect(rows.paymentRecords).toMatchObject({
      fixture: 2,
      pulled: 2,
      matched: 1,
      missing: 1,
      extra: 1,
    });
  });
});

describe("compareQbo", () => {
  it("seed marker first, then the map; split lines count once; date range scopes fixtures", () => {
    const expenses = [
      ...(qboFx.Purchase as RawPurchase[]).flatMap((p) =>
        normalizePurchase(p, "a"),
      ),
      ...(qboFx.Bill as RawBill[]).flatMap((b) => normalizeBill(b, "a")),
    ];
    const fx: Fixtures = {
      expenses: [
        { id: "a-ex-0007", source: "qbo", date: "2026-10-12" },
        { id: "a-ex-0008", source: "qbo", date: "2026-10-14" },
        { id: "a-ex-0012", source: "qbo", date: "2026-10-20" },
        { id: "a-ex-0099", source: "qbo", date: "2026-10-21" },
        { id: "a-ex-1001", source: "qbo", date: "2026-09-02" },
        { id: "a-ex-0002", source: "jobber", date: "2026-10-12" },
      ],
    };
    const [row] = compareQbo(
      expenses,
      fx,
      { purchases: { "a-ex-0008": "202" } },
      "2026-10-11",
      "2026-10-24",
    );
    expect(row).toEqual({
      object: "expenses(qbo)",
      fixture: 4,
      pulled: 5,
      matched: 3,
      missing: 1,
      extra: 2,
    });
  });
});

describe("compareGustoEmployees", () => {
  it("maps through workers[ourId].employeeUuid; Venmo workers (gusto null) are out of scope", () => {
    const workers = (
      gustoFx["/v1/companies/fake-co-0001/employees"].false as RawEmployee[]
    ).map((e) => normalizeEmployee(e, "a"));
    const fx: Fixtures = {
      workers: [
        { id: "a-w01", gusto: { employeeUuid: "u1" } },
        { id: "a-w02", gusto: { employeeUuid: "u2" } },
        { id: "a-w09", gusto: null },
      ],
    };
    const [row] = compareGustoEmployees(workers, fx, {
      workers: { "a-w01": { employeeUuid: "fake-emp-0001" } },
    });
    expect(row).toEqual({
      object: "employees",
      fixture: 2,
      pulled: 3,
      matched: 1,
      missing: 1,
      extra: 2,
    });
  });
});

describe("loading", () => {
  it("reads only the fixture files present, and a missing map is {}", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pp-cmp-"));
    await mkdir(join(dir, "a"));
    await writeFile(
      join(dir, "a", "workers.json"),
      JSON.stringify([{ id: "a-w01" }]),
    );
    expect(Object.keys(await loadFixtures(join(dir, "a")))).toEqual([
      "workers",
    ]);
    expect(await loadIdMap("a", "jobber", join(dir, "nope.json"))).toEqual({});
  });
});
