import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id, TableNames } from "./_generated/dataModel";
import {
  internalMutation,
  type MutationCtx,
  mutation,
} from "./_generated/server";
import {
  DEFER,
  type Fixture,
  firstPass,
  ORDER,
  remap,
  type Table,
} from "./lib/ingest";
import { notYet } from "./lib/stub";
import { source } from "./lib/validators";

/** Schedules one connector action per source; writes SyncRuns with completeness (B-05). */
export const run = mutation({
  args: {
    companyId: v.id("companies"),
    cycleId: v.id("cycles"),
    sources: v.array(source),
  },
  handler: () => notYet("B-05"),
});

/** Connectors (and A's scripts, via `bunx convex run`) report a SyncRun: pulled vs expected. */
export const recordRun = internalMutation({
  args: {
    companyId: v.id("companies"),
    cycleId: v.union(v.id("cycles"), v.null()),
    source: v.union(
      v.literal("jobber"),
      v.literal("qbo"),
      v.literal("gusto"),
      v.literal("export"),
      v.literal("browser"),
    ),
    object: v.string(),
    startedAt: v.string(),
    finishedAt: v.union(v.string(), v.null()),
    pulled: v.number(),
    expected: v.union(v.number(), v.null()),
    method: v.string(),
    error: v.union(v.string(), v.null()),
  },
  handler: async (ctx, run) => {
    const id = await ctx.db.insert("syncRuns", {
      ...run,
      // Complete only when the source gave a total and we pulled exactly that many, with no error.
      complete:
        run.error === null &&
        run.expected !== null &&
        run.pulled === run.expected,
    });
    if (run.cycleId)
      await ctx.scheduler.runAfter(0, internal.controller.cycle.afterSync, {
        cycleId: run.cycleId,
      });
    return id;
  },
});

/**
 * Loads one company's fixture (data/fixtures/<co>/*.json, section 6 shapes with fixture ids) into Convex.
 * Public so seed scripts can call it over HTTP; refuses without INGEST_KEY. Validators run on every insert,
 * so a fixture that drifts from the contract fails loudly here. Returns fixture id → Convex id for companies,
 * workers and cycles only: every row would pass Convex's 1024-field limit on a real company.
 */
export const ingestFixture = mutation({
  args: {
    ingestKey: v.string(),
    fixture: v.record(v.string(), v.array(v.any())),
  },
  handler: async (ctx, { ingestKey, fixture }) => {
    if (!process.env.INGEST_KEY || ingestKey !== process.env.INGEST_KEY) {
      throw new ConvexError("bad ingest key");
    }
    const ids = await ingestRows(ctx, fixture as Fixture);
    const named = new Set(
      (["companies", "workers", "cycles"] as const).flatMap((t) =>
        (fixture[t] ?? []).map((r) => (r as { id: string }).id),
      ),
    );
    return Object.fromEntries(
      Object.entries(ids).filter(([id]) => named.has(id)),
    );
  },
});

/**
 * Inserts rows keyed by their own ids (fixture ids, or a snapshot's old Convex ids), remapping every
 * reference to the new Convex ids. Used by fixture ingest and by demo restore (controller/snapshot.ts).
 */
export async function ingestRows(
  ctx: MutationCtx,
  fixture: Fixture,
  /** Ids that already exist and keep their value (demo restore keeps the company and its workers). */
  seeded: Map<string, string> = new Map(),
): Promise<Record<string, string>> {
  const unknown = Object.keys(fixture).filter(
    (t) => !(ORDER as readonly string[]).includes(t),
  );
  if (unknown.length)
    throw new ConvexError(`unknown tables in fixture: ${unknown.join(", ")}`);

  const rows = fixture;
  const ids = seeded;
  for (const table of ORDER) {
    for (const row of rows[table] ?? []) {
      if (typeof row.id !== "string")
        throw new ConvexError(`${table}: every row needs a string id`);
      if (ids.has(row.id))
        throw new ConvexError(`duplicate fixture id ${row.id}`);
      const doc = remap(firstPass(table, row), ids) as never;
      ids.set(row.id, await ctx.db.insert(table as TableNames, doc));
    }
  }
  // Every id exists now: remap the full row and patch the top-level fields that held deferred paths.
  for (const [table, paths] of Object.entries(DEFER) as [Table, string[]][]) {
    for (const row of rows[table] ?? []) {
      const full = remap(row, ids) as Record<string, unknown>;
      const heads = [...new Set(paths.map((p) => p.split(".")[0]))].filter(
        (h) => h in full,
      );
      if (heads.length) {
        const patch = Object.fromEntries(heads.map((h) => [h, full[h]]));
        await ctx.db.patch(
          ids.get(row.id as string) as Id<TableNames>,
          patch as never,
        );
      }
    }
  }
  // The controller picks up every ingested cycle that is still open, as after a live sync.
  for (const row of rows.cycles ?? []) {
    if (row.stage !== "setup" && row.stage !== "syncing") continue;
    await ctx.scheduler.runAfter(0, internal.controller.cycle.afterSync, {
      cycleId: ids.get(row.id as string) as Id<"cycles">,
    });
  }
  return Object.fromEntries(ids);
}
