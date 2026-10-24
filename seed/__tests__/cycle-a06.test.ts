import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateExtensions } from "../generate";
import { validateDir } from "../validate";

// Update only when the a-c06 extension changes on purpose. The base hash (EXPECTED_SHA256_A) must not move.
const EXPECTED_SHA256_A06 =
  "8a8ddaac299bd683e0f1e45eab2a3badb0937531847e8fb01bd69db05e416458";

type R = Record<string, unknown>;
const ext = generateExtensions("a")["a-c06"];
const json = <T>(f: string) => JSON.parse(ext[f]) as T;
const fixtures = join(import.meta.dir, "..", "..", "data", "fixtures", "a");
const hashAll = (files: Record<string, string>) => {
  const h = createHash("sha256");
  for (const f of Object.keys(files).sort()) h.update(`${f}\n${files[f]}`);
  return h.digest("hex");
};

describe("Company A cycle 2 (a-c06) extension", () => {
  test("deterministic, pinned, and committed", () => {
    expect(hashAll(generateExtensions("a")["a-c06"])).toBe(hashAll(ext));
    expect(hashAll(ext)).toBe(EXPECTED_SHA256_A06);
    for (const [f, text] of Object.entries(ext))
      expect(readFileSync(join(fixtures, "cycles", "a-c06", f), "utf8")).toBe(
        text,
      );
  });

  test("validates against the base fixtures (every reference resolves)", () => {
    const dir = mkdtempSync(join(tmpdir(), "a06-"));
    mkdirSync(join(dir, "ext"));
    for (const [f, text] of Object.entries(ext))
      writeFileSync(join(dir, "ext", f), text);
    expect(validateDir(fixtures, [join(dir, "ext")])).toEqual([]);
  });

  test("Gusto's next period, the given unprocessed payroll, new ids only", () => {
    const [c] = json<R[]>("cycles.json");
    expect([c.id, c.gustoPayrollId]).toEqual([
      "a-c06",
      "749072b9-abc7-4a30-aa64-6e8bd5811a08",
    ]);
    expect(c.periodStart).toBe("2026-10-24T04:00:00.000Z"); // Sat 00:00 EDT
    expect(c.periodEnd).toBe("2026-11-07T04:59:59.999Z"); // Fri 23:59:59.999 EST (DST ended Nov 1)
    for (const e of json<R[]>("timeEntries.json"))
      expect(String(e.id)).toMatch(/^a-te-06\d\d$/);
    const base = new Set(
      (
        JSON.parse(
          readFileSync(join(fixtures, "timeEntries.json"), "utf8"),
        ) as R[]
      ).map((e) => e.id),
    );
    for (const e of json<R[]>("timeEntries.json"))
      expect(base.has(e.id)).toBe(false);
  });

  test("same planted-error mix as a-c05", () => {
    const baseChecks = new Set(
      (
        JSON.parse(
          readFileSync(join(fixtures, "answer-key.json"), "utf8"),
        ) as R[]
      ).map((r) => r.checkId),
    );
    const c06 = json<R[]>("answer-key.json");
    expect(new Set(c06.map((r) => r.checkId))).toEqual(baseChecks);
    for (const r of c06) expect(r.cycleId).toBe("a-c06");
  });

  test("rows a rule learned from cycle 1 resolves are marked; the rest still ask", () => {
    const c06 = json<R[]>("answer-key.json");
    const resolvable = c06.filter((r) => r.resolvableByRuleType);
    expect(resolvable.map((r) => r.checkId).sort()).toEqual([
      "CHK-10",
      "CHK-11",
      "CHK-14",
      "CHK-16",
      "CHK-17",
      "CHK-18",
      "CHK-19",
      "CHK-20",
      "CHK-22",
    ]);
    expect(
      c06.filter((r) => r.resolvableByRuleType === null).length,
    ).toBeGreaterThan(10);
  });

  test("a-c05 as paid after cycle 1's answers is the history for a-c06's CHK-22", () => {
    const pp = json<R[]>("pastPayrolls.json");
    expect(new Set(pp.map((p) => p.cycleId))).toEqual(new Set(["a-c05"]));
    expect(pp.some((p) => p.workerId === "a-w14")).toBe(false); // held until onboarding
    const w02 = pp.find((p) => p.workerId === "a-w02") as R;
    expect(((w02.earnings as R[])[0] as R).rateCents).toBe(2600); // cycle 1 answer: $26.00/h
  });
});
