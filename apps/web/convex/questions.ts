import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { notYet } from "./lib/stub";
import { userId } from "./lib/validators";

export const approve = mutation({
  args: {
    questionId: v.id("questions"),
    userId,
    editedText: v.optional(v.string()),
  },
  handler: () => notYet("B-08"),
});

export const deny = mutation({
  args: { questionId: v.id("questions"), userId, reason: v.string() },
  handler: () => notYet("B-08"),
});

export const edit = mutation({
  args: {
    questionId: v.id("questions"),
    userId,
    text: v.string(),
    options: v.optional(v.union(v.array(v.string()), v.null())),
  },
  handler: () => notYet("B-08"),
});
