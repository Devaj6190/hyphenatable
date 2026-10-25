import { type AgentKind, agentFromActor } from "@/components/AgentChip";
import { canSeeAuditEvent, redactAuditEvent, viewerFor } from "@/lib/policy";
import type { AuditEvent, SourceSystem, ViewerRole } from "@/lib/types";

// Filter chips (docs/plans/C-product-messaging-demo.md, C-10), with Shannin's "Answers" split out of messages.
export const AUDIT_TYPES = [
  { value: "sync", label: "Pulls", one: "Pull" },
  { value: "check", label: "Flags", one: "Flag" },
  { value: "message", label: "Messages", one: "Message" },
  { value: "answer", label: "Answers", one: "Answer" },
  { value: "correction", label: "Corrections", one: "Correction" },
  { value: "rule", label: "Rules", one: "Rule" },
  { value: "draft", label: "Drafts", one: "Draft" },
  { value: "demo", label: "Demo", one: "Demo" },
] as const;

export const typePrefix = (e: AuditEvent) => e.type.split(".")[0];

export const category = (e: AuditEvent) =>
  e.type === "message.received" || e.type === "message.interpreted"
    ? "answer"
    : typePrefix(e);

export const categoryLabel = (e: AuditEvent) =>
  AUDIT_TYPES.find((t) => t.value === category(e))?.one ?? typePrefix(e);

export const isSimulated = (e: AuditEvent) => e.data?.simulated === true;

// Users are owner or manager by their worker role (the server passes the manager ids); everyone else maps as
// AgentChip does.
export function actorKind(
  actor: AuditEvent["actor"],
  managerIds: ReadonlySet<string>,
): AgentKind {
  if (actor.kind !== "user") return agentFromActor(actor);
  return actor.id && managerIds.has(actor.id) ? "manager" : "owner";
}

// Every row says where it came from. B's events may not carry data.source yet, so fall back to the actor.
export function eventSource(e: AuditEvent): string {
  if (e.data?.source) return e.data.source;
  if (e.actor.kind === "user") return "Dashboard";
  if (e.actor.agent) return `${e.actor.agent} agent (Claude)`;
  return "RollPay engine";
}

// Which outside system owns a record, by the ref key. Our own ids (syncRunId, flagId, draftId, questionId,
// correctionId, ruleId) are never chipped as Jobber/QuickBooks/Gusto records. No fixture event carries a Gusto
// record id yet; add its key here when one does.
const EXTERNAL_REF: Record<string, SourceSystem> = {
  entryId: "Jobber",
  expenseId: "QuickBooks",
};

/** The first outside record this event names, as a SourceChip. */
export function sourceRecord(
  e: AuditEvent,
): { system: SourceSystem; recordId: string } | null {
  for (const [key, recordId] of Object.entries(e.refs)) {
    const system = EXTERNAL_REF[key];
    if (system) return { system, recordId };
  }
  return null;
}

/** The demo persona says which seat it played ("persona:owner" → "Simulated owner"). */
export function actorLabel(actor: AuditEvent["actor"]): string | undefined {
  const persona = actor.id.match(/^persona:(\w+)/)?.[1];
  return persona ? `Simulated ${persona}` : undefined;
}

export const isLocal = (e: AuditEvent) => e.id.startsWith("local-");

// Company A's two demo cycles (docs/DEMO.md): Cycle 1 is a-c05, Cycle 2 is a-c06. Other ids show as they are,
// because the digits in an id are not the cycle number (a-c01 to a-c04 are past history cycles).
const cycleLabels: Record<string, string> = {
  "a-c05": "Cycle 1",
  "a-c06": "Cycle 2",
};

export const NO_CYCLE = "none";

export function cycleLabel(cycleId: string | null): string {
  if (cycleId === null) return "Onboarding";
  return cycleLabels[cycleId] ?? cycleId;
}

// Defense in depth for the role switch: the server already redacts, but a client that has just switched from
// owner to manager still holds owner data until the refresh lands. Same policy as the server (lib/policy.ts).
export function forViewerEvents(
  events: AuditEvent[],
  role: ViewerRole,
  visibleFlagIds: ReadonlySet<string>,
): AuditEvent[] {
  const viewer = viewerFor(role, "", []);
  return events
    .filter((e) => canSeeAuditEvent(viewer, e, visibleFlagIds))
    .map((e) => redactAuditEvent(viewer, e));
}

export type AgentName = "auditor" | "messenger" | "analyst";

export type HandoffCounts = {
  auditor: { flagged: number; routed: number };
  messenger: { drafted: number; read: number };
  analyst: { proposed: number };
};

const flagIdOf = (e: AuditEvent) => e.refs.flagId;

/**
 * Hand-off counts from audit events written by agents (actor.kind === "agent"). Events by code, users or the
 * demo persona are ignored. "Flagged" is the distinct flags the Auditor wrote check events for; "routed" is
 * the subset of those a Messenger event also names, which is the hand-off to the Messenger.
 */
export function handoffCounts(events: readonly AuditEvent[]): HandoffCounts {
  const agentEvents = events.filter(
    (e) => e.actor.kind === "agent" && e.actor.agent,
  );
  const by = (agent: AgentName) =>
    agentEvents.filter((e) => e.actor.agent === agent);
  const flagged = new Set(
    by("auditor")
      .filter((e) => typePrefix(e) === "check")
      .map(flagIdOf)
      .filter(Boolean),
  );
  const messengerFlags = new Set(by("messenger").map(flagIdOf));
  const messenger = by("messenger");
  return {
    auditor: {
      flagged: flagged.size,
      routed: [...flagged].filter((id) => messengerFlags.has(id)).length,
    },
    messenger: {
      drafted: messenger.filter((e) => e.type === "message.drafted").length,
      read: messenger.filter((e) => e.type === "message.interpreted").length,
    },
    analyst: {
      proposed: by("analyst").filter((e) => e.type === "rule.proposed").length,
    },
  };
}
