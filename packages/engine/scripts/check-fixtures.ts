// Parses data/fixtures/<co>/*.json with the contract and prints every mismatch. Exit 1 on any.
//   bun run packages/engine/scripts/check-fixtures.ts data/fixtures/a
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { z } from "zod";
import * as s from "../src/schemas";

const FILES: Record<string, z.ZodType> = {
  "company.json": s.Company,
  "workers.json": s.Worker,
  "cycles.json": s.Cycle,
  "syncRuns.json": s.SyncRun,
  "timeEntries.json": s.TimeEntry,
  "jobs.json": s.Job,
  "visits.json": s.Visit,
  "quotes.json": s.Quote,
  "invoices.json": s.Invoice,
  "payments.json": s.Payment,
  "expenses.json": s.Expense,
  "rules.json": s.Rule,
  "questions.json": s.Question,
  "pastPayrolls.json": s.PastPayroll,
};

const dir = process.argv[2] ?? "data/fixtures/a";
let bad = 0;
for (const file of readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .sort()) {
  const schema = FILES[file];
  if (!schema) {
    console.log(`skip  ${file} (not a section 6 table)`);
    continue;
  }
  const raw = JSON.parse(readFileSync(join(dir, file), "utf8"));
  const rows: unknown[] = Array.isArray(raw) ? raw : [raw];
  const issues = new Map<string, number>();
  for (const row of rows) {
    const r = (schema as z.ZodObject).strict().safeParse(row);
    if (!r.success)
      for (const i of r.error.issues) {
        const k = `${i.path.join(".")}: ${i.message}`;
        issues.set(k, (issues.get(k) ?? 0) + 1);
      }
  }
  bad += issues.size;
  console.log(
    `${issues.size ? "FAIL" : "ok  "}  ${file} (${rows.length} rows)`,
  );
  for (const [k, n] of issues) console.log(`        ${k}  x${n}`);
}
process.exit(bad ? 1 : 0);
