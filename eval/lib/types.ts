// Section 6 shapes the metrics read (subsets), plus the answer key and results.json.

export type Subject = {
  workerId: string | null;
  jobId: string | null;
  entryIds: string[];
  expenseIds: string[];
};

/** A section 6 Flag; the metrics read only these fields. */
export type FlagLike = {
  id: string;
  companyId: string;
  cycleId: string;
  checkId: string;
  status: string;
  subject: Subject;
  seen: string;
  where: { system: string; recordId: string; url: string | null }[];
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

export type AnswerKeyRow = {
  id: string;
  checkId: string;
  subject: Subject;
  truth: string;
  registerCategory: string;
  /** Extension rows only (e.g. a-c06); base rows belong to the first current cycle. */
  cycleId?: string;
  /** a-c06: the RuleType learned in cycle 1 that settles this row without a question, or null. */
  resolvableByRuleType?: string | null;
};

export type SyncRun = {
  id: string;
  cycleId: string | null;
  source: string;
  object: string;
  pulled: number;
  expected: number | null;
  complete: boolean;
  error: string | null;
};

export type Question = {
  id: string;
  cycleId: string;
  flagIds: string[];
  toRole: string;
  status: string;
};

export type Visit = {
  id: string;
  jobId: string;
  startAt: string;
  endAt: string | null;
  isComplete: boolean;
  assignedWorkerIds: string[];
};

export type PastPayroll = {
  id: string;
  cycleId: string;
  workerId: string;
  paidVia: string;
  grossCents: number;
};

export type Ratio = { num: number; den: number; value: number | null };

export const ratio = (num: number, den: number): Ratio => ({
  num,
  den,
  value: den === 0 ? null : Math.round((num / den) * 10000) / 10000,
});
