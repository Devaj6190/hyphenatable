import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// B-01 probe tables (H5, H7). B-02 adds the section 6 contract tables.
export default defineSchema({
  ping: defineTable({ note: v.string(), at: v.string() }),
  probeVectors: defineTable({
    companyId: v.string(),
    text: v.string(),
    embedding: v.array(v.float64()),
  }).vectorIndex("by_embedding", {
    vectorField: "embedding",
    dimensions: 1024,
    filterFields: ["companyId"],
  }),
});
