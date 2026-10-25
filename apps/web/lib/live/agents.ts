import type { Doc } from "@/convex/_generated/dataModel";
import type { AgentRunRow } from "@/lib/agents";
import type { AuditData, AuditEvent } from "@/lib/types";

// Convex creaoRuns / auditEvents rows → the shapes AgentRuns and MorningBrief render. Ids stay Convex row ids.
// creaoRuns.list already drops callbackToken on the server; the type says so too.

export type CreaoRunDoc = Omit<Doc<"creaoRuns">, "callbackToken">;

export function toAgentRun(doc: CreaoRunDoc): AgentRunRow {
  return {
    id: doc._id,
    companyId: doc.companyId,
    cycleId: doc.cycleId,
    agent: doc.agent,
    attempt: doc.attempt,
    runId: doc.runId,
    status: doc.status,
    startedAt: doc.startedAt,
    finishedAt: doc.finishedAt,
    credits: doc.credits,
    error: doc.error,
  };
}

export function toAuditEvent(doc: Doc<"auditEvents">): AuditEvent {
  return {
    id: doc._id,
    companyId: doc.companyId,
    cycleId: doc.cycleId,
    at: doc.at,
    actor: doc.actor,
    type: doc.type,
    summary: doc.summary,
    refs: doc.refs,
    data: (doc.data ?? null) as AuditData | null,
  };
}
