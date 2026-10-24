// Jobber raw nodes -> section 6 shapes. Pure functions.
// Ids: record id = `jobber:<EncodedId>`, sourceId = the Jobber EncodedId (globally unique across types).
// Notes are never copied: only hasNote. Missing values are null, never 0.

import { toCents } from "../money.ts";
import type { TimeEntry, Worker } from "../types.ts";
import type { RawTimeSheetEntry, RawUser } from "./queries.ts";

export const jobberRef = (encodedId: string): string => `jobber:${encodedId}`;
const ref = (node: { id: string } | null | undefined): string | null => (node?.id ? jobberRef(node.id) : null);

/** ISO 8601 with any offset -> ISO 8601 UTC (`...Z`). Throws on an unparseable timestamp. */
export function toUtcIso(value: string): string;
export function toUtcIso(value: string | null): string | null;
export function toUtcIso(value: string | null): string | null {
  if (value === null) return null;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) throw new Error(`Unparseable timestamp from Jobber: ${JSON.stringify(value)}`);
  return new Date(ms).toISOString();
}

export function normalizeUser(raw: RawUser, companyId: string): Worker {
  const status = raw.status === "ACTIVATED" ? "active" : "inactive";
  return {
    id: jobberRef(raw.id),
    companyId,
    // Jobber holds the display name. Company A's are fake; Company R's are replaced by anonymize.ts at ingest.
    displayName: raw.name.full,
    // Jobber knows only who owns the account; field / manager / office comes from config, so null here.
    role: raw.isAccountOwner ? "owner" : null,
    payType: null,
    status,
    managerId: null,
    contactRef: null,
    jobber: { userId: raw.id, labourRateCents: toCents(raw.labourRate), status: raw.status },
    gusto: null,
    venmoRateCents: null,
  };
}

export function normalizeTimeSheetEntry(raw: RawTimeSheetEntry, companyId: string, cycleId: string | null): TimeEntry {
  const target = raw.targetItem;
  const visitId = target?.__typename === "Visit" && target.id ? jobberRef(target.id) : null;
  const jobId =
    ref(raw.job) ??
    (target?.__typename === "Job" && target.id ? jobberRef(target.id) : null) ??
    (target?.__typename === "Visit" ? ref(target.job) : null);
  return {
    id: jobberRef(raw.id),
    companyId,
    cycleId,
    sourceId: raw.id,
    workerId: ref(raw.user),
    jobId,
    visitId,
    startAt: toUtcIso(raw.startAt),
    endAt: toUtcIso(raw.endAt),
    durationSec: raw.finalDuration,
    ticking: raw.ticking,
    approved: raw.approved,
    approvedBy: ref(raw.approvedBy),
    payable: raw.payable,
    category: raw.timeSheetCategory,
    label: raw.label,
    hasNote: typeof raw.note === "string" && raw.note.trim().length > 0,
  };
}
