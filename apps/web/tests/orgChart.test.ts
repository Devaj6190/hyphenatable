import { describe, expect, test } from "vitest";
import { handoffCounts } from "../lib/audit";
import type { AuditEvent } from "../lib/types";

let n = 0;
const ev = (
  kind: "system" | "agent" | "user",
  agent: "analyst" | "auditor" | "messenger" | null,
  type: string,
  refs: Record<string, string> = {},
): AuditEvent => ({
  id: `e${n++}`,
  companyId: "a",
  cycleId: null,
  at: "2026-01-01T00:00:00.000Z",
  actor: { kind, id: agent ?? kind, agent },
  type,
  summary: "",
  refs,
  data: null,
});

describe("handoffCounts", () => {
  test("is all zeros with no events", () => {
    expect(handoffCounts([])).toEqual({
      auditor: { flagged: 0, routed: 0 },
      messenger: { drafted: 0, read: 0 },
      analyst: { proposed: 0 },
    });
  });

  test("counts distinct flagged flags and those routed to the Messenger", () => {
    const c = handoffCounts([
      ev("agent", "auditor", "check.matched", { flagId: "f1" }),
      ev("agent", "auditor", "check.matched", { flagId: "f1" }),
      ev("agent", "auditor", "check.matched", { flagId: "f2" }),
      ev("agent", "messenger", "message.drafted", { flagId: "f2" }),
      ev("agent", "messenger", "message.interpreted", { flagId: "f2" }),
      ev("agent", "messenger", "message.drafted", { flagId: "f9" }),
      ev("agent", "analyst", "rule.proposed", { ruleId: "R-1" }),
    ]);
    expect(c.auditor).toEqual({ flagged: 2, routed: 1 });
    expect(c.messenger).toEqual({ drafted: 2, read: 1 });
    expect(c.analyst).toEqual({ proposed: 1 });
  });

  test("ignores code and user events, and non-check auditor events", () => {
    const c = handoffCounts([
      ev("system", null, "check.fired", { flagId: "f1" }),
      ev("user", null, "message.approved", { flagId: "f1" }),
      ev("agent", null, "demo.simulated_reply", { flagId: "f1" }),
      ev("agent", "auditor", "correction.proposed", { flagId: "f1" }),
    ]);
    expect(c.auditor).toEqual({ flagged: 0, routed: 0 });
    expect(c.messenger).toEqual({ drafted: 0, read: 0 });
  });
});
