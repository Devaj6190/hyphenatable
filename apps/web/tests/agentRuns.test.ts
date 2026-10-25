import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import fixture from "../app/_fixtures/agentRuns.json";
import { AgentRuns } from "../components/AgentRuns";
import { MorningBrief } from "../components/MorningBrief";
import type { AgentRunRow, CreaoRunStatus } from "../lib/agents";
import type { AuditEvent } from "../lib/types";

const tz = fixture.timezone;
const events = fixture.events as unknown as AuditEvent[];
const base = fixture.runs[0] as AgentRunRow;

const statuses: [CreaoRunStatus, string][] = [
  ["starting", "Starting"],
  ["pending", "Pending"],
  ["running", "Running"],
  ["completed", "Completed"],
  ["failed", "Failed"],
  ["cancelled", "Cancelled"],
];

const html = (runs: AgentRunRow[]) =>
  renderToStaticMarkup(createElement(AgentRuns, { runs, timezone: tz }));

describe("AgentRuns", () => {
  test.each(statuses)("renders status %s", (status, label) => {
    const out = html([{ ...base, status }]);
    expect(out).toContain(label);
    expect(out).toContain("Auditor");
  });

  test("one row per agent, newest run wins, times in the company zone", () => {
    const out = html(fixture.runs as AgentRunRow[]);
    expect(out.match(/<li/g)).toHaveLength(3);
    expect(out).toContain("Starting");
    expect(out).not.toContain("Failed");
    expect(out).toContain("EDT");
  });

  test("nothing renders a $ amount", () => {
    expect(html(fixture.runs as AgentRunRow[])).not.toContain("$");
    for (const [status] of statuses)
      expect(html([{ ...base, status }])).not.toContain("$");
  });
});

describe("MorningBrief", () => {
  const brief = (e: AuditEvent[]) =>
    renderToStaticMarkup(
      createElement(MorningBrief, { events: e, timezone: tz }),
    );

  test("shows the newest auditor.brief with its label", () => {
    const out = brief(events);
    expect(out).toContain("From the Auditor (Creao), proposal only");
    expect(out).toContain("F-110");
    expect(out).not.toContain("F-101");
    expect(out).not.toContain("$");
  });

  test("empty state", () => {
    expect(brief([])).toContain("No brief yet");
    expect(brief(events.filter((e) => e.type !== "auditor.brief"))).toContain(
      "No brief yet",
    );
  });
});
