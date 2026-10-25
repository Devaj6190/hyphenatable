import { describe, expect, test } from "vitest";
import { errorReason } from "./errors";

describe("errorReason", () => {
  test("picks the reason over the generic Server Error line", () => {
    expect(
      errorReason(
        "[CONVEX Q(roster:list)] [Request ID: 894fb10a442fdd6b] Server Error\nCould not find public function for 'roster:list'.\n\n  Called by client",
      ),
    ).toBe("Could not find public function for 'roster:list'.");
  });
  test("keeps Server Error when that is all there is (production builds)", () => {
    expect(
      errorReason("[CONVEX Q(flags:list)] [Request ID: abc] Server Error"),
    ).toBe("Server Error");
  });
  test("a ConvexError message passes through", () => {
    expect(errorReason("unknown viewer for this company")).toBe(
      "unknown viewer for this company",
    );
  });
  test("an empty message is not blank", () => {
    expect(errorReason("")).toBe("unknown error");
  });
});
