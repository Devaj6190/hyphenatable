import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { managerSummary } from "@payrollpilot/engine/messages/summary";
import type { Company, Cycle, Flag } from "@payrollpilot/engine/schemas";

// The manager's summary text, built from the committed fixtures until Convex holds real flags (stub only).
// The current cycle is the newest one that is not closed, unless cycleId names one.
export function summaryFromFixtures(opts: {
  fixturesDir: string;
  companyId: string;
  cycleId?: string;
  dashboardUrl: string | null;
}): { text: string | null; cycleId: string } {
  const dir = join(opts.fixturesDir, opts.companyId);
  if (!existsSync(dir))
    throw new Error(`no fixtures for company ${opts.companyId}`);
  const read = <T>(name: string): T =>
    JSON.parse(readFileSync(join(dir, name), "utf8")) as T;
  const company = read<Company>("company.json");
  const cycles = read<Cycle[]>("cycles.json");
  const cycle = opts.cycleId
    ? cycles.find((c) => c.id === opts.cycleId)
    : cycles.filter((c) => c.stage !== "closed").at(-1);
  if (!cycle)
    throw new Error(
      `no cycle ${opts.cycleId ?? "open"} for company ${opts.companyId}`,
    );
  const text = managerSummary({
    flags: read<Flag[]>("flags.json"),
    cycle,
    timeZone: company.timezone,
    dashboardUrl: opts.dashboardUrl,
  });
  return { text, cycleId: cycle.id };
}
