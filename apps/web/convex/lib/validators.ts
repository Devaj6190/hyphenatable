import { v } from "convex/values";

/** A person acting in the UI. Agents and the system can never approve (plan B 4.1). */
export const userId = v.string();
export const stage = v.union(v.literal(1), v.literal(2));
export const source = v.union(
  v.literal("jobber"),
  v.literal("qbo"),
  v.literal("gusto"),
);
