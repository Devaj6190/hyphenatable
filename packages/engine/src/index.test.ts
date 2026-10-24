import { expect, test } from "vitest";

test("engine package loads", async () => {
  expect(await import("./index")).toBeDefined();
});
