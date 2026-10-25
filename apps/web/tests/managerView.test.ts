import { describe, expect, test } from "vitest";
import cycles from "../../../data/fixtures/a/cycles.json";
import expenses from "../../../data/fixtures/a/expenses.json";
import flags from "../../../data/fixtures/a/flags.json";
import jobs from "../../../data/fixtures/a/jobs.json";
import rules from "../../../data/fixtures/a/rules.json";
import entries from "../../../data/fixtures/a/timeEntries.json";
import roster from "../../../data/fixtures/a/workers.json";
import { viewerFor } from "../lib/policy";
import {
  buildEmployeeReview,
  buildManagerInbox,
  type RawFlag,
  type Records,
} from "../lib/server/views/managerBuild";
import type { FixtureWorker } from "../lib/types";

const workers = roster.map(({ id, displayName, role, managerId }) => ({
  id,
  displayName,
  role,
  managerId,
})) as FixtureWorker[];

const records: Records = {
  companyId: "a",
  timezone: "America/New_York",
  cycle: [...cycles].sort((a, b) => a.number - b.number).at(-1) ?? null,
  flags: flags as RawFlag[],
  entries,
  jobs,
  expenses,
  rules,
  workers,
};
const manager = viewerFor("manager", "a-w11", workers);

// Every number a page may show, as text. Pay never appears: no "$", no cents, and none of the raw amounts.
const PAY = /\$|cents|rate|gross|wage/i;
const amounts = [
  ...expenses.map((e) => e.amountCents),
  ...jobs.map((j) => j.totalCents),
].filter((n): n is number => typeof n === "number" && n > 0);
function expectNoPay(view: unknown) {
  const text = JSON.stringify(view);
  expect(text).not.toMatch(PAY);
  for (const n of amounts) {
    expect(text).not.toContain(String(n));
    expect(text).not.toContain((n / 100).toFixed(2));
  }
}

describe("buildManagerInbox", () => {
  const view = buildManagerInbox(manager, records);

  test("has the manager's ten items this cycle, fix items first", () => {
    expect(view.cycleId).toBe("a-c05");
    expect(view.period).toBe("Oct 10 – 23");
    expect(view.items.map((i) => i.flagId).sort()).toEqual(
      [
        "a-fl-01",
        "a-fl-02",
        "a-fl-03",
        "a-fl-04",
        "a-fl-05",
        "a-fl-08",
        "a-fl-09",
        "a-fl-14",
        "a-fl-20",
        "a-fl-22",
      ].sort(),
    );
    const kinds = view.items.map((i) => i.kind);
    expect(kinds.indexOf("answer")).toBe(kinds.lastIndexOf("fix") + 1);
    expect(view.items.filter((i) => i.kind === "fix")).toHaveLength(6);
  });

  test("each item says why, names its source records and has options", () => {
    for (const i of view.items) {
      expect(i.why.length).toBeGreaterThan(10);
      expect(i.sources.length).toBeGreaterThan(0);
      expect(i.options.length).toBeGreaterThanOrEqual(2);
      if (i.fixOption !== null)
        expect(i.fixOption).toBeLessThan(i.options.length);
      if (i.kind === "fix") {
        expect(i.fix).not.toBeNull();
        expect(i.link?.url).toMatch(/^https:\/\/secure\.getjobber\.com/);
      }
      // Record ids in the rows trace back to the flag's sources.
      for (const r of i.rows)
        expect(i.sources.map((s) => s.recordId)).toContain(r.recordId);
    }
  });

  test("states the records exactly", () => {
    const dup = view.items.find((i) => i.flagId === "a-fl-09");
    expect(dup?.why).toBe(
      "Both run 7:00 AM – 3:30 PM. Counting both would pay Tuesday twice.",
    );
    expect(dup?.rows).toEqual([
      { recordId: "a-te-0106", detail: "7:00 AM – 3:30 PM · 8.5 h" },
      { recordId: "a-te-0146", detail: "7:00 AM – 3:30 PM · 8.5 h" },
    ]);
    const overlap = view.items.find((i) => i.flagId === "a-fl-04");
    expect(overlap?.why).toContain("from 12:00 PM to 3:30 PM");
    expect(overlap?.demoRecheck).toEqual(["still-there", "fixed"]);
    expect(view.items.find((i) => i.flagId === "a-fl-03")?.ruleId).toBe(
      "a-rule-02",
    );
  });

  test("no pay anywhere, including the purchase with no job", () => {
    expectNoPay(view);
    // The raw flag text states the purchase amount; the inbox never passes it on.
    expect(JSON.stringify(view)).not.toContain("214");
  });

  test("owner-routed and unrouted flags stay out", () => {
    const owner = new Set(
      flags.filter((f) => f.routeTo !== "manager").map((f) => f.id),
    );
    for (const i of view.items) expect(owner.has(i.flagId)).toBe(false);
  });

  test("someone with no crew gets only the job flags that name no worker", () => {
    const other = viewerFor("manager", "a-w01", workers);
    const v = buildManagerInbox(other, records);
    for (const i of v.items)
      expect(flags.find((f) => f.id === i.flagId)?.subject.workerId).toBeNull();
  });
});

describe("buildEmployeeReview", () => {
  const link = { token: "s7q", workerId: "a-w03", flagId: "a-fl-04" };
  const view = buildEmployeeReview(
    { ...records, companyName: "Greenline Landscaping" },
    link,
  );

  test("one question about their own overlap, with their own hours", () => {
    expect(view?.worker).toEqual({ id: "a-w03", firstName: "Sam" });
    expect(view?.managerFirstName).toBe("Dakota");
    expect(view?.question?.text).toBe(
      "You have two entries that overlap. Which is right?",
    );
    expect(view?.question?.options.map((o) => o.label)).toEqual([
      "7:00 – 3:30 only",
      "12:00 – 4:00 only",
      "One shift, 7:00 – 4:00",
      "Something else",
    ]);
    const mine = new Set(
      entries
        .filter((e) => e.workerId === "a-w03" && e.cycleId === "a-c05")
        .map((e) => e.id),
    );
    for (const d of view?.days ?? [])
      for (const id of d.recordIds) expect(mine.has(id)).toBe(true);
    expect(view?.days.filter((d) => d.flagged)).toHaveLength(1);
    expect(view?.weeks.map((w) => w.label)).toEqual([
      "Week of Oct 10",
      "Week of Oct 17",
    ]);
  });

  test("hours only, no pay", () => {
    expectNoPay(view);
  });

  test("a link for a flag about someone else does not open", () => {
    expect(
      buildEmployeeReview(
        { ...records, companyName: "x" },
        { ...link, workerId: "a-w02" },
      ),
    ).toBeNull();
  });
});
