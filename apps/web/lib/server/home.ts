import "server-only";
import questions from "@/app/_fixtures/questions.json";
import type { AgentKind } from "@/components/AgentChip";
import type {
  Cycle,
  FlagInfo,
  HomeData,
  RosterWorker,
  SyncRun,
} from "@/lib/home";
import type { Viewer } from "@/lib/policy";
import { auditView, flagDetail, homeFlags } from "@/lib/server/fixtures";
import type { Question } from "@/lib/types";
import cyclesA from "../../../../data/fixtures/a/cycles.json";
import rulesA from "../../../../data/fixtures/a/rules.json";
import syncRunsA from "../../../../data/fixtures/a/syncRuns.json";
import workersA from "../../../../data/fixtures/a/workers.json";

// The home and inputs pages in fixture mode. Server only, like lib/server/fixtures.ts: the roster below
// holds pay rates, so it is filtered and redacted here and never bundled for a browser.

// Generated fixtures from A (data/fixtures/<id>). Only Company A has them so far.
const fixtures: Record<
  string,
  {
    cycles: Cycle[];
    syncRuns: SyncRun[];
    ruleStatuses: string[];
    roster: RosterWorker[];
  }
> = {
  a: {
    cycles: cyclesA as Cycle[],
    syncRuns: syncRunsA as SyncRun[],
    ruleStatuses: rulesA.map((r) => r.status),
    roster: workersA as RosterWorker[],
  },
};

// ponytail: app/_fixtures/audit.json runs past the moment flags.json shows (it goes on to Gate 1 and the
// Gusto draft), so the fixture feed stops at the correction proposal. Live audit.list has no cutoff.
const FIXTURE_NOW = "2026-10-24T08:41:00.000Z";

const nameOf = (companyId: string, id: string) =>
  (fixtures[companyId]?.roster ?? []).find((w) => w.id === id)?.displayName ??
  id;

function recipient(companyId: string, q: Question | null): string {
  if (!q) return "the right person";
  const name = nameOf(companyId, q.toWorkerId);
  return q.toRole === "employee" ? name : `${name}, ${q.toRole}`;
}

export function homeView(viewer: Viewer, companyId: string): HomeData {
  const flags = homeFlags(viewer, companyId);
  const info: Record<string, FlagInfo> = {};
  for (const f of flags) {
    const d = flagDetail(viewer, companyId, f.id);
    if (!d) continue;
    const agents = d.events.flatMap((e) =>
      e.actor.agent ? [e.actor.agent as AgentKind] : [],
    );
    info[f.id] = {
      question: d.question,
      recipient: recipient(companyId, d.question),
      reply:
        f.status === "answered"
          ? (d.thread?.messages.find((m) => m.direction === "in") ?? null)
          : null,
      agents: agents.length ? [...new Set(agents)] : ["controller"],
    };
  }

  const fx = fixtures[companyId];
  const sorted = [...(fx?.cycles ?? [])].sort((a, b) => a.number - b.number);
  const raw = sorted.at(-1);
  // ponytail: cycles.json is the pre-run snapshot (stage "setup"); app/_fixtures show the same cycle
  // mid-way with questions out, so the tracker shows "asking". cycles.get replaces both.
  const cycle: Cycle | null = raw ? { ...raw, stage: "asking" } : null;

  return {
    flags,
    info,
    audit: auditView(viewer, companyId).events.filter(
      (e) => e.cycleId === cycle?.id && e.at <= FIXTURE_NOW,
    ),
    cycle,
    previousQuestionsAsked: sorted.at(-2)?.questionsAsked ?? null,
    questionsAsked: (questions as Question[]).filter(
      (q) =>
        q.cycleId === cycle?.id &&
        !["draft", "approved", "denied"].includes(q.status),
    ).length,
    syncRuns: (fx?.syncRuns ?? []).filter((r) => r.cycleId === cycle?.id),
    rulesProposed: (fx?.ruleStatuses ?? []).filter((s) => s === "proposed")
      .length,
  };
}

/** Who is in this payroll. A manager gets their crew and no rates. */
export function rosterView(viewer: Viewer, companyId: string): RosterWorker[] {
  const all = fixtures[companyId]?.roster ?? [];
  if (viewer.role === "owner") return all;
  return all
    .filter((w) => viewer.crew.has(w.id))
    .map((w) => ({
      ...w,
      jobber: w.jobber && { ...w.jobber, labourRateCents: null },
      gusto: w.gusto && { ...w.gusto, rateCents: null },
      venmoRateCents: null,
    }));
}
