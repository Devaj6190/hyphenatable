import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { copyFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Config, generate } from "../generate";
import {
  assertWritable,
  assignExisting,
  buildGustoPlan,
  GustoSeedWriter,
  pickPayroll,
} from "../lib/gusto";
import { must } from "../lib/must";
import { applyMap, loadGusto, printDryRun } from "../push-gusto";

const { workers, cycleStart, cycleEnd } = loadGusto("a");
const plan = buildGustoPlan(workers);

describe("push-gusto dry run (default path)", () => {
  const realFetch = globalThis.fetch;
  beforeAll(() => {
    globalThis.fetch = (() => {
      throw new Error("dry run must not call the network");
    }) as unknown as typeof fetch;
  });
  afterAll(() => {
    globalThis.fetch = realFetch;
  });

  test("prints the plan without network or credentials", () => {
    const lines: string[] = [];
    printDryRun("a", plan, {}, { start: cycleStart, end: cycleEnd }, (l) =>
      lines.push(l),
    );
    const out = lines.join("\n");
    expect(out).toContain("DRY RUN");
    expect(out).toContain("api.gusto-demo.com only");
    expect(out).toContain("never by name");
    expect(cycleStart).toBe("2026-10-10");
    expect(cycleEnd).toBe("2026-10-23");
  });

  test("every non-Venmo worker is a target; Venmo contractors are never sent; a-w14 is the new hire", () => {
    expect(plan.targets.map((t) => t.workerId)).toEqual(
      workers.filter((w) => w.gusto).map((w) => w.id),
    );
    expect(plan.skipped.map((s) => s.workerId).sort()).toEqual([
      "a-w09",
      "a-w10",
    ]);
    expect(
      plan.targets
        .filter((t) => t.source === "new_hire")
        .map((t) => t.workerId),
    ).toEqual(["a-w14"]);
  });

  test("compensations come from the config only (a-w02 keeps the CHK-10 mismatch)", () => {
    const w02 = must(plan.targets.find((t) => t.workerId === "a-w02"));
    expect(w02.compensation).toEqual({
      rate: "25.00",
      paymentUnit: "Hour",
      flsaStatus: "Nonexempt",
    });
    expect(
      must(must(plan.targets.find((t) => t.workerId === "a-w08")).compensation)
        .paymentUnit,
    ).toBe("Year");
  });
});

describe("mapping rules", () => {
  const emp = (uuid: string, onboarded = true, terminated = false) => ({
    uuid,
    onboarded,
    terminated,
  });
  test("existing employees by uuid order, skipping unfinished onboarding and terminated; stable with a partial map", () => {
    const pool = [
      emp("c"),
      emp("a"),
      emp("x", false),
      emp("t", true, true),
      ...Array.from({ length: 12 }, (_, i) =>
        emp(`m${String(i).padStart(2, "0")}`),
      ),
    ];
    const a = assignExisting(plan.targets, pool);
    expect(a["a-w01"]).toBe("a");
    expect(a["a-w02"]).toBe("c");
    expect(Object.values(a)).not.toContain("x");
    expect(Object.values(a)).not.toContain("t");
    expect(new Set(Object.values(a)).size).toBe(Object.values(a).length);
    expect(
      assignExisting(plan.targets, pool, { "a-w01": "m05" })["a-w01"],
    ).toBe("m05");
  });
  test("too few demo employees stops instead of doubling up", () => {
    expect(() => assignExisting(plan.targets, [emp("a"), emp("b")])).toThrow(
      "too few",
    );
  });
  test("payroll pick covers the cycle end", () => {
    const p = pickPayroll(
      [
        {
          payroll_uuid: "old",
          pay_period: { start_date: "2026-09-26", end_date: "2026-10-09" },
        },
        {
          payroll_uuid: "cur",
          pay_period: { start_date: "2026-10-10", end_date: "2026-10-23" },
        },
      ],
      "2026-10-10",
      "2026-10-23",
    );
    expect(p.uuid).toBe("cur");
    expect(pickPayroll([], "2026-10-10", "2026-10-23").uuid).toBeNull();
  });
});

describe("live safety (fake fetch, no network)", () => {
  test("payroll writes and anything off the allowlist are refused", () => {
    for (const path of [
      "/v1/companies/c/payrolls/p/prepare",
      "/v1/companies/c/payrolls/p/submit",
      "/v1/companies/c/payrolls/p/calculate",
      "/v1/companies/c/payrolls/p",
      "/v1/companies/c/payrolls",
    ]) {
      expect(() => assertWritable("PUT", path)).toThrow("refusing");
      expect(() => assertWritable("POST", path)).toThrow("refusing");
    }
    expect(() => assertWritable("PUT", "/v1/employees/e")).toThrow(
      "not on the seed allowlist",
    );
    expect(() =>
      assertWritable("PUT", "/v1/compensations/abc-1"),
    ).not.toThrow();
  });

  test("writer uses the demo host and API version, and refuses a payroll path before any request", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fakeFetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ uuid: "comp" }), { status: 200 });
    }) as unknown as typeof fetch;
    const store = {
      load: async () => ({
        accessToken: "t",
        accessTokenExpiresAt: Date.now() + 3_600_000,
        refreshToken: "r",
      }),
      save: async () => {},
    };
    const w = new GustoSeedWriter(
      {
        refresh: async () => ({
          accessToken: "t2",
          accessTokenExpiresAt: 0,
          refreshToken: "r",
        }),
      },
      store,
      fakeFetch,
    );
    await w.send("PUT", "/v1/compensations/abc", {
      version: "v",
      rate: "25.00",
    });
    expect(calls[0].url).toBe(
      "https://api.gusto-demo.com/v1/compensations/abc",
    );
    expect(
      (calls[0].init.headers as Record<string, string>)["X-Gusto-API-Version"],
    ).toBe("2026-06-15");
    await expect(
      w.send("PUT", "/v1/companies/c/payrolls/p/submit", {}),
    ).rejects.toThrow("refusing");
    expect(calls).toHaveLength(1);
  });

  test("--apply-map writes uuids into the generator config, and the generator uses them", () => {
    const dir = mkdtempSync(join(tmpdir(), "gusto-map-"));
    const cfgPath = join(dir, "a.json");
    copyFileSync(new URL("../companies/a.json", import.meta.url), cfgPath);
    const n = applyMap(
      "a",
      {
        workers: {
          "a-w01": {
            employeeUuid: "emp-1",
            jobUuid: "job-1",
            compensationUuid: "c-1",
          },
        },
        gustoPayrollId: "pay-5",
      },
      cfgPath,
    );
    expect(n).toBe(1);
    const cfg = JSON.parse(readFileSync(cfgPath, "utf8")) as Config;
    const out = generate(cfg) as Record<string, Record<string, unknown>[]>;
    const w01 = must(out["workers.json"].find((w) => w.id === "a-w01"));
    expect((w01.gusto as Record<string, unknown>).employeeUuid).toBe("emp-1");
    expect(
      must(out["cycles.json"].find((c) => c.id === "a-c05")).gustoPayrollId,
    ).toBe("pay-5");
  });
});
