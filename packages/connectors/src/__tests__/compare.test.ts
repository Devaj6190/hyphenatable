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
