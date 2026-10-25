// Mirrors a row of the creaoRuns table (b/contract-agt-lrn, convex/schema.ts), without callbackToken: the token
// authenticates the webhook and never reaches the UI. Times are ISO UTC. Ids trace back to the Convex records.
export type CreaoAgent = "auditor" | "messenger" | "analyst";

export type CreaoRunStatus =
  | "starting"
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type AgentRunRow = {
  id: string;
  companyId: string;
  cycleId: string | null;
  agent: CreaoAgent;
  attempt: number;
  runId: string | null;
  status: CreaoRunStatus;
  startedAt: string;
  finishedAt: string | null;
  credits: number | null;
  error: string | null;
};
