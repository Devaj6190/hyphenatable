import type { Flag, SourceSystem } from "@/lib/types";
import type { Cycle, FlagInfo, SyncRun } from "@/lib/view-types";

// Live Convex flags have no fixture info yet; the controller found it if nobody else is on record.
const NO_INFO: FlagInfo = {
  question: null,
  recipient: "the right person",
  reply: null,
  agents: ["controller"],
};
export const infoFor = (info: Record<string, FlagInfo>, flagId: string) =>
  info[flagId] ?? NO_INFO;

// The eight stages from the C plan (4.5), mapped from Cycle.stage.
export const STAGES = [
  { label: "Collecting", hint: "Pulling Jobber, QuickBooks and Gusto" },
  { label: "Checking", hint: "Running every check on the records" },
  { label: "Asking", hint: "Questions out, answers coming in" },
  { label: "Gate 1", hint: "You approve wages", gate: true },
  { label: "Draft filled", hint: "Gusto draft only. You submit." },
  { label: "Reconciling", hint: "Payments, expenses and job profit" },
  { label: "Gate 2", hint: "You approve commissions", gate: true },
  { label: "Done", hint: "Cycle closed" },
] as const;

export const stageIndex: Record<Cycle["stage"], number> = {
  setup: 0,
  syncing: 0,
  checking: 1,
  asking: 2,
  gate1_ready: 3,
  stage1_filled: 4,
  reconciling: 5,
  gate2_ready: 6,
  stage2_filled: 7,
  closed: 7,
};

export const SOURCES: { key: string; system: SourceSystem }[] = [
  { key: "jobber", system: "Jobber" },
  { key: "qbo", system: "QuickBooks" },
  { key: "gusto", system: "Gusto" },
];

const objectWords: Record<string, string> = {
  timeSheetEntries: "time entries",
  Purchase: "purchases",
  employees: "workers",
  expenses: "expenses",
  visits: "visits",
};
export const objectWord = (o: string) => objectWords[o] ?? o;

// Records the checks read line by line; "clean" counts these minus the ones a flag points at.
const CHECKED_OBJECTS = ["timeSheetEntries", "Purchase", "expenses"];

export function countFlags(flags: Flag[], runs: SyncRun[]) {
  const by = (s: Flag["status"][]) =>
    flags.filter((f) => s.includes(f.status)).length;
  const checked = runs
    .filter((r) => CHECKED_OBJECTS.includes(r.object))
    .reduce((n, r) => n + r.pulled, 0);
  const flagged = new Set(
    flags.flatMap((f) => [...f.subject.entryIds, ...f.subject.expenseIds]),
  ).size;
  return {
    clean: checked > 0 ? Math.max(0, checked - flagged) : null,
    checked,
    fixed: by(["corrected"]),
    needsYou: by(["open", "answered"]),
    waiting: by(["asked"]),
    open: by(["open", "answered", "asked"]),
    held: by(["held"]),
  };
}

export function affectsLabel(checkId: string): string {
  const n = Number(checkId.slice(4));
  if (n <= 12 || n === 22) return "Wages";
  if (n === 23) return "Everything it covers";
  if (n === 19 || n === 20) return "Commission";
  return "Job cost";
}

/** "6:06 PM" in the company's zone. Assembled from parts so server and browser render the same string. */
export function clock(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone,
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("hour")}:${get("minute")} ${get("dayPeriod")}`;
}

// ── Home V5 ─────────────────────────────────────────────────────────────────────────────────────────────────

/** The board's own steps. Runs and fills are short animations between the cycle's stages. */
export type BoardStage =
  | "start"
  | "run"
  | "asking"
  | "review"
  | "fill1"
  | "filled1"
  | "reconRun"
  | "recon"
  | "review2"
  | "fill2"
  | "done";

export const BOARD_ORDER: BoardStage[] = [
  "start",
  "run",
  "asking",
  "review",
  "fill1",
  "filled1",
  "reconRun",
  "recon",
  "review2",
  "fill2",
  "done",
];

/** Where a stored cycle opens the board (C plan PR 3: cycles.stage → step). */
export const boardStageOf: Record<Cycle["stage"], BoardStage> = {
  setup: "start",
  syncing: "run",
  checking: "run",
  asking: "asking",
  gate1_ready: "review",
  stage1_filled: "filled1",
  reconciling: "recon",
  gate2_ready: "review2",
  stage2_filled: "done",
  closed: "done",
};

/** Index into STAGES for a board stage; -1 before the run. `run` is Collecting, then Checking. */
export function stepOf(stage: BoardStage, checking = false): number {
  switch (stage) {
    case "start":
      return -1;
    case "run":
      return checking ? 1 : 0;
    case "asking":
      return 2;
    case "review":
      return 3;
    case "fill1":
    case "filled1":
      return 4;
    case "reconRun":
    case "recon":
      return 5;
    case "review2":
    case "fill2":
      return 6;
    case "done":
      return 7;
  }
}

/**
 * Matches a flag across sources. Convex rewrites flag ids on ingest but never `where[].recordId` (the source
 * record ids), so the check and the records it points at name the same flag in the fixture and live.
 */
export const flagKey = (f: Pick<Flag, "checkId" | "where">) =>
  `${f.checkId}:${f.where
    .map((w) => w.recordId)
    .sort()
    .join(",")}`;

/**
 * The one text the owner approves for the manager: counts by group and a link, built from the ticked items.
 * No names, no pay, no record details: the manager opens the link for those.
 */
export function managerText(
  groups: { key: string; one: string; many: string }[],
  included: { group: string }[],
  period: string,
): string {
  const n = included.length;
  const parts = groups
    .map((g) => ({ g, k: included.filter((i) => i.group === g.key).length }))
    .filter((x) => x.k > 0)
    .map(({ g, k }) => `${k} ${k === 1 ? g.one : g.many}`);
  return `RollPay: ${n} ${n === 1 ? "item needs" : "items need"} you before payroll (${period}): ${parts.join(", ")}. Review: [link]`;
}
