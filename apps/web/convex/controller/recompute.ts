// B-10/B-11: rebuild the Stage 1 draft from the corrected records. A draft the owner already approved
// goes back to `computed`, and the change is flagged to the owner (plan B 4.1 invariant).
import { computeStage1 } from "@payrollpilot/engine/payroll/stage1";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { write } from "../audit";
import { payrollInput } from "../lib/engine";

export async function recomputeDraft(
  ctx: MutationCtx,
  cycleId: Id<"cycles">,
  why: { correctionId: Id<"corrections"> } | { reason: string },
) {
  const p = await payrollInput(ctx, cycleId);
  const previous = await ctx.db
    .query("drafts")
    .withIndex("by_cycle", (q) => q.eq("cycleId", cycleId).eq("stage", 1))
    .order("desc")
    .first();
  const version = (previous?.workbookVersion ?? 0) + 1;
  const r = computeStage1(p.cycle, p.entries, p.workers, p.rules, {
    company: p.company,
    heldFlags: p.heldFlags,
    expenses: p.expenses,
    draftId: previous?._id,
    workbookVersion: version,
  });
  const doc = {
    companyId: p.company.id as Id<"companies">,
    cycleId,
    stage: 1 as const,
    lines: r.draft.lines.map((l) => ({
      ...l,
      workerId: l.workerId as Id<"workers">,
      heldFlagIds: l.heldFlagIds as Id<"flags">[],
      explain: r.explain[l.workerId] ?? [],
    })),
    venmoList: r.draft.venmoList.map((x) => ({
      ...x,
      workerId: x.workerId as Id<"workers">,
    })),
    workbookVersion: version,
    gustoPayrollId: previous?.gustoPayrollId ?? null,
    status: "computed" as const,
    totals: r.draft.totals,
  };
  let draftId: Id<"drafts">;
  if (previous) {
    await ctx.db.patch(previous._id, doc);
    draftId = previous._id;
  } else draftId = await ctx.db.insert("drafts", doc);

  const reviewed = previous && previous.status !== "computed";
  const payLines = (lines: typeof doc.lines) =>
    JSON.stringify(lines.map(({ explain: _e, ...l }) => l));
  if (reviewed && payLines(previous.lines) !== payLines(doc.lines)) {
    await ctx.db.insert("flags", {
      companyId: doc.companyId,
      cycleId,
      checkId: "CHK-22",
      status: "open",
      subject: { workerId: null, jobId: null, entryIds: [], expenseIds: [] },
      seen: `Draft ${draftId} changed after it was ${previous.status}: workbook v${previous.workbookVersion} → v${version}.`,
      where: [{ system: "payrollpilot", recordId: draftId, url: null }],
      confidence: "certain",
      precedent: null,
      routeTo: "owner",
      affects: {
        workerId: null,
        jobId: null,
        dollarsCents: doc.totals.grossCents - previous.totals.grossCents,
      },
      questionId: null,
      correctionId: "correctionId" in why ? why.correctionId : null,
    });
  }
  await write(ctx, {
    companyId: doc.companyId,
    cycleId,
    actor: { kind: "system", id: "controller.recompute", agent: null },
    type: reviewed ? "draft.changed_after_review" : "draft.recomputed",
    summary: `Workbook v${version}: ${doc.totals.hours} h, gross recomputed`,
    refs: {
      draftId,
      ...("correctionId" in why ? { correctionId: why.correctionId } : {}),
    },
    data: { version, reason: "reason" in why ? why.reason : null },
  });
  return draftId;
}
