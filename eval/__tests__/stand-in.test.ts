import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { loadFixtures } from "../lib/io";
import { buildResults } from "../metrics";
import { naiveFlags } from "../naive-checks";
import { Results } from "../schema";

describe("naive stand-in flags (not B's checks engine)", () => {
  const fx = loadFixtures("a");
  test("they cover every planted row in both cycles; only the unkeyed CHK-23 is unmatched", () => {
    const flags = [...naiveFlags(fx, "a-c05"), ...naiveFlags(fx, "a-c06")];
    for (const cycleId of ["a-c05", "a-c06"]) {
      const r = buildResults({
        fx,
        cycleId,
        flags,
        flagsSource: "naive",
        m2: { status: "pending", reason: "test" },
        syntheticBacktest: null,
        generatedAt: "2026-10-24T12:00:00.000Z",
        gitSha: null,
      });
      expect(r.m1.missedKeyRowIds).toEqual([]);
      // a-sr-04 is expected but not keyed (data/fixtures/README.md).
      expect(r.m1.unmatchedFlags.map((f) => f.checkId)).toEqual(["CHK-23"]);
    }
  });
  test("the committed flags.json is what make-flags.ts writes", () => {
    const committed = JSON.parse(
      readFileSync(join(import.meta.dirname, "../fixtures/flags.json"), "utf8"),
    );
    expect(committed).toEqual([
      ...naiveFlags(fx, "a-c05"),
      ...naiveFlags(fx, "a-c06"),
    ]);
  });
  test("the committed results.json validates and says its flags come from the checks engine", () => {
    const committed = JSON.parse(
      readFileSync(join(import.meta.dirname, "../results.json"), "utf8"),
    );
    expect(Results.safeParse(committed).success).toBe(true);
    expect(committed.flagsSource).toContain("checks engine");
    expect(committed.synthetic).toBe(true);
  });
});
