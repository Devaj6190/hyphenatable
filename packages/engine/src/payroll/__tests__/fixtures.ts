// Test-only loader for data/fixtures/<company>/*.json (the engine itself never does IO).
import { readFileSync } from "node:fs";
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
} from "../types";

const ROOT = join(import.meta.dirname, "../../../../../data/fixtures");

export const load = <T>(company: string, file: string): T =>
  JSON.parse(readFileSync(join(ROOT, company, `${file}.json`), "utf8")) as T;

export type PastPayroll = {
  id: string;
  cycleId: string;
  workerId: string;
  paidVia: string;
  earnings: { name: string; hours: number | null; amountCents: number }[];
  grossCents: number;
};

export function fixtures(company: "a" | "b") {
  return {
    company: load<Company>(company, "company"),
    cycles: load<Cycle[]>(company, "cycles"),
    workers: load<Worker[]>(company, "workers"),
    entries: load<TimeEntry[]>(company, "timeEntries"),
    expenses: load<Expense[]>(company, "expenses"),
    /** The fixture rules are `proposed`; tests treat them as approved by the owner. */
    rules: load<Rule[]>(company, "rules").map(
      (r): Rule => ({ ...r, status: "active" }),
    ),
    pastPayrolls: load<PastPayroll[]>(company, "pastPayrolls"),
    jobs: load<Job[]>(company, "jobs"),
    quotes: load<Quote[]>(company, "quotes"),
    invoices: load<Invoice[]>(company, "invoices"),
    payments: load<Payment[]>(company, "payments"),
  };
}
