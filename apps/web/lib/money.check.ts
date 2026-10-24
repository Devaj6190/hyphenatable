// Run: bun apps/web/lib/money.check.ts
import assert from "node:assert/strict";
import { formatCents } from "./money";

assert.equal(formatCents(128450), "$1,284.50");
assert.equal(formatCents(5), "$0.05");
assert.equal(formatCents(0, true), "$0.00");
assert.equal(formatCents(-34425), "−$344.25");
assert.equal(formatCents(34425, true), "+$344.25");
assert.throws(() => formatCents(12.5), RangeError);
console.log("money ok");
