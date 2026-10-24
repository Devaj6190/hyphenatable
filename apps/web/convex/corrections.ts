import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { notYet } from "./lib/stub";
import { userId } from "./lib/validators";

export const approve = mutation({
  args: { correctionId: v.id("corrections"), userId },
  handler: () => notYet("B-10"),
});

export const reject = mutation({
  args: { correctionId: v.id("corrections"), userId, reason: v.string() },
  handler: () => notYet("B-10"),
});
