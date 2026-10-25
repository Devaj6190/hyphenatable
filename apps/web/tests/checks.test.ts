import { CheckId } from "@payrollpilot/engine/schemas";
import { describe, expect, test } from "vitest";
import { checkTitle, checkTitles } from "../lib/checks";

describe("flag titles", () => {
  test("every flag id in the contract has a plain title", () => {
    for (const id of CheckId.options) expect(checkTitles[id]).toBeTruthy();
  });

  // The judge-scenario escalation is an AGT-01 flag, so its title must never fall back to the raw id.
  test("AGT-01 and LRN-01 have titles, not their raw ids", () => {
    expect(checkTitle("AGT-01")).toBe("Unusual case, needs your decision");
    expect(checkTitle("LRN-01")).toBe("Answer contradicts a rule");
  });

  test("titles use plain words, never accusation", () => {
    for (const title of Object.values(checkTitles)) {
      expect(title).not.toMatch(/fraud|stole|cheat/i);
    }
  });
});
