// @vitest-environment edge-runtime
// CHK-10: an owner-approved pay_rate rule settles the Jobber/Gusto rate mismatch instead of asking.
import { expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { seed } from "./seed";

/** The field worker's Jobber rate differs from Gusto (2400¢), so CHK-10 fires; optionally a pay_rate rule. */
async function setup(approvedBy: "owner" | null) {
  const s = await seed();
  const ruleId = await s.t.run(async (ctx) => {
    await ctx.db.patch(s.fieldId, {
      jobber: { userId: "j-field", labourRateCents: 2600, status: "active" },
    });
    return ctx.db.insert("rules", {
      companyId: s.companyId,
      type: "pay_rate",
      params: { workerId: s.fieldId, rateCents: 2600, paymentUnit: "Hour" },
      status: "active",
      source: "answer",
      provenance: {
        lessonId: null,
        flagId: null,
        answeredBy: null,
        approvedBy: approvedBy ? s.ownerId : null,
        approvedAt: approvedBy ? "2026-10-02T00:00:00Z" : null,
        evidence: ["test"],
      },
      backtest: null,
      confidence: 1,
    });
  });
  await s.t.mutation(api.checks.run, { cycleId: s.cycleId });
  const flag = await s.t.run(async (ctx) =>
    (await ctx.db.query("flags").collect()).find((f) => f.checkId === "CHK-10"),
  );
  const settled = await s.t.run((ctx) =>
    ctx.db
      .query("auditEvents")
      .collect()
      .then((es) => es.filter((e) => e.type === "flag.settled_by_rule")),
  );
  return { ruleId: ruleId as Id<"rules">, flag, settled };
}

test("an owner-approved pay_rate rule settles CHK-10, cites the rule and is audited", async () => {
  const { ruleId, flag, settled } = await setup("owner");
  expect(flag?.status).toBe("dismissed");
  expect(flag?.precedent?.ruleId).toBe(ruleId);
  expect(settled).toHaveLength(1);
  expect(settled[0].refs).toMatchObject({ flagId: flag?._id, ruleId });
});

test("a rule nobody approved does not settle anything: the owner still decides", async () => {
  const { flag, settled } = await setup(null);
  expect(flag?.status).toBe("open");
  expect(settled).toHaveLength(0);
});
