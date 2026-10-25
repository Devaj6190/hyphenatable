// Shared test data for the Convex function tests: one company, an owner, a manager, a field worker
// with two overlapping entries on job 12 (a CHK-04 flag), and Company A's overtime policy.
import { convexTest } from "convex-test";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";

export const modules = import.meta.glob("../convex/**/*.ts");

const nul = null;

/** One company, an owner, a manager and one field worker with two overlapping entries (a CHK-04 flag). */
export async function seed() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", {
      name: "Test Co",
      kind: "synthetic",
      payFrequency: "biweekly",
      timezone: "America/Los_Angeles",
      settings: {
        longShiftHours: 12,
        otWeeklyHours: 40,
        grossChangePct: 25,
        employeesMayBeTexted: true,
        lowMarginPct: 10,
      },
    });
    const worker = (
      role: "owner" | "manager" | "field",
      managerId: Id<"workers"> | null,
      contactRef: string | null,
    ) => ({
      companyId,
      displayName: `${role} person`,
      role,
      payType: "hourly" as const,
      status: "active" as const,
      managerId,
      contactRef,
      jobber: nul,
      gusto: {
        employeeUuid: `gusto-${role}`,
        contractorUuid: nul,
        jobUuid: nul,
        rateCents: 2400,
        paymentUnit: "Hour",
        flsaStatus: nul,
        onboarded: true,
      },
      venmoRateCents: nul,
    });
    const ownerId = await ctx.db.insert("workers", worker("owner", null, null));
    // Pay is never computed without an overtime policy (no defaults): Company A's.
    await ctx.db.insert("rules", {
      companyId,
      type: "overtime_policy",
      params: { weeklyHours: 40, multiplier: 1.5, dailyHours: null },
      status: "active",
      source: "history",
      provenance: {
        lessonId: nul,
        flagId: nul,
        answeredBy: nul,
        approvedBy: ownerId,
        approvedAt: "2026-10-01T00:00:00Z",
        evidence: ["fixture"],
      },
      backtest: nul,
      confidence: 1,
    });
    const managerId = await ctx.db.insert(
      "workers",
      worker("manager", null, "c_mgr"),
    );
    const fieldId = await ctx.db.insert(
      "workers",
      worker("field", managerId, "c_field"),
    );
    const jobId = await ctx.db.insert("jobs", {
      companyId,
      sourceId: "jobber:j1",
      jobNumber: 12,
      title: "Spring cleanup",
      clientRef: "client:1",
      status: "active",
      salespersonWorkerId: nul,
      quoteId: nul,
      parentJobId: nul,
      startAt: nul,
      endAt: nul,
      totalCents: 100000,
    });
    const cycleId = await ctx.db.insert("cycles", {
      companyId,
      number: 1,
      periodStart: "2026-10-05T07:00:00.000Z",
      periodEnd: "2026-10-19T06:59:59.999Z",
      cutoffAt: "2026-10-19T01:00:00.000Z",
      stage: "asking",
      gustoPayrollId: nul,
      gustoOffCyclePayrollId: nul,
      questionsAsked: 0,
    });
    const entry = (sourceId: string, startAt: string, endAt: string) => ({
      companyId,
      cycleId,
      sourceId,
      workerId: fieldId,
      jobId,
      visitId: nul,
      startAt,
      endAt,
      durationSec: (Date.parse(endAt) - Date.parse(startAt)) / 1000,
      ticking: false,
      approved: true,
      approvedBy: nul,
      payable: true,
      category: "WORK",
      label: nul,
      hasNote: false,
    });
    // 8am-4pm and 1pm-3pm local on Oct 7.
    const a = await ctx.db.insert(
      "timeEntries",
      entry("jobber:te1", "2026-10-07T15:00:00Z", "2026-10-07T23:00:00Z"),
    );
    const b = await ctx.db.insert(
      "timeEntries",
      entry("jobber:te2", "2026-10-07T20:00:00Z", "2026-10-07T22:00:00Z"),
    );
    const flagId = await ctx.db.insert("flags", {
      companyId,
      cycleId,
      checkId: "CHK-04",
      status: "open",
      subject: {
        workerId: fieldId,
        jobId: nul,
        entryIds: [a, b],
        expenseIds: [],
      },
      seen: `Entries ${a} and ${b} overlap.`,
      where: [],
      confidence: "certain",
      precedent: { ruleId: nul, flagId: nul, note: "no precedent" },
      routeTo: "manager",
      affects: { workerId: fieldId, jobId: nul, dollarsCents: nul },
      questionId: nul,
      correctionId: nul,
    });
    return {
      companyId,
      ownerId,
      managerId,
      fieldId,
      jobId,
      cycleId,
      a,
      b,
      flagId,
    };
  });
  return { t, ...ids };
}
