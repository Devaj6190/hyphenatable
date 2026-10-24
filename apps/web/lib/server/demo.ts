import "server-only";
import questions from "@/app/_fixtures/questions.json";
import workers from "@/app/_fixtures/workers.json";
import { viewerForRole } from "@/lib/server/fixtures";
import type { FixtureWorker, Question } from "@/lib/types";

// People and questions for the manager inbox, audit log and demo panel, in fixture mode. Names and ids only:
// no pay is in workers.json or questions.json. Only Company A has fixture people.
const companyWorkers = (companyId: string) =>
  (workers as FixtureWorker[]).filter((w) => w.id.startsWith(`${companyId}-`));

/** The manager and the names of their crew, so the inbox can say who a text is for. */
export function managerCrew(companyId: string) {
  const viewer = viewerForRole(companyId, "manager");
  const crew = viewer.role === "manager" ? viewer.crew : new Set<string>();
  const ws = companyWorkers(companyId).filter((w) => crew.has(w.id));
  return {
    manager: ws.find((w) => w.role === "manager") ?? null,
    names: Object.fromEntries(ws.map((w) => [w.id, w.displayName])),
  };
}

/** Users who are managers, so the audit log can chip them as Manager rather than Owner. */
export const managerIds = (companyId: string) =>
  companyWorkers(companyId)
    .filter((w) => w.role === "manager")
    .map((w) => w.id);

/** The demo panel picks a question to reply to. Demo mode only. */
export function demoQuestions(companyId: string) {
  return {
    questions: (questions as Question[]).filter(
      (q) => q.companyId === companyId,
    ),
    names: Object.fromEntries(
      companyWorkers(companyId).map((w) => [w.id, w.displayName]),
    ),
  };
}
