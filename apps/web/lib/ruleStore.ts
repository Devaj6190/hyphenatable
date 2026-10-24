"use client";

import { useSyncExternalStore } from "react";
import type { Rule, RuleView } from "@/lib/rules";

// ponytail: browser-only stand-in for rules.approve / rules.toggle / rules.stateInPlainWords /
// onboarding answers, which are not in apps/web/convex yet. Decisions live in sessionStorage so
// Onboarding, Rules and What it learned agree within one tab. Swap for the Convex mutations when B ships them.

export type ChangeLabel =
  | "Approved"
  | "Rejected"
  | "Turned off"
  | "Turned back on"
  | "Replaced by your edit";

export type Change = {
  status: Rule["status"];
  label: ChangeLabel;
  by: string;
  at: string;
};

type Answer = { choice: string; note: string; by: string; at: string };

type State = {
  changes: Record<string, Change[]>;
  stated: RuleView[];
  answers: Record<string, Answer>;
};

const KEY = "pp-rules-preview";
const EMPTY: State = { changes: {}, stated: [], answers: {} };
let state: State | null = null;
const listeners = new Set<() => void>();

function read(): State {
  if (state) return state;
  try {
    state = { ...EMPTY, ...JSON.parse(sessionStorage.getItem(KEY) ?? "{}") };
  } catch {
    state = EMPTY;
  }
  return state as State;
}

function write(next: State) {
  state = next;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private mode: keep it in memory for this page.
  }
  for (const l of listeners) l();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Separation of duties: whoever answered the question behind a rule never approves it. */
export const blockedApprover = (rule: Rule, by: string) =>
  rule.provenance.answeredBy !== null && rule.provenance.answeredBy === by;

function apply(rule: RuleView, changes: Change[] | undefined): RuleView {
  const last = changes?.at(-1);
  if (!last) return rule;
  const approved = last.status === "active";
  return {
    ...rule,
    status: last.status,
    provenance: {
      ...rule.provenance,
      approvedBy: approved ? last.by : rule.provenance.approvedBy,
      approvedAt: approved ? last.at : rule.provenance.approvedAt,
    },
  };
}

/** `initial` is the server's rules for this viewer (lib/server/rules.ts); this only layers decisions on top. */
export function useRuleStore(companyId: string, initial: RuleView[]) {
  const s = useSyncExternalStore(subscribe, read, () => EMPTY);
  const stated = s.stated.filter((r) => r.companyId === companyId);
  const rules = [...initial, ...stated].map((r) => apply(r, s.changes[r.id]));

  const decide = (
    rule: Rule,
    status: Rule["status"],
    label: ChangeLabel,
    by: string,
  ) => {
    if (status === "active" && blockedApprover(rule, by)) return;
    const cur = read();
    write({
      ...cur,
      changes: {
        ...cur.changes,
        [rule.id]: [
          ...(cur.changes[rule.id] ?? []),
          { status, label, by, at: new Date().toISOString() },
        ],
      },
    });
  };

  const undo = (ruleId: string) => {
    const cur = read();
    write({
      ...cur,
      changes: {
        ...cur.changes,
        [ruleId]: (cur.changes[ruleId] ?? []).slice(0, -1),
      },
    });
  };

  /** A rule the owner typed. Proposed until they confirm the restatement. */
  const addStated = (text: string, replaces: string | null) => {
    const cur = read();
    const rule: RuleView = {
      id: `${companyId}-stated-${cur.stated.length + 1}`,
      companyId,
      type: null,
      params: { replaces },
      words: text,
      evidence: null,
      summary: null,
      status: "proposed",
      source: "owner_stated",
      provenance: {
        lessonId: null,
        flagId: null,
        answeredBy: null,
        approvedBy: null,
        approvedAt: null,
        evidence: ["stated by owner, not seen in history"],
      },
      backtest: null,
      confidence: 1,
    };
    write({ ...cur, stated: [...cur.stated, rule] });
    return rule;
  };

  const answer = (questionId: string, a: Omit<Answer, "at">) => {
    const cur = read();
    write({
      ...cur,
      answers: {
        ...cur.answers,
        [questionId]: { ...a, at: new Date().toISOString() },
      },
    });
  };

  return {
    rules,
    lastChange: (id: string) => s.changes[id]?.at(-1) ?? null,
    changedIds: Object.keys(s.changes).filter((id) => s.changes[id].length),
    answers: s.answers,
    decide,
    undo,
    addStated,
    answer,
  };
}
