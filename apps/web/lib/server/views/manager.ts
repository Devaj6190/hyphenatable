import "server-only";
import { companies } from "@/lib/companies";
import { viewerFor } from "@/lib/policy";
import {
  buildEmployeeReview,
  buildManagerInbox,
  type RawFlag,
  type Records,
} from "@/lib/server/views/managerBuild";
import type { FixtureWorker } from "@/lib/types";
import type {
  EmployeeReviewData,
  ManagerInboxV3,
} from "@/lib/view-types/manager";
import cyclesA from "../../../../../data/fixtures/a/cycles.json";
import expensesA from "../../../../../data/fixtures/a/expenses.json";
import flagsA from "../../../../../data/fixtures/a/flags.json";
import jobsA from "../../../../../data/fixtures/a/jobs.json";
import rulesA from "../../../../../data/fixtures/a/rules.json";
import entriesA from "../../../../../data/fixtures/a/timeEntries.json";
import workersA from "../../../../../data/fixtures/a/workers.json";

// Fixture mode for the manager inbox and the employee page, on the server only: the files below hold pay
// (rates, job totals, expense amounts), and the builders read none of it. Swaps for Convex flags.list plus
// the re-check and dashboard-answer mutations (Devaj, needs (a) and (b)) once they are live.
export const MANAGER_SOURCE =
  "synthetic fixture, data/fixtures/a (flags, timeEntries, jobs, expenses)";

function recordsFor(companyId: string): Records | null {
  if (companyId !== "a") return null;
  const cycles = [...cyclesA].sort((a, b) => a.number - b.number);
  // Only id, name, role and manager leave this line; the roster's pay fields do not.
  const workers = workersA.map(({ id, displayName, role, managerId }) => ({
    id,
    displayName,
    role,
    managerId,
  })) as FixtureWorker[];
  return {
    companyId,
    timezone: companies[companyId]?.timezone ?? "UTC",
    cycle: cycles.at(-1) ?? null,
    flags: flagsA as RawFlag[],
    entries: entriesA,
    jobs: jobsA,
    expenses: expensesA,
    rules: rulesA,
    workers,
  };
}

/** The manager inbox is always the manager's view, whoever is switched in. */
export function managerInboxView(companyId: string): ManagerInboxV3 {
  const r = recordsFor(companyId);
  if (!r)
    return {
      companyId,
      cycleId: null,
      period: null,
      manager: null,
      owner: null,
      items: [],
      source: "no fixture for this company",
    };
  const mgr = r.workers.find((w) => w.role === "manager");
  const viewer = viewerFor(
    "manager",
    mgr?.id ?? `${companyId}-manager`,
    r.workers,
  );
  return { ...buildManagerInbox(viewer, r), source: MANAGER_SOURCE };
}

// ponytail: one fixture link per question until employee answer links exist (Devaj, need (i)). The token
// names the worker and the flag; the page shows that worker's own hours and nothing else.
const EMPLOYEE_LINKS: Record<
  string,
  { companyId: string; workerId: string; flagId: string }
> = {
  s7q: { companyId: "a", workerId: "a-w03", flagId: "a-fl-04" },
};

/** Null for an unknown token, a token for another company, or a flag that is not about this worker. */
export function employeeReviewView(
  companyId: string,
  token: string,
): EmployeeReviewData | null {
  const link = EMPLOYEE_LINKS[token];
  if (!link || link.companyId !== companyId) return null;
  const r = recordsFor(companyId);
  if (!r) return null;
  const view = buildEmployeeReview(
    { ...r, companyName: companies[companyId]?.name ?? companyId },
    { token, ...link },
  );
  return view && { ...view, source: MANAGER_SOURCE };
}
