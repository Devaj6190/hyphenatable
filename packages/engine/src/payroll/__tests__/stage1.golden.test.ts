import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { hours2 } from "../money";
import { computeStage1 } from "../stage1";
import type { Stage1Result, TimeEntry, Worker } from "../types";
import { fixtures } from "./fixtures";

const A = fixtures("a");
const B = fixtures("b");
const cycleA = A.cycles.find((c) => c.id === "a-c05");
if (!cycleA) throw new Error("a-c05 missing");
const entriesA = A.entries.filter((e) => e.cycleId === "a-c05");
const runA = (
  o: Partial<Parameters<typeof computeStage1>[4]> = {},
  entries = entriesA,
  workers = A.workers,
  rules = A.rules,
) =>
  computeStage1(cycleA, entries, workers, rules, { company: A.company, ...o });

const summary = (r: Stage1Result) => ({
  lines: r.draft.lines.map((l) => ({
    workerId: l.workerId,
    excluded: l.excluded,
    hourly: l.hourly,
    fixed: l.fixed,
    heldFlagIds: l.heldFlagIds,
    grossCents: r.pay[l.workerId].grossCents,
  })),
  venmoList: r.draft.venmoList,
  excluded: Object.fromEntries(
    Object.values(r.pay)
      .filter((p) => p.kind === "venmo" && p.excluded)
      .map((p) => [p.workerId, p.reason]),
  ),
  totals: r.draft.totals,
});

describe("a-c05 golden (Company A, PA, weekly OT after 40 h, Sat-Fri)", () => {
  const goldenPath = join(import.meta.dirname, "../__golden__/a-c05.json");
  test("matches the hand-computed golden file", () => {
    const got = summary(runA());
    const golden = JSON.parse(readFileSync(goldenPath, "utf8"));
    if (process.env.PIN_GOLDEN === "1") {
      writeFileSync(
        goldenPath,
        `${JSON.stringify({ note: golden.note, ...got }, null, 2)}\n`,
      );
      return;
    }
    const { note: _note, ...expected } = golden;
    expect(got).toEqual(expected);
  });

  test("derived invariant: every payable second of the period is paid or listed", () => {
    const r = runA();
    const paid = Object.values(r.pay)
      .flatMap((p) => p.earnings)
      .reduce((s, e) => s + (e.seconds ?? 0), 0);
    const salaried = new Set(
      A.workers.filter((w) => w.payType === "salary").map((w) => w.id),
    );
    const unpaid = new Set(
      Object.values(r.pay)
        .filter((p) => p.excluded)
        .map((p) => p.workerId),
    );
    const expected = entriesA
      .filter((e) => !salaried.has(e.workerId) && !unpaid.has(e.workerId))
      .reduce((s, e) => s + e.durationSec, 0);
    expect(paid).toBe(expected);
    expect(
      r.draft.lines.some(
        (l) => l.workerId === "a-w09" || l.workerId === "a-w10",
      ),
    ).toBe(false);
  });

  test("the pay_rate rule overrides Gusto (a-w02 $26 rule vs $25 Gusto)", () => {
    expect(runA().pay["a-w02"].rateCents).toBe(2600);
    const proposed = A.rules.map((r) =>
      r.id === "a-rule-17" ? { ...r, status: "proposed" as const } : r,
    );
    expect(runA({}, entriesA, A.workers, proposed).pay["a-w02"].rateCents).toBe(
      2500,
    );
  });

  test("explain carries the arithmetic", () => {
    const e = runA().explain["a-w01"].join("\n");
    expect(e).toContain(
      "week of 2026-10-10: 42.50 h on 5 days → 40.00 regular + 2.50 overtime",
    );
    expect(e).toContain("Overtime 5.00 h (18000 s) × 2800¢ × 1.5 = 21000¢");
    expect(e).toContain("gross 245000¢");
  });
});

describe("week boundary (company timezone, not UTC)", () => {
  const w = "a-w01";
  const mk = (id: string, startAt: string, hours: number): TimeEntry => ({
    ...entriesA[0],
    id,
    sourceId: id,
    workerId: w,
    startAt,
    endAt: null,
    durationSec: hours * 3600,
  });
  // Mon-Thu of the first Sat-Fri week, 10 h each = 40 h.
  const base = ["12", "13", "14", "15"].map((d, i) =>
    mk(`t-${i}`, `2026-10-${d}T12:00:00.000Z`, 10),
  );
  test("Fri 23:30 EDT (Sat 03:30 UTC) counts in week 1 → 2 h OT", () => {
    const r = runA({}, [...base, mk("t-fri", "2026-10-17T03:30:00.000Z", 2)]);
    expect(r.draft.lines.find((l) => l.workerId === w)?.hourly).toEqual([
      { name: "Regular Hours", hours: 40 },
      { name: "Overtime", hours: 2 },
    ]);
  });
  test("Sat 00:30 EDT counts in week 2 → no OT", () => {
    const r = runA({}, [...base, mk("t-sat", "2026-10-17T04:30:00.000Z", 2)]);
    expect(r.draft.lines.find((l) => l.workerId === w)?.hourly).toEqual([
      { name: "Regular Hours", hours: 42 },
    ]);
  });
  test("BREAK and not-payable entries are left out, never trimmed from others", () => {
    const r = runA({}, [
      ...base,
      { ...mk("t-b", "2026-10-16T12:00:00.000Z", 1), category: "BREAK" },
      { ...mk("t-np", "2026-10-16T14:00:00.000Z", 1), payable: false },
    ]);
    expect(r.pay[w].earnings.map((e) => e.seconds)).toEqual([144000]);
    expect(r.explain[w].join("\n")).toContain("t-b left out: BREAK");
  });
});

describe("held entries", () => {
  test("holding a-te-0146 changes exactly a-w02's line", () => {
    const base = runA();
    const held = runA({ heldEntryIds: ["a-te-0146"] });
    const flagged = runA({
      heldFlags: [
        {
          id: "f-1",
          checkId: "CHK-05",
          status: "held",
          subject: { workerId: "a-w02", entryIds: ["a-te-0146"] },
        },
      ],
    });
    for (const r of [held, flagged])
      for (const l of r.draft.lines)
        if (l.workerId !== "a-w02")
          expect(l).toEqual(
            base.draft.lines.find((b) => b.workerId === l.workerId),
          );
    expect(held.pay["a-w02"].grossCents).toBe(74 * 2600 + 2.5 * 3900);
    expect(
      flagged.draft.lines.find((l) => l.workerId === "a-w02")?.heldFlagIds,
    ).toEqual(["f-1"]);
    expect(held.draft.totals.grossCents).toBe(
      base.draft.totals.grossCents - 235300 + 202150,
    );
  });
  test("every entry held → excluded with the flag ids; a worker-level held flag excludes the worker", () => {
    const ids = entriesA.filter((e) => e.workerId === "a-w03").map((e) => e.id);
    const r = runA({ heldEntryIds: ids });
    expect(r.draft.lines.find((l) => l.workerId === "a-w03")).toMatchObject({
      excluded: true,
      hourly: [],
      fixed: [],
    });
    const f = runA({
      heldFlags: [
        {
          id: "f-9",
          checkId: "CHK-09",
          status: "held",
          subject: { workerId: "a-w14", entryIds: [] },
        },
      ],
    });
    expect(f.draft.lines.find((l) => l.workerId === "a-w14")).toMatchObject({
      excluded: true,
      hourly: [],
      heldFlagIds: ["f-9"],
    });
    expect(f.pay["a-w14"].grossCents).toBe(0);
  });
});

describe("no rate → excluded, never a default", () => {
  test("Venmo contractor without a rate is not on the Venmo list (a-w10)", () => {
    const r = runA();
    expect(r.draft.venmoList.map((v) => v.workerId)).toEqual(["a-w09"]);
    expect(r.pay["a-w10"]).toMatchObject({ excluded: true, grossCents: 0 });
    expect(r.explain["a-w10"].join("\n")).toContain("CHK-11");
  });
  test("hourly worker with no rule and no Gusto rate → excluded: true, no amount", () => {
    const workers: Worker[] = A.workers.map((w) =>
      w.id === "a-w14" && w.gusto
        ? { ...w, gusto: { ...w.gusto, rateCents: null } }
        : w,
    );
    const r = runA({}, entriesA, workers);
    expect(r.draft.lines.find((l) => l.workerId === "a-w14")).toMatchObject({
      excluded: true,
      hourly: [],
      fixed: [],
    });
    expect(r.pay["a-w14"].grossCents).toBe(0);
    expect(r.explain["a-w14"].join("\n")).toContain("no pay rate");
  });
  test("no overtime_policy rule → hourly workers with hours held, salaried still paid", () => {
    const r = runA(
      {},
      entriesA,
      A.workers,
      A.rules.filter((x) => x.type !== "overtime_policy"),
    );
    expect(r.draft.lines.find((l) => l.workerId === "a-w01")?.excluded).toBe(
      true,
    );
    expect(r.pay["a-w08"].grossCents).toBe(260000);
  });
});

describe("reimbursements", () => {
  const x = {
    ...A.expenses[0],
    source: "jobber" as const,
    reimbursableToWorkerId: "a-w01",
    reimbursementStatus: "PENDING_REIMBURSEMENT",
  };
  test("pending Jobber reimbursement → fixed Reimbursement, outside gross", () => {
    const r = runA({
      expenses: [
        { ...x, id: "x1", amountCents: 4321 },
        { ...x, id: "x2", reimbursementStatus: "PAID" },
        { ...x, id: "x3", amountCents: null },
      ],
    });
    expect(r.draft.lines.find((l) => l.workerId === "a-w01")?.fixed).toEqual([
      { name: "Reimbursement", amountCents: 4321 },
    ]);
    expect(r.pay["a-w01"].grossCents).toBe(245000);
    expect(r.explain["a-w01"].join("\n")).toContain("x3 held: amount unknown");
  });
});

describe("Company B: California daily + weekly OT reproduces past payrolls to the cent", () => {
  for (const c of B.cycles.filter((c) => c.stage === "closed")) {
    test(c.id, () => {
      const r = computeStage1(
        c,
        B.entries.filter((e) => e.cycleId === c.id),
        B.workers,
        B.rules,
        { company: B.company },
      );
      const paid = B.pastPayrolls.filter(
        (p) => p.cycleId === c.id && p.paidVia === "gusto_regular",
      );
      expect(paid.length).toBeGreaterThan(20);
      for (const p of paid) {
        const got = r.pay[p.workerId];
        expect(got.excluded, p.workerId).toBe(false);
        expect(
          got.earnings.map((e) => [
            e.name,
            e.hours === null ? null : e.hours,
            e.amountCents,
          ]),
          p.workerId,
        ).toEqual(
          p.earnings.map((e) => [
            e.name,
            e.hours === null ? null : hours2(Math.round(e.hours * 3600)),
            e.amountCents,
          ]),
        );
        expect(got.grossCents).toBe(p.grossCents);
      }
    });
  }
  test("b-c05: b-w07's 13 h day splits 8 / 4 at 1.5x / 1 at 2x", () => {
    const c = B.cycles.find((x) => x.id === "b-c05");
    if (!c) throw new Error("b-c05 missing");
    const r = computeStage1(
      c,
      B.entries.filter((e) => e.cycleId === c.id),
      B.workers,
      B.rules,
      { company: B.company },
    );
    expect(r.explain["b-w07"].join("\n")).toMatch(
      /13\.00 h → 8\.00 regular \+ 4\.00 overtime \+ 1\.00 double overtime/,
    );
  });
  test("seven worked days under a daily policy are held, not guessed", () => {
    const c = B.cycles.find((x) => x.id === "b-c05");
    if (!c) throw new Error("b-c05 missing");
    const e0 = B.entries.find(
      (e) => e.cycleId === "b-c05" && e.workerId === "b-w05",
    );
    if (!e0) throw new Error("no b-w05 entry");
    const week = [18, 19, 20, 21, 22, 23, 24].map((d) => ({
      ...e0,
      id: `s-${d}`,
      startAt: `2026-10-${d}T15:00:00.000Z`,
      durationSec: 4 * 3600,
    }));
    const r = computeStage1(c, week, B.workers, B.rules, {
      company: B.company,
    });
    expect(r.pay["b-w05"]).toMatchObject({ excluded: true, grossCents: 0 });
    expect(r.pay["b-w05"].reason).toContain("seventh-consecutive-day");
  });
});
