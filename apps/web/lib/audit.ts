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
  return "PayrollPilot engine";
}

const SYSTEMS: SourceSystem[] = ["Jobber", "QuickBooks", "Gusto", "Workbook"];

/** The source as a record chip when it is exactly one system and the event names a record. */
export function sourceRecord(
  e: AuditEvent,
): { system: SourceSystem; recordId: string } | null {
  const system = SYSTEMS.find((s) => s === e.data?.source);
  const recordId = Object.values(e.refs)[0];
  return system && recordId ? { system, recordId } : null;
}

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
