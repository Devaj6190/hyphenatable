import { expect, test } from "vitest";

test("connectors package loads", async () => {
  expect(await import("./index")).toBeDefined();
});
