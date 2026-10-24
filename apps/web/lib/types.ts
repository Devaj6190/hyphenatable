// Mirrors Flag in docs/plans/00-shared-context.md section 6. B's schema replaces this.
export type SourceSystem = "Jobber" | "QuickBooks" | "Gusto" | "Workbook";

export type Flag = {
  id: string;
  companyId: string;
  cycleId: string;
  checkId: string;
  status: "open" | "asked" | "answered" | "corrected" | "dismissed" | "held";
  subject: {
    workerId: string | null;
    jobId: string | null;
    entryIds: string[];
    expenseIds: string[];
  };
  seen: string;
  where: { system: SourceSystem; recordId: string; url: string | null }[];
  confidence: "certain" | number;
  precedent: {
    ruleId: string | null;
    flagId: string | null;
    note: string;
  } | null;
  routeTo: "owner" | "manager" | "none";
  affects: {
    workerId: string | null;
    jobId: string | null;
    dollarsCents: number | null;
  };
  questionId: string | null;
  correctionId: string | null;
};

export type ViewerRole = "owner" | "manager";

// Mirrors Question in docs/plans/00-shared-context.md section 6.
export type Question = {
  id: string;
  companyId: string;
  cycleId: string;
  flagIds: string[];
  toWorkerId: string;
  toRole: "owner" | "manager" | "employee";
  text: string;
  options: string[] | null;
  kind: "text" | "poll";
  status:
    | "draft"
    | "approved"
    | "sent"
    | "reminded"
    | "answered"
    | "expired"
    | "denied";
  approvedBy: string | null;
  approvedAt: string | null;
  sentAt: string | null;
  remindAt: string | null;
  expiresAt: string | null;
  interpretationId: string | null;
};

// The slice of AuditEvent the flag timeline needs. B's audit.list replaces it.
export type FlagEvent = {
  id: string;
  flagId: string;
  at: string;
  actor: {
    kind: "system" | "agent" | "user";
    id: string;
    agent: "analyst" | "auditor" | "messenger" | null;
  };
  type: string;
  summary: string;
};

// One line in a per-worker text thread. Phone numbers never appear here; the courier owns them.
export type ThreadMessage = {
  id: string;
  questionId: string;
  workerId: string;
  direction: "out" | "in";
  text: string;
  at: string;
  kind: "text" | "poll" | "poll_vote" | "reaction";
  simulated?: boolean;
  interpretation?: string;
};

export type FixtureWorker = {
  id: string;
  displayName: string;
  role: "field" | "manager" | "owner" | "office";
};

// Mirrors AuditEvent in docs/plans/00-shared-context.md section 6. B's audit.list replaces the fixture.
// Summaries never carry pay amounts: pay lives in data.effectPayCents and is shown to the owner only.
export type AuditData = {
  source?: string;
  simulated?: boolean;
  ownerOnly?: boolean;
  effectPayCents?: number;
};

export type AuditEvent = {
  id: string;
  companyId: string;
  cycleId: string | null;
  at: string;
  actor: FlagEvent["actor"];
  type: string;
  summary: string;
  refs: Record<string, string>;
  data: AuditData | null;
};
