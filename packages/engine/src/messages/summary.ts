import type { Cycle, Flag } from "@payrollpilot/engine/schemas";
import { issuePhrases, render, type TemplateKey } from "./templates";

// The manager's summary text, built from the cycle's flags. Wording and the issue phrases live at the top of
// templates.ts. Never a name other than the manager's first name, never a dollar amount.

// Flags a manager still has to act on; corrected, dismissed and held items are past them.
export const NEEDS_MANAGER: readonly Flag["status"][] = [
  "open",
  "asked",
  "answered",
];

// null when the dashboard URL is not set: the text then ends before the link sentence.
export function managerLink(
  dashboardUrl: string | null | undefined,
  companyId: string,
): string | null {
  const base = dashboardUrl?.trim().replace(/\/+$/, "");
  return base ? `${base}/c/${companyId}/manager` : null;
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

// The most common flag type; a tie goes to the lower check number (hours checks come first).
export function topIssue(flags: Flag[]): Flag["checkId"] {
  const counts = new Map<Flag["checkId"], number>();
  for (const flag of flags)
    counts.set(flag.checkId, (counts.get(flag.checkId) ?? 0) + 1);
  const [top] = [...counts.entries()].sort(
    ([a, x], [b, y]) => y - x || a.localeCompare(b),
  );
  if (!top) throw new Error("topIssue needs at least one flag");
  return top[0];
}

// null when nothing needs the manager this cycle: no text is sent.
export function managerSummary(input: {
  flags: Flag[];
  cycle: Pick<Cycle, "id" | "companyId" | "periodStart" | "periodEnd">;
  timeZone: string;
  managerFirstName: string;
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

  const one = mine.length === 1;
  const phrase = issuePhrases[topIssue(mine)];
  const link = managerLink(input.dashboardUrl, cycle.companyId);
  const key: TemplateKey = one
    ? link
      ? "managerSummaryOne"
      : "managerSummaryOneNoLink"
    : link
      ? "managerSummary"
      : "managerSummaryNoLink";
  return render(key, {
    name: input.managerFirstName,
    range: dateRange(cycle, input.timeZone),
    count: String(mine.length),
    issue: one ? phrase.one : phrase.many,
    ...(link ? { link } : {}),
  });
}
