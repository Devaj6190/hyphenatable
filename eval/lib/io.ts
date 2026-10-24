// Reading fixtures. The metric functions are pure and take data, not paths.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  Company,
  Cycle,
  Expense,
  Invoice,
  Job,
  Payment,
  Quote,
  Rule,
  TimeEntry,
  Worker,
} from "@payrollpilot/engine/payroll/types";
import type {
  AnswerKeyRow,
  FlagLike,
  PastPayroll,
  Question,
  SyncRun,
  Visit,
} from "./types";

export const REPO = join(import.meta.dirname, "../..");

export const readJson = <T>(path: string): T =>
  JSON.parse(readFileSync(path, "utf8")) as T;

export type Fixtures = {
  company: Company & {
    settings: Company["settings"] & { lowMarginPct?: number };
  };
  cycles: Cycle[];
  workers: Worker[];
  entries: TimeEntry[];
  jobs: Job[];
  visits: Visit[];
  quotes: Quote[];
  invoices: Invoice[];
  payments: Payment[];
  expenses: Expense[];
  rules: Rule[];
  syncRuns: SyncRun[];
  questions: Question[];
  pastPayrolls: PastPayroll[];
  /** Base rows carry no cycleId (they belong to the company's first current cycle); extension rows do. */
  answerKey: AnswerKeyRow[];
};

const EXTENDABLE = {
  cycles: "cycles",
  syncRuns: "syncRuns",
  entries: "timeEntries",
  jobs: "jobs",
  visits: "visits",
  quotes: "quotes",
  invoices: "invoices",
  payments: "payments",
  expenses: "expenses",
  pastPayrolls: "pastPayrolls",
  answerKey: "answer-key",
} as const;

/**
 * data/fixtures/<company>/*.json plus every extension folder under cycles/ (e.g. a-c06), concatenated
 * onto the same-named base file, as data/fixtures/README.md says.
 */
export function loadFixtures(company: string, root = REPO): Fixtures {
  const dir = join(root, "data/fixtures", company);
  const f = <T>(d: string, name: string): T =>
    readJson<T>(join(d, `${name}.json`));
  const fx: Fixtures = {
    company: f(dir, "company"),
    cycles: f(dir, "cycles"),
    workers: f(dir, "workers"),
    entries: f(dir, "timeEntries"),
    jobs: f(dir, "jobs"),
    visits: f(dir, "visits"),
    quotes: f(dir, "quotes"),
    invoices: f(dir, "invoices"),
    payments: f(dir, "payments"),
    expenses: f(dir, "expenses"),
    rules: f(dir, "rules"),
    syncRuns: f(dir, "syncRuns"),
    questions: f(dir, "questions"),
    pastPayrolls: f(dir, "pastPayrolls"),
    answerKey: f(dir, "answer-key"),
  };
  const ext = join(dir, "cycles");
  if (existsSync(ext))
    for (const sub of readdirSync(ext).sort())
      for (const [key, file] of Object.entries(EXTENDABLE)) {
        const p = join(ext, sub, `${file}.json`);
        if (existsSync(p))
          (fx[key as keyof typeof EXTENDABLE] as unknown[]).push(
            ...readJson<unknown[]>(p),
          );
      }
  return fx;
}

export const loadFlags = (path: string) => readJson<FlagLike[]>(path);
