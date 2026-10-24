// Local mirror of the shared-context section 6 shapes the connectors emit.
// When packages/engine/src/schemas.ts lands (B-02), these become type re-exports of it.
// Ids outside Convex are strings. Connector ids are `<source>:<upstream id>`; `sourceId` is the upstream id.
// Fields the source cannot know are null (never a default): see `role`, `payType` on Jobber workers.

export type Source = "jobber" | "qbo" | "gusto" | "export" | "browser";

export interface SyncRun {
  id: string;
  companyId: string;
  cycleId: string | null;
  source: Source;
  object: string;
  startedAt: string;
  finishedAt: string | null;
  pulled: number;
  expected: number | null;
  complete: boolean;
  method: string;
  error: string | null;
}

/** Worker as known to Jobber. role / payType are not Jobber facts, so they stay null until config or Gusto fills them. */
export interface Worker {
  id: string;
  companyId: string;
  displayName: string;
  role: "field" | "manager" | "owner" | "office" | null;
  payType: "hourly" | "salary" | "contractor_venmo" | "commission" | null;
  status: "active" | "inactive";
  managerId: string | null;
  contactRef: string | null;
  jobber: { userId: string; labourRateCents: number | null; status: string } | null;
  gusto: {
    employeeUuid: string | null;
    contractorUuid: string | null;
    jobUuid: string | null;
    rateCents: number | null;
    paymentUnit: string | null;
    flsaStatus: string | null;
    onboarded: boolean | null;
  } | null;
  venmoRateCents: number | null;
}

export interface TimeEntry {
  id: string;
  companyId: string;
  cycleId: string | null;
  sourceId: string;
  /** null only when Jobber returns an entry with no user; never guessed. */
  workerId: string | null;
  jobId: string | null;
  visitId: string | null;
  startAt: string;
  endAt: string | null;
  durationSec: number;
  ticking: boolean;
  approved: boolean;
  approvedBy: string | null;
  payable: boolean;
  category: string | null;
  label: string | null;
  hasNote: boolean;
}
