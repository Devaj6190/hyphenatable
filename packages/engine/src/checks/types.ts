import type {
  CheckId,
  Company,
  Cycle,
  Expense,
  Flag,
  Invoice,
  Job,
  Payment,
  Quote,
  Rule,
  SyncRun,
  TimeEntry,
  Visit,
  Worker,
} from "../schemas";

/** Everything a check may read for one cycle. Loaded by the runner; checks do no IO. */
export type CheckInput = {
  company: Company;
  cycle: Cycle;
  workers: Worker[];
  timeEntries: TimeEntry[];
  jobs: Job[];
  visits: Visit[];
  quotes: Quote[];
  invoices: Invoice[];
  payments: Payment[];
  expenses: Expense[];
  /** workerId → gross cents of past cycles. */
  pastCycles: { gross: Record<string, number[]> };
  rules: Rule[];
  syncRuns?: SyncRun[];
};

export type Check = {
  id: CheckId;
  run(input: CheckInput, rules: Rule[]): Flag[];
};
