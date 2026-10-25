// The Convex schema must mirror the zod contract field for field, enum value for enum value.
// Both sides are reduced to one canonical string; Convex ids count as strings, zod's `id` is Convex's `_id`.
import * as zs from "@payrollpilot/engine/schemas";
import type { GenericValidator } from "convex/values";
import { describe, expect, test } from "vitest";
import type { z } from "zod";
import schema from "../convex/schema";

const MIRRORS: Record<string, z.ZodObject> = {
  companies: zs.Company,
  workers: zs.Worker,
  cycles: zs.Cycle,
  syncRuns: zs.SyncRun,
  timeEntries: zs.TimeEntry,
  jobs: zs.Job,
  visits: zs.Visit,
  quotes: zs.Quote,
  invoices: zs.Invoice,
  payments: zs.Payment,
  expenses: zs.Expense,
  flags: zs.Flag,
  questions: zs.Question,
  messages: zs.Message,
  interpretations: zs.Interpretation,
  corrections: zs.Correction,
  rules: zs.Rule,
  lessons: zs.Lesson,
  drafts: zs.Draft,
  pastPayrolls: zs.PastPayroll,
  auditEvents: zs.AuditEvent,
  accessEvents: zs.AccessEvent,
  creaoRuns: zs.CreaoRun,
};

/** Union members: literals merge into one enum(...), the rest sort, so member order never matters. */
function union(members: string[]): string {
  const lits = members.flatMap((m) =>
    m.startsWith("enum(") ? m.slice(5, -1).split("|") : [],
  );
  const rest = [
    ...new Set(members.filter((m) => !m.startsWith("enum("))),
  ].sort();
  return [
    ...(lits.length ? [`enum(${[...new Set(lits)].sort().join("|")})`] : []),
    ...rest,
  ].join(" | ");
}
const obj = (entries: [string, string][]) =>
  `{${entries
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, c]) => `${k}: ${c}`)
    .join(", ")}}`;

// biome-ignore lint/suspicious/noExplicitAny: walking zod's internal def tree
function zodMembers(s: any): string[] {
  const def = s._zod.def;
  if (def.type === "nullable") return [...zodMembers(def.innerType), "null"];
  if (def.type === "union") return def.options.flatMap(zodMembers);
  return [fromZod(s)];
}

// biome-ignore lint/suspicious/noExplicitAny: walking Convex's validator tree
function convexMembers(c: any): string[] {
  return c.kind === "union"
    ? c.members.flatMap(convexMembers)
    : [fromConvex(c)];
}

// biome-ignore lint/suspicious/noExplicitAny: walking zod's internal def tree
function fromZod(s: any): string {
  const def = s._zod.def;
  switch (def.type) {
    case "string":
      return "string";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "null":
      return "null";
    case "unknown":
    case "any":
      return "any";
    case "enum":
      return `enum(${Object.values(def.entries).map(String).sort().join("|")})`;
    case "literal":
      return `enum(${def.values.map(String).sort().join("|")})`;
    case "nullable":
    case "union":
      return union(zodMembers(s));
    case "array":
      return `array<${fromZod(def.element)}>`;
    case "record":
      return `record<${fromZod(def.valueType)}>`;
    case "object":
      return obj(Object.entries(def.shape).map(([k, v]) => [k, fromZod(v)]));
    default:
      throw new Error(`unhandled zod type ${def.type}`);
  }
}

// biome-ignore lint/suspicious/noExplicitAny: walking Convex's validator tree
function fromConvex(c: any): string {
  switch (c.kind) {
    case "id":
    case "string":
      return "string";
    case "float64":
    case "int64":
      return "number";
    case "boolean":
      return "boolean";
    case "null":
      return "null";
    case "any":
      return "any";
    case "literal":
      return `enum(${String(c.value)})`;
    case "union":
      return union(convexMembers(c));
    case "array":
      return `array<${fromConvex(c.element)}>`;
    case "record":
      return `record<${fromConvex(c.value)}>`;
    case "object":
      return obj(Object.entries(c.fields).map(([k, v]) => [k, fromConvex(v)]));
    default:
      throw new Error(`unhandled convex kind ${c.kind}`);
  }
}

describe("convex/schema.ts mirrors packages/engine/src/schemas.ts", () => {
  for (const [table, record] of Object.entries(MIRRORS)) {
    test(table, () => {
      const { id: _id, ...shape } = record.shape;
      const validator = (
        schema.tables as Record<string, { validator: GenericValidator }>
      )[table]?.validator;
      expect(validator, `table ${table} missing`).toBeDefined();
      expect(fromConvex(validator)).toBe(
        fromZod({ _zod: { def: { type: "object", shape } } }),
      );
    });
  }

  test("every contract table has a by_company index (companies is the company itself)", () => {
    for (const table of Object.keys(MIRRORS).filter((t) => t !== "companies")) {
      // biome-ignore lint/suspicious/noExplicitAny: reading index definitions
      const indexes = (schema.tables as any)[table].indexes as {
        indexDescriptor: string;
      }[];
      expect(
        indexes.map((i) => i.indexDescriptor),
        table,
      ).toContain("by_company");
    }
  });
});
