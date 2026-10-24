// Hand-written synthetic records for check tests. Every builder parses through the zod
// schema, so a fixture that drifts from the contract fails loudly.
import { Company, Cycle, Flag, Rule, TimeEntry } from "../../schemas";
import type { CheckInput } from "../types";

export const company = (over: Partial<Company> = {}): Company =>
  Company.parse({
    id: "co_a",
    name: "Synthetic Co A",
    kind: "synthetic",
    payFrequency: "weekly",
    timezone: "America/Los_Angeles",
    settings: {
      longShiftHours: 12,
      otWeeklyHours: 40,
      grossChangePct: 25,
      employeesMayBeTexted: false,
      lowMarginPct: 20,
    },
    ...over,
  });

export const cycle = (over: Partial<Cycle> = {}): Cycle =>
  Cycle.parse({
    id: "cy_1",
    companyId: "co_a",
    number: 1,
    periodStart: "2026-10-05",
    periodEnd: "2026-10-11",
    cutoffAt: "2026-10-12T16:00:00Z",
    stage: "checking",
    gustoPayrollId: null,
    gustoOffCyclePayrollId: null,
    questionsAsked: 0,
    ...over,
  });

/** An approved, closed 8 h job entry on 2026-10-07 08:00 PDT. */
export const entry = (over: Partial<TimeEntry> & { id: string }): TimeEntry =>
  TimeEntry.parse({
    companyId: "co_a",
    cycleId: "cy_1",
    sourceId: `jobber_${over.id}`,
    workerId: "w_01",
    jobId: "job_01",
    visitId: "vis_01",
    startAt: "2026-10-07T15:00:00Z",
    endAt: "2026-10-07T23:00:00Z",
    durationSec: 8 * 3600,
    ticking: false,
    approved: true,
    approvedBy: "user_owner",
    payable: true,
    category: "GENERAL",
    label: null,
    hasNote: false,
    ...over,
  });

export const rule = (over: Partial<Rule> & { id: string }): Rule =>
  Rule.parse({
    companyId: "co_a",
    type: "long_shift_threshold",
    params: {},
    status: "active",
    source: "owner_stated",
    provenance: {
      lessonId: null,
      flagId: null,
      answeredBy: null,
      approvedBy: "user_owner",
      approvedAt: "2026-10-01T16:00:00Z",
      evidence: [],
    },
    backtest: null,
    confidence: 1,
    ...over,
  });

export const input = (
  timeEntries: TimeEntry[],
  over: Partial<CheckInput> = {},
): CheckInput => ({
  company: company(),
  cycle: cycle(),
  workers: [],
  timeEntries,
  jobs: [],
  visits: [],
  quotes: [],
  invoices: [],
  payments: [],
  expenses: [],
  pastCycles: { gross: {} },
  rules: [],
  ...over,
});

/** Parses every flag against the contract; use on all check output in tests. */
export const valid = (flags: Flag[]): Flag[] => flags.map((f) => Flag.parse(f));
