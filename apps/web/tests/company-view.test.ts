import { describe, expect, test } from "vitest";
import companyA from "../../../data/fixtures/a/company.json";
import cyclesA from "../../../data/fixtures/a/cycles.json";
import flagsA from "../../../data/fixtures/a/flags.json";
import pastPayrollsA from "../../../data/fixtures/a/pastPayrolls.json";
import rulesA from "../../../data/fixtures/a/rules.json";
import syncRunsA from "../../../data/fixtures/a/syncRuns.json";
import entriesA from "../../../data/fixtures/a/timeEntries.json";
import rosterA from "../../../data/fixtures/a/workers.json";
import { viewerFor } from "../lib/policy";
import {
  buildCompanyView,
  type CompanyInputs,
} from "../lib/server/views/companyModel";
import type { FixtureWorker } from "../lib/types";

const input: CompanyInputs = {
  roster: rosterA as CompanyInputs["roster"],
  rules: rulesA,
  flags: flagsA as CompanyInputs["flags"],
  entries: entriesA,
  pastPayrolls: pastPayrollsA,
  cycles: cyclesA,
  syncRuns: syncRunsA,
  company: companyA,
  sources: {
    roster: "r",
    flags: "f",
    hours: "h",
    payrolls: "p",
    settings: "s",
  },
};
const workers = rosterA as unknown as FixtureWorker[];
const owner = viewerFor("owner", "a-w12", workers);
const manager = viewerFor("manager", "a-w11", workers);
const byId = (v: ReturnType<typeof buildCompanyView>, id: string) =>
  v.people.find((p) => p.id === id);

describe("companyView for the owner", () => {
  const view = buildCompanyView(owner, input);

  test("lists everyone with Jobber hours as recorded", () => {
    expect(view.people).toHaveLength(14);
    expect(byId(view, "a-w01")?.hours).toBe(85);
    expect(byId(view, "a-w05")?.hours).toBe(77.08);
    expect(byId(view, "a-w06")?.hours).toBeNull();
  });

  test("status comes from the exact person-level checks", () => {
    const look = view.people.filter((p) => p.needsLook).map((p) => p.id);
    expect(look.sort()).toEqual(
      ["a-w02", "a-w06", "a-w08", "a-w10", "a-w13", "a-w14"].sort(),
    );
    expect(byId(view, "a-w02")).toMatchObject({
      tone: "look",
      label: "Doesn't match",
      flagIds: ["a-fl-06"],
    });
    expect(byId(view, "a-w10")).toMatchObject({
      tone: "blocked",
      label: "No pay rate",
    });
    expect(byId(view, "a-w09")).toMatchObject({ tone: "info", label: "Venmo" });
    expect(byId(view, "a-w01")).toMatchObject({ tone: "ready" });
  });

  test("pay shows a sub-line only when something is off", () => {
    expect(byId(view, "a-w02")?.pay).toMatchObject({
      main: "$26.00/h",
      sub: "Gusto says $25.00/h",
      ruleId: "a-rule-17",
    });
    expect(byId(view, "a-w01")?.pay?.sub).toBeNull();
    expect(byId(view, "a-w08")?.pay?.main).toBe("$67,600/yr");
    expect(byId(view, "a-w10")?.pay?.main).toBe("No pay rate");
  });

  test("never invents a rate", () => {
    const tiles = byId(view, "a-w10")?.pay?.tiles ?? [];
    expect(tiles.find((t) => t.system === "rule")?.value).toBe("none");
    expect(tiles.find((t) => t.system === "gusto")?.value).toBe("not in Gusto");
  });

  test("pay history cites the past payroll records", () => {
    const h = byId(view, "a-w02")?.pay?.history ?? [];
    expect(h[0].id).toBe("now");
    expect(h[1]).toMatchObject({
      text: "$26.00/h · paid in Gusto",
      recordIds: ["a-pp-402"],
    });
  });

  test("profile settings and connected apps come from the fixtures", () => {
    expect(view.settings.find((s) => s.id === "overtime")?.text).toBe(
      "40 h a week, 1.5×",
    );
    expect(view.apps.map((a) => a.count)).toEqual([
      "85 of 85 entries",
      "6 of 6 purchases",
      "12 of 12 employees",
    ]);
    expect(view.routing?.jobFacts?.id).toBe("a-w11");
  });
});

describe("companyView for the manager", () => {
  const view = buildCompanyView(manager, input);

  test("sees only their crew", () => {
    const crew = workers.filter(
      (w) => w.managerId === "a-w11" || w.id === "a-w11",
    );
    expect(view.people.map((p) => p.id).sort()).toEqual(
      crew.map((w) => w.id).sort(),
    );
    expect(view.canSeePay).toBe(false);
  });

  test("gets no pay, rates or pay history", () => {
    for (const p of view.people) expect(p.pay).toBeNull();
    // No dollar amount anywhere in what the manager's browser receives.
    expect(JSON.stringify(view)).not.toMatch(/\$\d/);
  });

  test("owner-routed pay checks stay with the owner", () => {
    // CHK-10 (rate mismatch) is owner-routed, so the manager sees no status for it.
    expect(byId(view, "a-w02")?.flagIds).toEqual([]);
    // CHK-07 (no hours) is a job fact and goes to the manager.
    expect(byId(view, "a-w06")).toMatchObject({ label: "No hours" });
  });
});

describe("companyView history read (onboarding)", () => {
  test("counts past records and keeps the incomplete sync visible", () => {
    const { history } = buildCompanyView(owner, input);
    expect(history.cycles).toBe(4);
    expect(history.period).toBe("Aug 15 – Oct 9");
    expect(history.reads[0]).toMatchObject({
      label: "Time entries",
      pulled: 302,
      expected: 303,
      complete: false,
    });
  });
});
