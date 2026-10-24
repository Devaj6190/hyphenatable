import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateAny, loadConfig, serialize } from "../generate";
import { caOvertime } from "../lib/company-b";
import { validateDir } from "../validate";

// Update only when Company B's config or generator changes on purpose; then regenerate data/fixtures/b.
const EXPECTED_SHA256_B =
  "a903cb338dfe60ee600c2b14d76194860e3adb64e734ef250a105ce3333065d5";

type R = Record<string, unknown>;
const hashAll = (files: Record<string, string>) => {
  const h = createHash("sha256");
  for (const f of Object.keys(files).sort()) h.update(`${f}\n${files[f]}`);
  return h.digest("hex");
};
const files = serialize(generateAny(loadConfig("b")));
const json = <T>(f: string) => JSON.parse(files[f]) as T;
const entry = (day: string, start: string, end: string): R => {
  const startAt = new Date(`${day}T${start}:00-07:00`).toISOString();
  const endAt = new Date(`${day}T${end}:00-07:00`).toISOString();
  return {
    startAt,
    endAt,
    durationSec: (Date.parse(endAt) - Date.parse(startAt)) / 1000,
  };
};

describe("California overtime (what past cycles were paid with)", () => {
  test("13 h day: 8 regular, 4 at 1.5x, 1 at 2x", () => {
    expect(caOvertime([entry("2026-10-21", "06:00", "19:00")])).toEqual({
      regular: 8,
      overtime: 4,
      doubleOvertime: 1,
    });
  });
  test("five 8.5 h days: daily OT only, no weekly OT", () => {
    const es = ["19", "20", "21", "22", "23"].map((d) =>
      entry(`2026-10-${d}`, "07:00", "15:30"),
    );
    expect(caOvertime(es)).toEqual({
      regular: 40,
      overtime: 2.5,
      doubleOvertime: 0,
    });
  });
  test("six 8 h days: weekly OT on regular hours over 40", () => {
    const es = ["19", "20", "21", "22", "23", "24"].map((d) =>
      entry(`2026-10-${d}`, "07:00", "15:00"),
    );
    expect(caOvertime(es)).toEqual({
      regular: 40,
      overtime: 8,
      doubleOvertime: 0,
    });
  });
  test("two entries on one day are summed before the daily split", () => {
    expect(
      caOvertime([
        entry("2026-10-20", "08:00", "12:00"),
        entry("2026-10-20", "12:30", "17:00"),
      ]),
    ).toEqual({ regular: 8, overtime: 0.5, doubleOvertime: 0 });
  });
});

describe("seed generator, company b", () => {
  test("deterministic and matches the pinned hash", () => {
    expect(hashAll(serialize(generateAny(loadConfig("b"))))).toBe(
      hashAll(files),
    );
    expect(hashAll(files)).toBe(EXPECTED_SHA256_B);
  });

  test("committed data/fixtures/b is the generator output and validates", () => {
    const dir = join(import.meta.dir, "..", "..", "data", "fixtures", "b");
    for (const [f, text] of Object.entries(files))
      expect(readFileSync(join(dir, f), "utf8")).toBe(text);
    const tmp = mkdtempSync(join(tmpdir(), "seed-b-"));
    for (const [f, text] of Object.entries(files))
      writeFileSync(join(tmp, f), text);
    expect(validateDir(tmp)).toEqual([]);
  });

  test("30 workers, fake names distinct from Company A's, two managers over different crews, no Venmo", () => {
    const w = json<R[]>("workers.json");
    expect(w).toHaveLength(30);
    const aNames = new Set(
      (
        JSON.parse(
          readFileSync(
            join(
              import.meta.dir,
              "..",
              "..",
              "data",
              "fixtures",
              "a",
              "workers.json",
            ),
            "utf8",
          ),
        ) as R[]
      ).map((x) => x.displayName),
    );
    for (const x of w) expect(aNames.has(x.displayName)).toBe(false);
    const managers = w.filter((x) => x.role === "manager").map((x) => x.id);
    expect(managers.length).toBeGreaterThanOrEqual(2);
    const crews = new Set(
      w.filter((x) => x.role === "field").map((x) => x.managerId),
    );
    expect([...crews].sort()).toEqual([...managers].sort());
    expect(w.some((x) => x.payType === "contractor_venmo")).toBe(false);
    expect(w.filter((x) => x.payType === "commission")).toHaveLength(2);
  });

  test("weekly cycles; nobody works 7 consecutive days; no tips anywhere", () => {
    const company = json<R>("company.json");
    expect(company.payFrequency).toBe("weekly");
    for (const c of json<R[]>("cycles.json"))
      expect(
        (Date.parse(c.periodEnd as string) +
          1 -
          Date.parse(c.periodStart as string)) /
          86_400_000,
      ).toBe(7);
    const days = new Map<string, Set<string>>();
    for (const e of json<R[]>("timeEntries.json")) {
      const d = new Date(Date.parse(e.startAt as string) - 7 * 3600_000)
        .toISOString()
        .slice(0, 10);
      days.set(
        e.workerId as string,
        (days.get(e.workerId as string) ?? new Set()).add(d),
      );
    }
    for (const set of days.values()) {
      const sorted = [...set].sort();
      let run = 1;
      for (let i = 1; i < sorted.length; i++) {
        run =
          Date.parse(sorted[i]) - Date.parse(sorted[i - 1]) === 86_400_000
            ? run + 1
            : 1;
        expect(run).toBeLessThan(7);
      }
    }
    const earnings = json<R[]>("pastPayrolls.json").flatMap((p) =>
      (p.earnings as R[]).map((e) => e.name),
    );
    expect(earnings.some((n) => /tip/i.test(String(n)))).toBe(false);
    expect(earnings).toContain("Double Overtime");
  });

  test("rules state California daily OT for the payroll lane, commission on profit, no tips", () => {
    const rules = json<R[]>("rules.json");
    const ot = rules.find((r) => r.type === "overtime_policy")?.params as R;
    expect(ot.daily).toEqual([
      { overHours: 8, multiplier: 1.5 },
      { overHours: 12, multiplier: 2 },
    ]);
    expect((ot.weekly as R).overHours).toBe(40);
    expect(ot.seventhConsecutiveDay).toBeNull();
    expect(
      (rules.find((r) => r.type === "commission_plan")?.params as R)
        .pctOfJobProfit,
    ).toBe(8);
    expect(
      (rules.find((r) => r.type === "tip_policy")?.params as R).tipsAllowed,
    ).toBe(false);
  });

  test("8 planted errors (plus the CHK-18 consequence) in b-c05 with resolvable subjects", () => {
    const key = json<R[]>("answer-key.json");
    const checks = new Set(key.map((r) => r.checkId));
    expect(checks.size).toBeGreaterThanOrEqual(8);
    const entries = new Set(
      json<R[]>("timeEntries.json")
        .filter((e) => e.cycleId === "b-c05")
        .map((e) => e.id),
    );
    for (const r of key)
      for (const e of (r.subject as R).entryIds as string[])
        expect(entries.has(e)).toBe(true);
  });

  test("past pay matches the California rule on every hourly row", () => {
    const entries = json<R[]>("timeEntries.json");
    for (const p of json<R[]>("pastPayrolls.json").filter(
      (x) =>
        x.paidVia === "gusto_regular" &&
        (x.earnings as R[])[0].name === "Regular Hours",
    )) {
      const split = caOvertime(
        entries.filter(
          (e) => e.cycleId === p.cycleId && e.workerId === p.workerId,
        ),
      );
      const by = Object.fromEntries(
        (p.earnings as R[]).map((e) => [e.name, e.hours]),
      );
      expect(by["Regular Hours"]).toBe(split.regular);
      expect(by.Overtime ?? 0).toBe(split.overtime);
      expect(by["Double Overtime"] ?? 0).toBe(split.doubleOvertime);
    }
  });
});
