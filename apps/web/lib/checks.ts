// Plain titles for CHK ids (docs/plans/00-shared-context.md section 9).
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
};

export const checkTitle = (id: string) => checkTitles[id] ?? id;
