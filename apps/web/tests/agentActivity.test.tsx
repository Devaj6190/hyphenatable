import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { AgentActivity, fixtureAgentData } from "../components/AgentActivity";
import { RoleProvider } from "../components/RoleProvider";
import type { Doc, Id } from "../convex/_generated/dataModel";
import { type CreaoRunDoc, toAgentRun, toAuditEvent } from "../lib/live/agents";

const tz = "America/New_York";

const render = (role: "owner" | "manager", companyId = "a") =>
  renderToStaticMarkup(
    <RoleProvider initialRole={role}>
      <AgentActivity companyId={companyId} timezone={tz} />
    </RoleProvider>,
  );

describe("AgentActivity on the owner home", () => {
  // No LiveProvider in the tree means Convex is off: the section falls back to the fixture and says so.
  test("owner without Convex sees the synthetic fixture, labelled with its source", () => {
    const out = render("owner");
    expect(out).toContain("Agents");
    expect(out).toContain("synthetic");
    expect(out).toContain("apps/web/app/_fixtures/agentRuns.json");
    expect(out).toContain("Convex not configured");
    expect(out).toContain("F-110");
    expect(out).toContain("Auditor");
    expect(out).not.toContain("$");
  });

  test("a manager never sees it", () => {
    expect(render("manager")).toBe("");
  });

  test("a company with no fixture rows gets empty states, not Company A's", () => {
    expect(fixtureAgentData("b")).toEqual({ runs: [], events: [] });
    const out = render("owner", "b");
    expect(out).toContain("No agent runs yet");
    expect(out).toContain("No brief yet");
    expect(out).not.toContain("F-110");
  });
});

describe("Convex rows to screen shapes", () => {
  test("a creaoRuns row keeps its ids and fields", () => {
    const doc = {
      _id: "run1" as Id<"creaoRuns">,
      _creationTime: 0,
      companyId: "co1" as Id<"companies">,
      cycleId: "cy1" as Id<"cycles">,
      agent: "auditor",
      attempt: 1,
      runId: "creao-1",
      status: "completed",
      startedAt: "2026-10-25T07:00:00.000Z",
      finishedAt: "2026-10-25T07:02:00.000Z",
      credits: 3.5,
      error: null,
    } satisfies CreaoRunDoc;
    const row = toAgentRun(doc);
    expect(row.id).toBe("run1");
    expect(row).not.toHaveProperty("callbackToken");
    expect(row).toMatchObject({
      agent: "auditor",
      status: "completed",
      credits: 3.5,
    });
  });

  test("an auditor.brief audit row becomes an AuditEvent with its text", () => {
    const doc = {
      _id: "ev1" as Id<"auditEvents">,
      _creationTime: 0,
      companyId: "co1" as Id<"companies">,
      cycleId: "cy1" as Id<"cycles">,
      at: "2026-10-25T07:03:00.000Z",
      actor: { kind: "agent", id: "auditor", agent: "auditor" },
      type: "auditor.brief",
      summary: "Morning brief from the Auditor",
      refs: { cycleId: "cy1" },
      data: { text: "2 flags need you today." },
    } satisfies Doc<"auditEvents">;
    const e = toAuditEvent(doc);
    expect(e).toMatchObject({ id: "ev1", type: "auditor.brief" });
    expect((e.data as { text?: string }).text).toBe("2 flags need you today.");
  });
});
