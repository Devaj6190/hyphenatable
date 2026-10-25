import type { AgentKind } from "@/components/AgentChip";
import type { Doc } from "@/convex/_generated/dataModel";
import type { Rule } from "@/lib/rules";
import type {
  AuditEvent,
  Correction,
  Flag,
  Question,
  SourceSystem,
} from "@/lib/types";
import type { Cycle, FlagInfo } from "@/lib/view-types";

// Convex documents → the shapes the screens already render. Ids stay Convex row ids (strings) so links and
// mutations round-trip; nothing here adds or removes pay. Redaction is Convex's job (flags.list/get with a viewerId).

const systems: Record<string, SourceSystem> = {
  jobber: "Jobber",
  qbo: "QuickBooks",
  quickbooks: "QuickBooks",
  gusto: "Gusto",
  workbook: "Workbook",
};
const systemName = (s: string) =>
  systems[s.toLowerCase()] ?? (s as SourceSystem);

export function toFlag(doc: Doc<"flags">, companyKey: string): Flag {
  return {
    id: doc._id,
    companyId: companyKey,
    cycleId: doc.cycleId,
    checkId: doc.checkId,
    status: doc.status,
    subject: {
      workerId: doc.subject.workerId,
      jobId: doc.subject.jobId,
      entryIds: [...doc.subject.entryIds],
      expenseIds: [...doc.subject.expenseIds],
    },
    seen: doc.seen,
    where: doc.where.map((w) => ({
      system: systemName(w.system),
      recordId: w.recordId,
      url: w.url,
    })),
    confidence: doc.confidence,
    precedent: doc.precedent,
    routeTo: doc.routeTo,
    affects: {
      workerId: doc.affects.workerId,
      jobId: doc.affects.jobId,
      dollarsCents: doc.affects.dollarsCents,
    },
    questionId: doc.questionId,
    correctionId: doc.correctionId,
  };
}

export function toQuestion(
  doc: Doc<"questions">,
  companyKey: string,
): Question {
  return {
    id: doc._id,
    companyId: companyKey,
    cycleId: doc.cycleId,
    flagIds: [...doc.flagIds],
    toWorkerId: doc.toWorkerId,
    toRole: doc.toRole,
    text: doc.text,
    options: doc.options ? [...doc.options] : null,
    kind: doc.kind,
    status: doc.status,
    approvedBy: doc.approvedBy,
    approvedAt: doc.approvedAt,
    sentAt: doc.sentAt,
    remindAt: doc.remindAt,
    expiresAt: doc.expiresAt,
    interpretationId: doc.interpretationId,
  };
}

// Before/after hold any JSON; the screens show text or numbers.
const scalar = (v: unknown): string | number | null =>
  typeof v === "string" || typeof v === "number"
    ? v
    : v == null
      ? null
      : JSON.stringify(v);

/** `flags.get` nulls the pay and profit effects for a manager, so they are nullable here. */
export type ConvexCorrection = Omit<
  Doc<"corrections">,
  "effectPayCents" | "effectProfitCents"
> & { effectPayCents: number | null; effectProfitCents: number | null };

export function toCorrection(
  c: ConvexCorrection,
  companyKey: string,
): Correction {
  return {
    id: c._id,
    companyId: companyKey,
    cycleId: c.cycleId,
    flagId: c.flagId,
    target: { table: c.target.table, id: c.target.id, field: c.target.field },
    before: scalar(c.before),
    after: scalar(c.after),
    effectPayCents: c.effectPayCents,
    effectProfitCents: c.effectProfitCents,
    status: c.status,
    source: c.source,
    approvedBy: c.approvedBy,
    approvedAt: c.approvedAt,
  };
}

export function toCycle(doc: Doc<"cycles">): Cycle {
  return {
    id: doc._id,
    number: doc.number,
    periodStart: doc.periodStart,
    periodEnd: doc.periodEnd,
    stage: doc.stage,
    questionsAsked: doc.questionsAsked,
  };
}

/** Who a question goes to, in words: a first name when the roster knows it, else the role. */
export function recipientLabel(
  q: Question | null,
  names: Record<string, string>,
): string {
  if (!q) return "the right person";
  const first = names[q.toWorkerId]?.split(" ")[0];
  if (first) return first;
  return q.toRole === "owner" ? "you" : `the ${q.toRole}`;
}

/** The home's per-flag detail for a live flag. A reply's text has no Convex query yet, so `reply` stays null. */
export function infoOf(
  q: Question | null,
  names: Record<string, string>,
): FlagInfo {
  return {
    question: q,
    recipient: recipientLabel(q, names),
    reply: null,
    agents: ["controller"] satisfies AgentKind[],
  };
}

/**
 * The cycle the screens show: the newest one that has flags, else the newest one. `cycles` is newest first
 * (cycles.list orders by number, descending).
 */
export function currentCycleId(
  cycles: Pick<Doc<"cycles">, "_id">[],
  flags: Pick<Doc<"flags">, "cycleId">[],
): string | null {
  const withFlags = cycles.find((c) => flags.some((f) => f.cycleId === c._id));
  return (withFlags ?? cycles[0])?._id ?? null;
}

/** The company's newest cycle by number, or null when it has none yet. */
export function newestCycle(docs: Doc<"cycles">[]): Cycle | null {
  const top = docs.reduce<Doc<"cycles"> | null>(
    (a, d) => (!a || d.number > a.number ? d : a),
    null,
  );
  return top ? toCycle(top) : null;
}

/** The header's read of cycles.list: off (no live data for this company), loading, failed, or the newest cycle. */
export type LiveCycle =
  | { status: "off" }
  | { status: "loading" }
  | { status: "failed" }
  | { status: "ready"; cycle: Cycle | null };

type PeriodCycle = { number: number; periodStart: string; periodEnd: string };

/**
 * The cycle the page header names. Live: Convex's newest cycle, and nothing while it loads, so the fixture's number
 * never flashes. Off or failed: the fixture's, which is what the screens fall back to as well.
 */
export function headerCycle(
  fixture: PeriodCycle | null,
  live: LiveCycle,
): PeriodCycle | null {
  if (live.status === "ready") return live.cycle;
  if (live.status === "loading") return null;
  return fixture;
}

/**
 * Whether the page under the header reads its cycle from Convex. For a company with fixtures, only flag detail does:
 * Home V5 and the manager inbox build their heading on the server from fixtures, so a live header there would name
 * another cycle. A company with no fixture cycle (Company R, whose real data is never committed) has nothing but
 * Convex to show, so every one of its pages is live.
 */
export function pageHasLiveCycle(
  pathname: string,
  hasFixtureCycle = true,
): boolean {
  return !hasFixtureCycle || /^\/c\/[^/]+\/flags\/[^/]+\/?$/.test(pathname);
}

/**
 * One audit event. audit.list does not redact per viewer, and an event's data can carry pay, so the screens only
 * read it as the owner (see LiveAuditLog). Nothing here adds or drops fields beyond renaming the id.
 */
export function toAuditEvent(
  doc: Doc<"auditEvents">,
  companyKey: string,
): AuditEvent {
  return {
    id: doc._id,
    companyId: companyKey,
    cycleId: doc.cycleId,
    at: doc.at,
    actor: doc.actor,
    type: doc.type,
    summary: doc.summary,
    refs: doc.refs,
    data: doc.data ?? null,
  };
}

/** One rule. Its params can hold pay in cents, so rules are only read as the owner (see LiveRules). */
export function toRule(doc: Doc<"rules">, companyKey: string): Rule {
  return {
    id: doc._id,
    companyId: companyKey,
    type: doc.type,
    params: doc.params,
    status: doc.status,
    source: doc.source,
    provenance: doc.provenance,
    backtest: doc.backtest,
    confidence: doc.confidence,
  };
}
