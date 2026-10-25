import { describe, expect, test } from "vitest";
import { flagKey, managerText, stepOf } from "@/lib/home";
import { viewerForRole } from "@/lib/server/fixtures";
import { homeBoardView } from "@/lib/server/views/home";

const owner = viewerForRole("a", "owner");
const manager = viewerForRole("a", "manager");
const data = homeBoardView(owner, "a");
if (!data) throw new Error("owner gets the board");

// Any key that holds money, at any depth.
function moneyKeys(x: unknown, path = ""): string[] {
  if (Array.isArray(x))
    return x.flatMap((v, i) => moneyKeys(v, `${path}[${i}]`));
  if (x && typeof x === "object")
    return Object.entries(x).flatMap(([k, v]) => [
      ...(/cents|rate/i.test(k) && v !== null ? [`${path}.${k}`] : []),
      ...moneyKeys(v, `${path}.${k}`),
    ]);
  return [];
}

describe("homeBoardView", () => {
  test("a manager gets nothing: no board, so no pay to leak", () => {
    expect(homeBoardView(manager, "a")).toBeNull();
  });

  test("shape: the stored cycle, its pulls and the checks' flags", () => {
    expect(data.cycle?.id).toBe("a-c05");
    expect(data.cycle?.stage).toBe("setup");
    expect(data.stageNote).toBeNull();
    expect(data.flags.every((f) => f.cycleId === "a-c05")).toBe(true);
    expect(data.run.checks).toBe(23);
    // Informational CHK-12 flags (routed to nobody) are not counted as problems.
    expect(data.run.found).toBe(
      data.flags.filter((f) => f.routeTo !== "none").length,
    );
    expect(data.run.pulls.map((p) => p.system)).toEqual([
      "Jobber",
      "QuickBooks",
      "Gusto",
    ]);
    expect(data.states.incomplete).toEqual([]);
    expect(data.states.gusto.connected).toBe(true);
  });

  test("every card traces to its flags and source records", () => {
    const ids = new Set(data.flags.map((f) => f.id));
    expect(data.cards.length).toBeGreaterThan(5);
    for (const c of data.cards) {
      expect(c.flagIds.length).toBeGreaterThan(0);
      expect(c.flagIds.every((id) => ids.has(id))).toBe(true);
      expect(c.flagKeys).toHaveLength(c.flagIds.length);
      expect(c.sources.length).toBeGreaterThan(0);
    }
    expect(data.cards.some((c) => c.stage === 2)).toBe(true);
  });

  test("Dakota's list is the manager-routed flags, with no pay in it", () => {
    const routed = data.flags.filter((f) => f.routeTo === "manager");
    expect(data.dakota.items.map((i) => i.flagId).sort()).toEqual(
      routed.map((f) => f.id).sort(),
    );
    expect(moneyKeys(data.dakota)).toEqual([]);
    expect(JSON.stringify(data.dakota)).not.toMatch(/\$\d/);
    for (const i of data.dakota.items) {
      expect(i.sources.length).toBeGreaterThan(0);
      expect(data.dakota.groups.some((g) => g.key === i.group)).toBe(true);
    }
    expect(data.dakota.demoReplies).toHaveLength(data.dakota.items.length);
  });

  test("Stage 2 numbers are the engine's, from stage2.json", () => {
    const ready = data.stage2?.commissions.filter((c) => c.state === "ready");
    expect(ready?.map((c) => c.amountCents)).toEqual([32140]);
    expect(data.stage2?.readyCents).toBe(32140);
    expect(
      data.stage2?.commissions
        .filter((c) => c.state === "waiting")
        .every((c) => c.amountCents === null),
    ).toBe(true);
    expect(data.review?.laborShare.nowPct).toBe(50.1);
    expect(data.next?.rows.find((r) => r.tag === "released")?.amountCents).toBe(
      18124,
    );
  });

  test("other companies get an empty board, not someone else's records", () => {
    const b = homeBoardView(viewerForRole("b", "owner"), "b");
    expect(b?.cards).toEqual([]);
    expect(b?.dakota.items).toEqual([]);
    expect(b?.stage2).toBeNull();
  });
});

describe("home helpers", () => {
  test("managerText counts what is ticked and names nobody", () => {
    const text = managerText(
      data.dakota.groups,
      data.dakota.items,
      data.dakota.period,
    );
    expect(text).toMatch(
      /^RollPay: 10 items need you before payroll \(Oct 10–23\): /,
    );
    expect(text).toContain("3 hour mix-ups");
    for (const name of ["Sam", "Jordan", "Casey", "Morgan", "Dakota"])
      expect(text).not.toContain(name);
    expect(text).not.toMatch(/\$/);
    expect(
      managerText(
        data.dakota.groups,
        data.dakota.items.slice(0, 1),
        "Oct 10–23",
      ),
    ).toContain("1 item needs");
  });

  test("flagKey ignores ids Convex rewrites", () => {
    const f = data.flags[0];
    expect(flagKey({ ...f, id: "convex-id" } as typeof f)).toBe(flagKey(f));
  });

  test("stepOf maps the board to the eight stages", () => {
    expect(stepOf("start")).toBe(-1);
    expect(stepOf("run")).toBe(0);
    expect(stepOf("run", true)).toBe(1);
    expect(stepOf("review")).toBe(3);
    expect(stepOf("done")).toBe(7);
  });
});
