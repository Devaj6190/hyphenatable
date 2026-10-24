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
