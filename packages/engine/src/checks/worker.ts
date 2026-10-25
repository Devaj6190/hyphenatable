import type { CheckId, Flag, Worker } from "../schemas";
import { cycleEntries } from "./flag";
import type { CheckInput } from "./types";

export function companyWorkers(input: CheckInput): Worker[] {
  return [
    ...new Map(
      input.workers
        .filter((w) => w.companyId === input.company.id)
        .map((w) => [w.id, w]),
    ).values(),
  ];
}

export function workerFlag(
  input: CheckInput,
  worker: Worker,
  checkId: CheckId,
  routeTo: Flag["routeTo"],
  seen: string,
): Flag {
  return {
    id: `${checkId}:${input.cycle.id}:${worker.id}`,
    companyId: input.company.id,
    cycleId: input.cycle.id,
    checkId,
    status: "open",
    subject: {
      workerId: worker.id,
      jobId: null,
      entryIds: cycleEntries(input)
        .filter((e) => e.workerId === worker.id)
        .map((e) => e.id)
        .sort(),
      expenseIds: [],
    },
    seen,
    where: [
      ...(worker.jobber
        ? [{ system: "jobber", recordId: worker.jobber.userId, url: null }]
        : []),
      ...(worker.gusto?.employeeUuid
        ? [{ system: "gusto", recordId: worker.gusto.employeeUuid, url: null }]
        : []),
      { system: "payrollpilot", recordId: worker.id, url: null },
    ],
    confidence: "certain",
    precedent: null,
    routeTo,
    affects: { workerId: worker.id, jobId: null, dollarsCents: null },
    questionId: null,
    correctionId: null,
  };
}

export function hasHours(input: CheckInput, worker: Worker): boolean {
  return cycleEntries(input).some(
    (e) => e.workerId === worker.id && e.durationSec > 0,
  );
}
