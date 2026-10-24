import type {
  AuditEvent,
  Correction,
  FixtureWorker,
  Flag,
  ViewerRole,
} from "@/lib/types";

// Who may see what. This is the same policy as Convex's lib/viewer.ts (PR #15): pay is removed on the server,
// so a manager's browser never receives it. Pure and dependency-free, so both the fixture loader and tests can use it.
export type Viewer =
  | { role: "owner"; workerId: string }
  | { role: "manager"; workerId: string; crew: ReadonlySet<string> };

/** Owner sees everything; a manager sees their crew (the workers who report to them, and themselves). */
export function viewerFor(
  role: ViewerRole,
  workerId: string,
  workers: FixtureWorker[],
): Viewer {
  if (role === "owner") return { role, workerId };
  const crew = workers
    .filter((w) => w.managerId === workerId || w.id === workerId)
    .map((w) => w.id);
  return { role, workerId, crew: new Set(crew) };
}

/**
 * A manager sees manager-routed flags about their crew, plus manager-routed job flags that name no worker.
 * Owner-routed flags are money or policy and stay with the owner.
 */
export function canSeeFlag(viewer: Viewer, flag: Flag): boolean {
  if (viewer.role === "owner") return true;
  if (flag.routeTo !== "manager") return false;
  const workerId = flag.subject.workerId;
  return workerId === null || viewer.crew.has(workerId);
}

/** Drops the pay a flag affects unless the owner is looking. */
export function redactFlag(viewer: Viewer, flag: Flag): Flag {
  if (viewer.role === "owner") return flag;
  return { ...flag, affects: { ...flag.affects, dollarsCents: null } };
}

/** A corrected field that is itself money or a pay rate: its before/after values are owner-only. */
export const isMoneyField = (field: string) => /cents|rate/i.test(field);

/** Drops the pay and profit effect, and before/after when the corrected field is itself money or a rate. */
export function redactCorrection(
  viewer: Viewer,
  correction: Correction,
): Correction {
  if (viewer.role === "owner") return correction;
  const moneyField = isMoneyField(correction.target.field);
  return {
    ...correction,
    effectPayCents: null,
    effectProfitCents: null,
    before: moneyField ? null : correction.before,
    after: moneyField ? null : correction.after,
  };
}

/** Owner-only events, and events about a flag the manager cannot see, are dropped for a manager. */
export function canSeeAuditEvent(
  viewer: Viewer,
  event: AuditEvent,
  visibleFlagIds: ReadonlySet<string>,
): boolean {
  if (viewer.role === "owner") return true;
  if (event.data?.ownerOnly === true) return false;
  const flagId = event.refs.flagId;
  return flagId === undefined || visibleFlagIds.has(flagId);
}

/** The pay effect of an event lives in data.effectPayCents; a manager never gets it. */
export function redactAuditEvent(
  viewer: Viewer,
  event: AuditEvent,
): AuditEvent {
  if (viewer.role === "owner" || !event.data) return event;
  const { effectPayCents: _pay, ...rest } = event.data;
  return { ...event, data: rest };
}
