// Synthetic inputs only: these tests never read data/private.
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { leakCheck, manifest, packageFiles, REPO } from "../build-r-package";
import { buildRPackage, type RRules } from "../lib/r-package";

type R = Record<string, unknown>;
const exportsBundle = {
  namesAnonymized: true,
  companyId: "r",
  workers: [
    { id: "r:w:own", displayName: "Worker W01" },
    { id: "r:w:hrly", displayName: "Worker W02", teamLeader: true },
    { id: "r:w:norole", displayName: "Worker W03" },
  ],
  clients: [{ id: "r:c:1", name: "Client C01" }],
  jobs: [{ id: "r:j:1", jobNumber: 1, title: "Job J001" }],
  timeEntries: [
    // past period, complete
    {
      id: "export:te:f1:2",
      companyId: "r",
      cycleId: null,
      sourceId: "xlsx:f1#row2",
      workerId: "r:w:hrly",
      jobId: "r:j:1",
      visitId: null,
      startAt: "2026-09-22T11:00:00.000Z",
      endAt: "2026-09-22T19:00:00.000Z",
      durationSec: 28800,
      ticking: null,
      approved: true,
      approvedBy: null,
      payable: null,
      category: "GENERAL",
      label: null,
      hasNote: false,
      date: "2026-09-22",
      clientRef: "r:c:1",
    },
    // current cycle, no end
    {
      id: "export:te:f1:3",
      companyId: "r",
      cycleId: null,
      sourceId: "xlsx:f1#row3",
      workerId: "r:w:hrly",
      jobId: "r:j:1",
      visitId: null,
      startAt: "2026-10-06T11:00:00.000Z",
      endAt: null,
      durationSec: 0,
      ticking: null,
      approved: null,
      approvedBy: null,
      payable: null,
      category: "GENERAL",
      label: null,
      hasNote: false,
      date: "2026-10-06",
      clientRef: "r:c:1",
    },
    // blocked worker
    {
      id: "export:te:f1:4",
      companyId: "r",
      cycleId: null,
      sourceId: "xlsx:f1#row4",
      workerId: "r:w:norole",
      jobId: null,
      visitId: null,
      startAt: "2026-09-23T11:00:00.000Z",
      endAt: "2026-09-23T15:00:00.000Z",
      durationSec: 14400,
      ticking: null,
      approved: true,
      approvedBy: null,
      payable: null,
      category: "GENERAL",
      label: null,
      hasNote: false,
      date: "2026-09-23",
      clientRef: null,
    },
  ],
  paid: [
    {
      workerId: "r:w:hrly",
      periodStart: "2026-09-21",
      periodEnd: "2026-10-04",
      checkDate: "2026-10-09",
      grossCents: 72000,
      sourceId: "csv:g1#row5",
      sectionKind: "regular",
      payKind: "wage",
      earningsCents: { Regular: 64000, Overtime: 8000 },
      hours: { Regular: 32, Overtime: 2.67 },
      jobLines: [],
      ownerDrawCents: 0,
    },
    {
      workerId: "r:w:hrly",
      periodStart: "2026-09-21",
      periodEnd: "2026-10-04",
      checkDate: "2026-10-12",
      grossCents: 5000,
      sourceId: "csv:g1#row9",
      sectionKind: "off_cycle",
      payKind: "wage",
      earningsCents: { Commission: 5000 },
      hours: {},
      jobLines: [],
      ownerDrawCents: 0,
    },
    {
      workerId: "r:w:own",
      periodStart: "2026-09-21",
      periodEnd: "2026-10-04",
      checkDate: "2026-10-09",
      grossCents: 0,
      sourceId: "csv:g1#row7",
      sectionKind: "regular",
      payKind: "owner_draw",
      earningsCents: {},
      hours: {},
      jobLines: [],
      ownerDrawCents: 300000,
    },
  ],
  paidByPeriod: [],
  expenses: [
    {
      id: "export:qbo:q1:1:2",
      companyId: "r",
      source: "qbo",
      sourceId: "xlsx:q1#s1row2",
      date: "2026-09-24",
      amountCents: 12345,
      vendor: "Vendor V01",
      description: null,
      accountName: "Materials",
      customerRef: "r:j:1",
      paymentType: "Expense",
      kind: "unknown",
      matchedJobId: null,
      matchConfidence: null,
      reimbursableToWorkerId: null,
      reimbursementStatus: null,
    },
    {
      id: "export:qbo:q1:1:3",
      companyId: "r",
      source: "qbo",
      sourceId: "xlsx:q1#s1row3",
      date: "2026-10-07",
      amountCents: 4500,
      vendor: null,
      description: null,
      accountName: "Fuel",
      customerRef: null,
      paymentType: "Expense",
      kind: "unknown",
      matchedJobId: null,
      matchConfidence: null,
      reimbursableToWorkerId: "r:w:norole",
      reimbursementStatus: null,
    },
  ],
};
const jobberBundle = {
  namesAnonymized: true,
  records: {
    quotes: [
      {
        id: "jobber:q1",
        companyId: "r",
        sourceId: "Q1",
        jobId: "r:j:1",
        salespersonWorkerId: null,
        sentAt: "2026-09-10T15:00:00.000Z",
        status: "converted",
        amountCents: 90000,
      },
    ],
    payments: [
      {
        id: "jobber:p1",
        companyId: "r",
        sourceId: "P1",
        invoiceId: null,
        quoteId: "jobber:q1",
        entryDate: "2026-09-12",
        amountCents: 30000,
        paymentType: "card",
        kind: "deposit-ish",
      },
    ],
  },
  syncRuns: [
    {
      companyId: "r",
      cycleId: null,
      source: "export",
      object: "timeSheetEntries",
      startedAt: "2026-10-25T01:00:00.000Z",
      finishedAt: "2026-10-25T01:00:01.000Z",
      pulled: 3,
      expected: 3,
      complete: true,
      method: "export file:f1",
      error: null,
    },
  ],
};
const venmoBundle = {
  namesAnonymized: true,
  venmo: [
    {
      id: "venmo:1",
      sourceId: "V1",
      date: "2026-09-25",
      amountCents: 40000,
      workerId: "r:w:vm",
      class: "wage",
    },
    {
      id: "venmo:2",
      sourceId: "V2",
      date: "2026-09-26",
      amountCents: 2500,
      workerId: "r:w:hrly",
      class: "reimbursement",
    },
    {
      id: "venmo:3",
      sourceId: "V3",
      date: "2026-09-27",
      amountCents: 1000,
      workerId: null,
      class: "personal",
    },
    {
      id: "venmo:4",
      sourceId: "V4",
      date: "2026-09-28",
      amountCents: 2000,
      workerId: "r:w:hrly",
      class: "tip",
    },
  ],
};
const rules: RRules = {
  timezone: "America/New_York",
  payFrequency: "biweekly",
  workers: [
    {
      id: "r:w:hrly",
      payType: "hourly",
      rateCents: 2000,
      paymentUnit: "Hour",
      role: "field",
    },
    {
      id: "r:w:vm",
      payType: "contractor_venmo",
      rateCents: 2500,
      paymentUnit: "Hour",
      role: "field",
    },
    { id: "r:w:own", payType: "salary", rateCents: null, paymentUnit: null },
  ],
  rules: [
    {
      id: "r-rule-1",
      type: "overtime_policy",
      params: { weeklyHours: 40, multiplier: 1.5 },
      status: "active",
    },
    {
      id: "r-rule-2",
      type: "expense_account_kind",
      params: { accountName: "Materials", kind: "job_cost" },
      status: "active",
    },
  ],
};
const opts = { current: { start: "2026-10-05", end: "2026-10-18" } };
const full = {
  ...opts,
  settings: {
    longShiftHours: 11,
    grossChangePct: 25,
    employeesMayBeTexted: false,
    lowMarginPct: 20,
  },
};

describe("Company R package (synthetic inputs)", () => {
  const p = buildRPackage(
    [exportsBundle, jobberBundle, venmoBundle] as never,
    rules,
    full,
  );
  const h = p.history as Record<string, R[]>;
  const c = p.current as Record<string, R[]>;

  test("cycles: journal periods plus the current unpaid cycle (setup)", () => {
    expect(
      (c["cycles.json"] as R[]).map((x) => [
        x.periodStart,
        x.periodEnd,
        x.stage,
      ]),
    ).toEqual([
      ["2026-09-21", "2026-10-04", "closed"],
      ["2026-10-05", "2026-10-18", "setup"],
    ]);
    expect(h["cycles.json"]).toHaveLength(1);
  });

  test("workers: role and pay type only when known; unknown ones blocked, never guessed", () => {
    expect(
      (c["workers.json"] as R[]).map((w) => [w.id, w.role, w.payType]).sort(),
    ).toEqual([
      ["r:w:hrly", "field", "hourly"],
      ["r:w:own", "owner", "salary"],
      ["r:w:vm", "field", "contractor_venmo"],
    ]);
    expect(p.blocked).toEqual([
      { id: "r:w:norole", reason: "role unknown, payType unknown" },
    ]);
    expect(
      (c["workers.json"] as R[]).find((w) => w.id === "r:w:vm")?.venmoRateCents,
    ).toBe(2500);
  });

  test("time entries: approved/payable are never invented; unloadable with reasons", () => {
    expect(c["timeEntries.json"]).toEqual([]);
    const te = p.unloadable.filter((u) => u.table === "timeEntries");
    expect(te).toHaveLength(3);
    expect(
      te.find((u) => u.id === "export:te:f1:2")?.reasons.join(" "),
    ).toContain("payable");
    expect(
      te.find((u) => u.id === "export:te:f1:4")?.reasons.join(" "),
    ).toContain("blocked");
    expect(
      te.find((u) => u.id === "export:te:f1:3")?.reasons.join(" "),
    ).toContain("ticking");
  });

  test("past payrolls: Gusto wage rows (regular and off-cycle) + Venmo wage; owner draws apart", () => {
    const pp = c["pastPayrolls.json"] as R[];
    expect(
      pp.map((x) => [x.workerId, x.paidVia, x.grossCents, x.sourceId]).sort(),
    ).toEqual([
      ["r:w:hrly", "gusto_off_cycle", 5000, "csv:g1#row9"],
      ["r:w:hrly", "gusto_regular", 72000, "csv:g1#row5"],
      ["r:w:vm", "venmo", 40000, "V1"],
    ]);
    expect(p.ownerDraws).toHaveLength(1);
  });

  test("expenses, payments, Venmo classes", () => {
    const ex = c["expenses.json"] as R[];
    expect(ex.find((x) => x.accountName === "Materials")?.kind).toBe(
      "job_cost",
    );
    // reimbursable to a blocked worker: unloadable with the reason, never nulled
    expect(ex.find((x) => x.accountName === "Fuel")).toBeUndefined();
    expect(
      p.unloadable.find((u) => u.id === "export:qbo:q1:1:3")?.reasons[0],
    ).toContain("reimbursableToWorkerId");
    expect((c["payments.json"] as R[])[0].kind).toBe("unknown");
    expect(p.unloadable.find((u) => u.id === "venmo:2")?.reasons[0]).toContain(
      "Venmo reimbursement",
    );
    expect(p.excluded.personalVenmo).toBe(1);
    expect(p.excluded.venmoNotWage).toEqual({ tip: 1 });
  });

  test("history excludes the current cycle's records; current is a superset", () => {
    expect((h["expenses.json"] as R[]).map((x) => x.id)).toEqual([
      "export:qbo:q1:1:2",
    ]);
    expect((c["expenses.json"] as R[]).length).toBe(1);
    expect(h["company.json"]).toBeDefined();
  });

  test("without lowMarginPct etc. the company row is held back and reported", () => {
    const q = buildRPackage([exportsBundle] as never, rules, opts);
    expect(q.companyMissing.sort()).toEqual([
      "employeesMayBeTexted",
      "grossChangePct",
      "longShiftHours",
      "lowMarginPct",
    ]);
    expect(q.current["company.json"]).toBeUndefined();
  });

  test("every written folder passes Devaj's strict check-fixtures", () => {
    const dir = mkdtempSync(join(tmpdir(), "rpkg-"));
    for (const [rel, text] of Object.entries(packageFiles(p))) {
      mkdirSync(join(dir, rel, ".."), { recursive: true });
      writeFileSync(join(dir, rel), text);
    }
    for (const d of ["history", "current"]) {
      const r = spawnSync(
        "bun",
        [
          "run",
          join(REPO, "packages/engine/scripts/check-fixtures.ts"),
          join(dir, d),
        ],
        { encoding: "utf8" },
      );
      expect(`${r.stdout}${r.stderr}`).not.toContain("FAIL");
      expect(r.status).toBe(0);
    }
    const m = manifest(p, "2026-10-25", { history: "ok", current: "ok" });
    expect(m).toContain("real, anonymized");
    expect(m).toContain("Unloadable rows: 5");
  });

  test("leak check refuses any real token", () => {
    const files = packageFiles(p);
    expect(() => leakCheck(files, ["zelda"])).not.toThrow();
    expect(() =>
      leakCheck({ ...files, "x.json": '{"displayName":"Zelda Q"}' }, ["zelda"]),
    ).toThrow("refusing to write");
  });
});
