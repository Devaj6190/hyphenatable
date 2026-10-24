import { type AgentKind, agentFromActor } from "@/components/AgentChip";
import { fixtureWorkers } from "@/lib/fixtures";
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

// Users are owner or manager by their worker role; everyone else maps as AgentChip does.
export function actorKind(actor: AuditEvent["actor"]): AgentKind {
  if (actor.kind !== "user") return agentFromActor(actor);
  return fixtureWorkers.find((w) => w.id === actor.id)?.role === "manager"
    ? "manager"
    : "owner";
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

export function cycleLabel(cycleId: string | null): string {
  const n = cycleId?.match(/c0*(\d+)$/)?.[1];
  return n ? `Cycle ${n}` : (cycleId ?? "No cycle");
}

// Manager views never see pay: owner-only events are dropped and the pay effect is removed before render.
export function forViewerEvents(
  events: AuditEvent[],
  role: ViewerRole,
): AuditEvent[] {
  if (role === "owner") return events;
  return events
    .filter((e) => e.data?.ownerOnly !== true)
    .map((e) => {
      if (!e.data) return e;
      const { effectPayCents: _pay, ...rest } = e.data;
      return { ...e, data: rest };
    });
}
