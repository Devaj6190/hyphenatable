import { canSeeAuditEvent, redactAuditEvent, viewerFor } from "@/lib/policy";
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
