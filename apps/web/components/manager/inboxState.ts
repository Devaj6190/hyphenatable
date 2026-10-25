import type { AuditEvent } from "@/lib/types";

// Where each inbox item stands, read off the append-only demo events (lib/demoLocal) for its flag. Nothing is
// edited in place: Undo is one more event. Pure, so the inbox and its test share it.
export const EV = {
  marked: "check.marked_fixed",
  fixed: "check.recheck_fixed",
  still: "check.recheck_still_there",
  answered: "answer.dashboard",
  undone: "answer.undone",
  employee: "answer.employee",
  employeeUndone: "answer.employee_undone",
} as const;

export type ItemState =
  | { st: "open" }
  | { st: "checking"; tries: number; at: string }
  | { st: "still-there"; tries: number; at: string }
  | { st: "fixed"; at: string; simulated: boolean }
  | { st: "answered"; option: number; at: string };

export function itemState(flagId: string, events: AuditEvent[]): ItemState {
  let s: ItemState = { st: "open" };
  let tries = 0;
  for (const e of events) {
    if (e.refs.flagId !== flagId) continue;
    switch (e.type) {
      case EV.marked:
        tries += 1;
        s = { st: "checking", tries, at: e.at };
        break;
      case EV.fixed:
        s = { st: "fixed", at: e.at, simulated: e.data?.simulated === true };
        break;
      case EV.still:
        s = { st: "still-there", tries, at: e.at };
        break;
      case EV.answered:
        s = { st: "answered", option: Number(e.refs.option), at: e.at };
        break;
      case EV.undone:
        s = { st: "open" };
        tries = 0;
        break;
    }
  }
  return s;
}

export const isDone = (s: ItemState) => s.st === "fixed" || s.st === "answered";

/** The worker's own answer from the employee page, if they gave one and did not take it back. */
export function employeeAnswer(
  flagId: string,
  events: AuditEvent[],
): { option: number; answer: string; at: string } | null {
  let a: { option: number; answer: string; at: string } | null = null;
  for (const e of events) {
    if (e.refs.flagId !== flagId) continue;
    if (e.type === EV.employee)
      a = {
        option: Number(e.refs.option),
        answer: e.refs.answer ?? "",
        at: e.at,
      };
    if (e.type === EV.employeeUndone) a = null;
  }
  return a;
}
