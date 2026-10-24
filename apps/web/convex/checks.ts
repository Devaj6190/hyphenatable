import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { notYet } from "./lib/stub";

export const run = mutation({
  args: { cycleId: v.id("cycles") },
  handler: () => notYet("B-06"),
});
