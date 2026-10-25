// B-16: snapshot and restore one company for demo.reset. A snapshot is the company's rows as a JSON file
// in Convex storage (found again through its `snapshot.taken` audit event); restore puts the company and
// its workers back in place (same ids, so the dashboard's links keep working) and re-ingests every other
// row through the fixture ingest. The audit log is never deleted: a reset is itself an audit event.
import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id, TableNames } from "../_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { write } from "../audit";
import { type Fixture, ORDER, type Table } from "../lib/ingest";
import { ingestRows } from "../sync";

/** Kept in place (replaced, not re-inserted) so ids the dashboard holds stay valid. */
const STABLE = ["companies", "workers"] as const;
/** Never copied or deleted: the log of what happened, including resets. */
const KEEP = new Set<Table>(["auditEvents", "accessEvents"]);

async function companyRows(
  ctx: QueryCtx,
  companyId: Id<"companies">,
  table: Table,
) {
  if (table === "companies") {
    const c = await ctx.db.get(companyId);
    return c ? [c] : [];
  }
  // ponytail: one cast over the table name; every contract table has a by_company index (schema-mirror test).
  return (await ctx.db
    .query(table as "workers")
    .withIndex("by_company", (q) => q.eq("companyId", companyId))
    .collect()) as unknown as Doc<TableNames>[];
}

export const dump = internalQuery({
  args: { companyId: v.id("companies") },
  handler: async (ctx, { companyId }) => {
    const out: Fixture = {};
    for (const table of ORDER) {
      if (KEEP.has(table)) continue;
      out[table] = (await companyRows(ctx, companyId, table)).map((doc) => {
        const { _id, _creationTime, ...rest } = doc as Doc<TableNames> &
          Record<string, unknown>;
        return { ...rest, id: _id };
      });
    }
    return out;
  },
});

export const take = internalAction({
  args: { companyId: v.id("companies"), label: v.string() },
  handler: async (ctx, { companyId, label }): Promise<string> => {
    const rows: Fixture = await ctx.runQuery(
      internal.controller.snapshot.dump,
      { companyId },
    );
    const storageId = await ctx.storage.store(
      new Blob([JSON.stringify(rows)], { type: "application/json" }),
    );
    await ctx.runMutation(internal.controller.snapshot.recordTaken, {
      companyId,
      label,
      storageId,
      counts: Object.fromEntries(
        Object.entries(rows).map(([t, r]) => [t, r?.length ?? 0]),
      ),
    });
    return storageId;
  },
});

export const recordTaken = internalMutation({
  args: {
    companyId: v.id("companies"),
    label: v.string(),
    storageId: v.id("_storage"),
    counts: v.record(v.string(), v.number()),
  },
  handler: (ctx, { companyId, label, storageId, counts }) =>
    write(ctx, {
      companyId,
      cycleId: null,
      actor: { kind: "system", id: "snapshot", agent: null },
      type: "snapshot.taken",
      summary: `Snapshot ${label} taken`,
      refs: { storageId },
      data: { label, storageId, counts },
    }),
});

/** The newest snapshot with this label, across companies. */
export const find = internalQuery({
  args: { label: v.string() },
  handler: async (ctx, { label }) => {
    for (const company of await ctx.db.query("companies").collect()) {
      const events = await ctx.db
        .query("auditEvents")
        .withIndex("by_company", (q) => q.eq("companyId", company._id))
        .order("desc")
        .collect();
      const hit = events.find(
        (e) => e.type === "snapshot.taken" && e.data?.label === label,
      );
      if (hit)
        return {
          companyId: company._id,
          storageId: hit.data.storageId as Id<"_storage">,
        };
    }
    return null;
  },
});

export const restore = internalAction({
  args: { label: v.string() },
  handler: async (
    ctx,
    { label },
  ): Promise<{ companyId: Id<"companies">; rows: number }> => {
    const snap: {
      companyId: Id<"companies">;
      storageId: Id<"_storage">;
    } | null = await ctx.runQuery(internal.controller.snapshot.find, { label });
    if (!snap) throw new ConvexError(`no snapshot labelled ${label}`);
    const blob = await ctx.storage.get(snap.storageId);
    if (!blob)
      throw new ConvexError(`snapshot ${label} is missing from storage`);
    const fixture = JSON.parse(await blob.text()) as Fixture;
    await ctx.runMutation(internal.controller.snapshot.replace, {
      companyId: snap.companyId,
      label,
      fixture,
    });
    return {
      companyId: snap.companyId,
      rows: Object.values(fixture).reduce((s, r) => s + (r?.length ?? 0), 0),
    };
  },
});

export const replace = internalMutation({
  args: {
    companyId: v.id("companies"),
    label: v.string(),
    fixture: v.record(v.string(), v.array(v.any())),
  },
  handler: async (ctx, { companyId, label, fixture }) => {
    const rows = fixture as Fixture;
    for (const table of [...ORDER].reverse()) {
      if (KEEP.has(table) || (STABLE as readonly string[]).includes(table))
        continue;
      for (const doc of await companyRows(ctx, companyId, table))
        await ctx.db.delete(doc._id);
    }
    for (const run of await ctx.db
      .query("creaoRuns")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .collect())
      await ctx.db.delete(run._id);
    await putBack(ctx, rows);
    const rest: Fixture = { ...rows, companies: [], workers: [] };
    const seeded = new Map<string, string>();
    for (const t of STABLE)
      for (const r of rows[t] ?? []) seeded.set(r.id as string, r.id as string);
    await ingestRows(ctx, rest, seeded);
    await write(ctx, {
      companyId,
      cycleId: null,
      actor: { kind: "system", id: "demo.reset", agent: null },
      type: "demo.reset",
      summary: `Company restored to snapshot ${label}`,
      refs: {},
      data: { label },
    });
  },
});

/** The company and its workers go back to their snapshot values under the same ids. */
async function putBack(ctx: MutationCtx, rows: Fixture) {
  for (const t of STABLE)
    for (const { id, ...doc } of rows[t] ?? []) {
      const key = ctx.db.normalizeId(t, id as string);
      if (!key) throw new ConvexError(`${t} ${String(id)} no longer exists`);
      await ctx.db.replace(key, doc as never);
    }
}
