import type { AuditEvent, ViewerRole } from "@/lib/types";

// Type prefixes the plan's filter offers (docs/plans/C-product-messaging-demo.md, C-10).
export const AUDIT_PREFIXES = [
  "sync",
  "check",
  "message",
  "correction",
  "rule",
  "draft",
  "demo",
] as const;

export const typePrefix = (e: AuditEvent) => e.type.split(".")[0];

export const isSimulated = (e: AuditEvent) => e.data?.simulated === true;

// Every row says where it came from. B's events may not carry data.source yet, so fall back to the actor.
export function eventSource(e: AuditEvent): string {
  if (e.data?.source) return e.data.source;
  if (e.actor.kind === "user") return "Dashboard";
  if (e.actor.agent) return `${e.actor.agent} agent (Claude)`;
  return "PayrollPilot engine";
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
