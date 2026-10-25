import "server-only";
import type { Viewer } from "@/lib/policy";
import type { CompanyViewData } from "@/lib/view-types/company";
import companyA from "../../../../../data/fixtures/a/company.json";
import cyclesA from "../../../../../data/fixtures/a/cycles.json";
import flagsA from "../../../../../data/fixtures/a/flags.json";
import pastPayrollsA from "../../../../../data/fixtures/a/pastPayrolls.json";
import rulesA from "../../../../../data/fixtures/a/rules.json";
import syncRunsA from "../../../../../data/fixtures/a/syncRuns.json";
import entriesA from "../../../../../data/fixtures/a/timeEntries.json";
import rosterA from "../../../../../data/fixtures/a/workers.json";
import { buildCompanyView, type CompanyInputs } from "./companyModel";

// The Company page's adapter (People and pay, Profile). Fixture mode, server only: the roster, rules and past
// payrolls hold pay, and `server-only` keeps them out of any browser bundle. When Devaj ships workers.list,
// companies.get and payroll history, only this file changes. Only Company A has fixtures; B and R are empty.
const inputs: Record<string, CompanyInputs> = {
  a: {
    roster: rosterA as CompanyInputs["roster"],
    rules: rulesA,
    flags: flagsA as CompanyInputs["flags"],
    entries: entriesA,
    pastPayrolls: pastPayrollsA,
    cycles: cyclesA,
    syncRuns: syncRunsA,
    company: companyA,
    sources: {
      roster: "fixture, data/fixtures/a/workers.json",
      flags: "fixture, data/fixtures/a/flags.json (engine checks)",
      hours: "fixture, data/fixtures/a/timeEntries.json (Jobber)",
      payrolls: "fixture, data/fixtures/a/pastPayrolls.json (Gusto, Venmo)",
      settings: "fixture, data/fixtures/a/company.json",
    },
  },
};

const EMPTY: CompanyInputs = {
  roster: [],
  rules: [],
  flags: [],
  entries: [],
  pastPayrolls: [],
  cycles: [],
  syncRuns: [],
  company: null,
  sources: {
    roster: "none yet",
    flags: "none yet",
    hours: "none yet",
    payrolls: "none yet",
    settings: "none yet",
  },
};

/** People with their status, rates and pay history; company settings; connected apps. Managers get no pay. */
export function companyView(
  viewer: Viewer,
  companyId: string,
): CompanyViewData {
  return buildCompanyView(viewer, inputs[companyId] ?? EMPTY);
}
