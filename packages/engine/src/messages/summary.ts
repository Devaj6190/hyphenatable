import type { Cycle, Flag } from "@payrollpilot/engine/schemas";
import { fill, MAX_LEN, render } from "./templates";

// The manager's summary text: how many items need them this cycle, the top categories, and a link to their page.
// Categories are plain words, never names or dollar amounts. Ties keep this order: hours problems first,
// because they decide the paycheck.
const CATEGORIES: { checks: Flag["checkId"][]; one: string; many: string }[] = [
  { checks: ["CHK-04", "CHK-05"], one: "hour mix-up", many: "hour mix-ups" },
  { checks: ["CHK-02"], one: "running timer", many: "running timers" },
  { checks: ["CHK-03"], one: "long shift", many: "long shifts" },
  {
    checks: ["CHK-01"],
    one: "entry with no job",
    many: "entries with no job",
  },
  { checks: ["CHK-06"], one: "unapproved entry", many: "unapproved entries" },
  {
    checks: ["CHK-07"],
    one: "worker with no hours",
    many: "workers with no hours",
  },
  {
    checks: ["CHK-08"],
    one: "inactive worker with hours",
    many: "inactive workers with hours",
  },
  { checks: ["CHK-13"], one: "job with no labor", many: "jobs with no labor" },
  {
    checks: ["CHK-14"],
    one: "purchase with no job",
    many: "purchases with no job",
  },
  {
    checks: ["CHK-15"],
    one: "possible double purchase",
    many: "possible double purchases",
  },
  {
    checks: ["CHK-16"],
    one: "unlinked disposal",
    many: "unlinked disposals",
  },
];
const OTHER = { one: "other item", many: "other items" };

export const TOP_CATEGORIES = 3;

// Flags a manager still has to act on; corrected, dismissed and held items are past them.
export const NEEDS_MANAGER: readonly Flag["status"][] = [
  "open",
  "asked",
  "answered",
];

// Shown in place of the link when DASHBOARD_URL is not set, so the text still renders and reads as unfinished.
export const DASHBOARD_URL_PLACEHOLDER = "[DASHBOARD_URL not set]";

export function managerLink(
  dashboardUrl: string | null | undefined,
  companyId: string,
): string {
  const base =
    dashboardUrl?.trim().replace(/\/+$/, "") || DASHBOARD_URL_PLACEHOLDER;
  return `${base}/c/${companyId}/manager`;
}

// "Oct 10–23", or "Sep 26–Oct 9" across a month, in the company's timezone.
export function dateRange(
  cycle: Pick<Cycle, "periodStart" | "periodEnd">,
  timeZone: string,
): string {
  const parts = (iso: string) => {
    const p = new Intl.DateTimeFormat("en-US", {
      timeZone,
      month: "short",
      day: "numeric",
    }).formatToParts(new Date(iso));
    const get = (type: string) => p.find((x) => x.type === type)?.value ?? "";
    return { month: get("month"), day: get("day") };
  };
  const start = parts(cycle.periodStart);
  const end = parts(cycle.periodEnd);
  return start.month === end.month
    ? `${start.month} ${start.day}–${end.day}`
    : `${start.month} ${start.day}–${end.month} ${end.day}`;
}

function categoryCounts(flags: Flag[]) {
  const counts = new Map<number, number>();
  for (const flag of flags) {
    const i = CATEGORIES.findIndex((c) => c.checks.includes(flag.checkId));
    const key = i === -1 ? CATEGORIES.length : i;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a, x], [b, y]) => y - x || a - b)
    .map(([i, n]) => {
      const words = CATEGORIES[i] ?? OTHER;
      return `${n} ${n === 1 ? words.one : words.many}`;
    });
}

// null when nothing needs the manager this cycle: no text is sent.
export function managerSummary(input: {
  flags: Flag[];
  cycle: Pick<Cycle, "id" | "companyId" | "periodStart" | "periodEnd">;
  timeZone: string;
  dashboardUrl?: string | null;
}): string | null {
  const { cycle } = input;
  const mine = input.flags.filter(
    (f) =>
      f.cycleId === cycle.id &&
      f.routeTo === "manager" &&
      NEEDS_MANAGER.includes(f.status),
  );
  if (mine.length === 0) return null;

  const categories = categoryCounts(mine);
  const vars = {
    count: `${mine.length} ${mine.length === 1 ? "item" : "items"}`,
    need: mine.length === 1 ? "needs" : "need",
    range: dateRange(cycle, input.timeZone),
    link: managerLink(input.dashboardUrl, cycle.companyId),
  };
  // Fewer categories when a long link would push the text over the limit; render() still checks the result.
  let shown = Math.min(TOP_CATEGORIES, categories.length);
  const withCategories = (n: number) => ({
    ...vars,
    categories:
      categories.slice(0, n).join(", ") + (categories.length > n ? "…" : ""),
  });
  while (
    shown > 0 &&
    fill("managerSummary", withCategories(shown)).length > MAX_LEN
  )
    shown--;
  return render("managerSummary", withCategories(shown));
}
