// Plain titles for every flag id: CHK ids (docs/plans/00-shared-context.md section 9) plus the two flags
// that aren't deterministic checks, AGT-01 and LRN-01 (contract PR #82).
export const checkTitles: Record<string, string> = {
  "CHK-01": "Hours with no job",
  "CHK-02": "Timer still running",
  "CHK-03": "Unusually long shift",
  "CHK-04": "Two entries overlap",
  "CHK-05": "Zero or duplicate entry",
  "CHK-06": "Hours not approved by cutoff",
  "CHK-07": "Active worker with no hours",
  "CHK-08": "Inactive worker with hours",
  "CHK-09": "Worker not set up in Gusto",
  "CHK-10": "Rate differs between systems",
  "CHK-11": "Contractor has no rate",
  "CHK-12": "Paid outside the sync",
  "CHK-13": "Job with no labor",
  "CHK-14": "Purchase with no job",
  "CHK-15": "Possible double-counted purchase",
  "CHK-16": "Disposal not linked to its job",
  "CHK-17": "Purchase category not decided",
  "CHK-18": "Old rate used for labor",
  "CHK-19": "Deposit counted as final payment",
  "CHK-20": "Quote credited to someone else",
  "CHK-21": "Low profit on a job",
  "CHK-22": "Gross pay changed more than usual",
  "CHK-23": "A system pull is incomplete",
  // The Auditor flagged a vague case: always a question to the owner, never blocking.
  "AGT-01": "Unusual case, needs your decision",
  // A new answer contradicts a rule that is already active.
  "LRN-01": "Answer contradicts a rule",
};

export const checkTitle = (id: string) => checkTitles[id] ?? id;
