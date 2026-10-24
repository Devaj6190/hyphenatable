import { describe, expect, test } from "bun:test";
import {
  generate,
  generateExtensions,
  loadConfig,
  serialize,
} from "../generate";
import { ROUTE } from "../lib/flags";

type R = Record<string, unknown>;
const base = serialize(generate(loadConfig("a")));
const ext = generateExtensions("a")["a-c06"];
const j = <T>(files: Record<string, string>, f: string) =>
  JSON.parse(files[f]) as T;

describe("expected flags (derived from the answer key)", () => {
  for (const [name, files] of [
    ["a-c05", base],
    ["a-c06", ext],
  ] as const) {
    test(`${name}: one flag per answer-key row (+ CHK-23 extras), same check and subject`, () => {
      const key = j<R[]>(files, "answer-key.json");
      const flags = j<R[]>(files, "flags.json");
      const keyed = flags.filter((f) => f.checkId !== "CHK-23");
      expect(keyed).toHaveLength(key.length);
      key.forEach((row, i) => {
        expect(keyed[i].checkId).toBe(row.checkId);
        expect(keyed[i].subject).toEqual(row.subject);
      });
      for (const f of flags) {
        expect(f.status).toBe("open");
        expect(f.routeTo).toBe(ROUTE[f.checkId as string]);
        expect(String(f.seen)).not.toMatch(/undefined/);
        expect((f.where as R[]).length).toBeGreaterThan(0);
        expect(f.confidence).toEqual(
          ["CHK-14", "CHK-15", "CHK-20"].includes(f.checkId as string)
            ? expect.any(Number)
            : "certain",
        );
        expect(f.questionId).toBeNull();
        expect(f.correctionId).toBeNull();
      }
      expect(new Set(flags.map((f) => f.id)).size).toBe(flags.length);
    });
  }

  test("CHK-23 extra for the incomplete a-c04 sync run; a-c06 precedents point at a-c05 flags or rules", () => {
    const f23 = j<R[]>(base, "flags.json").filter(
      (f) => f.checkId === "CHK-23",
    );
    expect(f23.map((f) => [f.cycleId, (f.where as R[])[0].recordId])).toEqual([
      ["a-c04", "a-sr-04"],
    ]);
    const priorIds = new Set(j<R[]>(base, "flags.json").map((f) => f.id));
    for (const f of j<R[]>(ext, "flags.json")) {
      const p = f.precedent as R;
      if (p.flagId) expect(priorIds.has(p.flagId)).toBe(true);
    }
  });
});
