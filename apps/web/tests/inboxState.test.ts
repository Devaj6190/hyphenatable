import { describe, expect, test } from "vitest";
import {
  EV,
  employeeAnswer,
  isDone,
  itemState,
} from "../components/manager/inboxState";
import type { AuditEvent } from "../lib/types";

let n = 0;
const ev = (type: string, refs: Record<string, string> = {}): AuditEvent => ({
  id: `local-au-${++n}`,
  companyId: "a",
  cycleId: "a-c05",
  at: `2026-10-24T09:00:${String(n).padStart(2, "0")}.000Z`,
  actor: { kind: "user", id: "a-w11", agent: null },
  type,
  summary: "",
  refs: { flagId: "a-fl-04", ...refs },
  data: null,
});

describe("itemState", () => {
  test("open until something happens, and other flags do not count", () => {
    expect(itemState("a-fl-04", [])).toEqual({ st: "open" });
    expect(
      itemState("a-fl-04", [ev(EV.marked, { flagId: "a-fl-09" })]).st,
    ).toBe("open");
  });

  test("I updated it is a claim: checking until a re-check reports", () => {
    const marked = ev(EV.marked);
    expect(itemState("a-fl-04", [marked])).toMatchObject({
      st: "checking",
      tries: 1,
    });
    expect(isDone(itemState("a-fl-04", [marked]))).toBe(false);
  });

  test("still wrong, check again, then fixed", () => {
    const evs = [ev(EV.marked), ev(EV.still), ev(EV.marked)];
    expect(itemState("a-fl-04", evs)).toMatchObject({
      st: "checking",
      tries: 2,
    });
    const fixed = { ...ev(EV.fixed), data: { simulated: true } };
    expect(itemState("a-fl-04", [...evs, fixed])).toMatchObject({
      st: "fixed",
      simulated: true,
    });
  });

  test("an answer is done, and Undo reopens it", () => {
    const a = ev(EV.answered, { option: "2" });
    expect(itemState("a-fl-04", [a])).toMatchObject({
      st: "answered",
      option: 2,
    });
    expect(itemState("a-fl-04", [a, ev(EV.undone)])).toEqual({ st: "open" });
  });

  test("the employee's answer does not close the manager's item", () => {
    const e = ev(EV.employee, { option: "1", answer: "12:00 – 4:00 only" });
    expect(itemState("a-fl-04", [e]).st).toBe("open");
    expect(employeeAnswer("a-fl-04", [e])?.answer).toBe("12:00 – 4:00 only");
    expect(employeeAnswer("a-fl-04", [e, ev(EV.employeeUndone)])).toBeNull();
  });
});
