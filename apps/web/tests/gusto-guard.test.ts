// @vitest-environment edge-runtime
// drafts.fillGusto never writes a real company's payroll, and fails closed on an unknown cycle.
import { expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import { seed } from "./seed";

test("a real company is refused before anything reaches Gusto", async () => {
  const s = await seed();
  await s.t.run((ctx) => ctx.db.patch(s.companyId, { kind: "real" }));
  await expect(
    s.t.action(api.drafts.fillGusto, { cycleId: s.cycleId, stage: 1 }),
  ).rejects.toThrow(/synthetic companies only/);
});

test("a missing cycle is refused too", async () => {
  const s = await seed();
  await s.t.run((ctx) => ctx.db.delete(s.cycleId));
  await expect(
    s.t.action(api.drafts.fillGusto, { cycleId: s.cycleId, stage: 1 }),
  ).rejects.toThrow(/synthetic companies only/);
});

test("a synthetic company gets past the guard (B-12 fills it)", async () => {
  const s = await seed();
  await expect(
    s.t.action(api.drafts.fillGusto, { cycleId: s.cycleId, stage: 1 }),
  ).rejects.toThrow(/B-12/);
});
