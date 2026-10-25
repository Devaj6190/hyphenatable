import type { SourceSystem } from "@/lib/types";
import type { HomeData } from "@/lib/view-types";

// What the server hands Home V5 (lib/server/views/home.ts homeBoardView). Owner only: a manager is redirected to
// their inbox before this is built, and the view returns null for one. Money is integer cents, already worked out
// by the engine (app/_fixtures/workbook.json, app/_fixtures/stage2.json); amounts inside strings were formatted on
// the server from those cents. Nothing here is computed in the browser.

export type SourceRef = { system: SourceSystem; recordId: string };

/** The card's colour family (mockup Cards board). Status words carry the meaning; tone only backs them up. */
export type CardTone = "text" | "sunset" | "gold" | "coral" | "sky" | "green";

export type CardOption = {
  key: string;
  /** Which system the option comes from, for the brand mark; null for "Other" or a rule. */
  system: SourceSystem | null;
  kicker: string;
  value: string;
  hint: string;
};

/** One thing the owner decides. Built from one or more flags with the same question. */
export type HomeCard = {
  id: string;
  flagIds: string[];
  /** lib/home.ts flagKey of each flag: matches a live Convex flag, whose ids differ from the fixture's. */
  flagKeys: string[];
  checkId: string;
  /** 1: before Gate 1 (wages). 2: before Gate 2 (job profit and commissions). */
  stage: 1 | 2;
  kind: "pick" | "fill" | "facts" | "bars" | "diff";
  tone: CardTone;
  icon: string;
  kicker: string;
  title: string;
  sub: string;
  foot: string;
  options: CardOption[];
  facts: { label: string; value: string; person: boolean }[];
  /** Pay per cycle, oldest first; the last bar is this cycle. */
  bars: { label: string; cents: number; now: boolean }[];
  diff: { label: string; before: string; after: string }[];
  fill: { label: string; hint: string } | null;
  primary: string;
  secondary: string | null;
  /** What the folded line says after the primary action. */
  done: string;
  /** Remembered for the next payroll when the owner picks the secondary action (e.g. "Keep held"). */
  carry: { title: string; why: string; on: "primary" | "secondary" } | null;
  sources: SourceRef[];
  /** A correction proposal that only exists once the manager has answered (simulated in the demo). */
  afterManager: boolean;
};

/** One manager-routed flag in "Review before sending". Hours, jobs and record ids only: no pay. */
export type DakotaItem = {
  flagId: string;
  flagKey: string;
  checkId: string;
  category: string;
  /** Category key for the text's counts, e.g. "mix". */
  group: string;
  title: string;
  why: string;
  sources: SourceRef[];
};

export type DakotaReview = {
  managerId: string | null;
  managerName: string;
  items: DakotaItem[];
  /** How each group reads in the text, singular and plural. */
  groups: { key: string; one: string; many: string }[];
  /** "Oct 10–23", for the text. */
  period: string;
  /** Simulated replies for the demo, one per item, in order. Ids and plain facts only. */
  demoReplies: { flagId: string; text: string; kind: "fixed" | "answered" }[];
};

export type ReviewPerson = {
  workerId: string;
  name: string;
  group: "hourly" | "salary" | "venmo" | "held";
  hours: number | null;
  overtimeHours: number | null;
  /** null when the person is not paid in this draft (no rate): unknown is never zero. */
  grossCents: number | null;
  vsUsualPct: number | null;
  note: string | null;
};

export type Stage1Review = {
  grossCents: number;
  lastGrossCents: number | null;
  /** grossCents − lastGrossCents, worked out on the server. */
  deltaCents: number | null;
  lastVenmoCents: number | null;
  venmoCents: number;
  revenueCents: number;
  laborCents: number;
  laborShare: {
    nowPct: number | null;
    usualPct: number | null;
    cycles: { label: string; pct: number | null; now: boolean }[];
    leftOutJobIds: string[];
  };
  people: ReviewPerson[];
  overUsual: number;
  withOvertime: number;
  draftId: string | null;
  source: string;
};

export type JobProfitRow = {
  jobId: string;
  label: string;
  title: string;
  revenueCents: number | null;
  costCents: number | null;
  profitCents: number | null;
  marginPct: number | null;
  low: boolean;
  note: string;
  state: "ready" | "waiting" | "low" | "unknown";
};

export type Commission = {
  id: string;
  workerId: string;
  initials: string;
  title: string;
  sub: string;
  /** null while it waits on a customer: the amount is worked out again when it is released. */
  amountCents: number | null;
  state: "ready" | "waiting";
  sources: SourceRef[];
};

export type Stage2Review = {
  jobs: JobProfitRow[];
  knownRevenueCents: number;
  readyCents: number;
  commissions: Commission[];
  rules: string[];
  draftId: string | null;
  source: string;
};

export type CarryItem = {
  id: string;
  title: string;
  why: string;
  amountCents: number | null;
};

/** PR 8: the example next payroll. Cycle 6 has no records yet; the release is the engine on a synthetic payment. */
export type NextPayroll = {
  cycleId: string;
  periodLabel: string;
  fromLabel: string;
  carried: CarryItem[];
  rows: {
    id: string;
    initials: string;
    title: string;
    sub: string;
    amountCents: number | null;
    tag: "held" | "released" | "waiting";
  }[];
  note: string;
};

export type SyncProblem = {
  source: string;
  system: SourceSystem;
  object: string;
  pulled: number;
  expected: number | null;
  error: string | null;
};

export type HomeStates = {
  /** This cycle's pulls that came up short. Only what they cover is blocked. */
  incomplete: SyncProblem[];
  gusto: {
    connected: boolean;
    error: string | null;
    lastPullAt: string | null;
  };
};

export type HomeBoardData = HomeData & {
  ownerFirstName: string | null;
  cycleNumber: number | null;
  periodLabel: string;
  cutoffLabel: string | null;
  people: { total: number; gusto: number; venmo: number };
  last: {
    periodLabel: string;
    grossCents: number;
    venmoCents: number;
    offCycleCents: number;
    people: number;
    questionsAsked: number;
  } | null;
  /** The live checks' flags for this cycle (data/fixtures), replacing the older app/_fixtures sample on Home. */
  cards: HomeCard[];
  dakota: DakotaReview;
  review: Stage1Review | null;
  stage2: Stage2Review | null;
  /** Held people, waiting commissions: always carried, whatever the owner decides here. */
  carry: CarryItem[];
  next: NextPayroll | null;
  states: HomeStates;
  /** Where the counts in the run animation come from. */
  run: {
    pulls: { system: SourceSystem; pulled: number; expected: number | null }[];
    groups: { label: string; checks: number; found: number }[];
    checks: number;
    found: number;
  };
};
