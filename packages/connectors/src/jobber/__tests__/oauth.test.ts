import { describe, expect, it } from "vitest";
import { buildAuthorizeUrl, codeFromPastedRedirect, DEFAULT_REDIRECT_URI, type PendingAuth } from "../oauth.ts";

const pending: PendingAuth = { state: "st8", codeVerifier: "v", redirectUri: DEFAULT_REDIRECT_URI, createdAt: "2026-10-24T09:00:00Z" };
const at = Date.parse("2026-10-24T09:05:00Z");

describe("paste-mode OAuth", () => {
  it("defaults to the hosted callback saved on the read app", () => {
    expect(DEFAULT_REDIRECT_URI).toBe("https://payrollpilot.vercel.app/auth");
    const u = new URL(buildAuthorizeUrl("cid").url);
    expect(u.searchParams.get("redirect_uri")).toBe("https://payrollpilot.vercel.app/auth");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("takes the code from a full pasted address or a bare query string", () => {
    expect(codeFromPastedRedirect("  https://payrollpilot.vercel.app/auth?code=abc&state=st8 \n", pending, at)).toBe("abc");
    expect(codeFromPastedRedirect("?code=abc&state=st8", pending, at)).toBe("abc");
    expect(codeFromPastedRedirect("code=abc&state=st8", pending, at)).toBe("abc");
  });

  it("refuses a wrong state, an error redirect, no code, or a stale pending file", () => {
    expect(() => codeFromPastedRedirect("https://x/auth?code=abc&state=other", pending, at)).toThrow(/state mismatch/);
    expect(() => codeFromPastedRedirect("https://x/auth?error=access_denied&state=st8", pending, at)).toThrow(/access_denied/);
    expect(() => codeFromPastedRedirect("https://x/auth?state=st8", pending, at)).toThrow(/no code/);
    expect(() => codeFromPastedRedirect("https://x/auth?code=abc&state=st8", pending, Date.parse("2026-10-24T09:11:00Z"))).toThrow(/older than 10 minutes/);
    expect(() => codeFromPastedRedirect("   ", pending, at)).toThrow(/nothing pasted/);
  });
});
