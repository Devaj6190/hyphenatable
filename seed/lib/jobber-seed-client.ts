// Write-capable Jobber client for the SEED app only ("PayrollPilot Seed"), separate from the read app's
// client in packages/connectors (which refuses mutations). Own env vars, own token file, own refresh token.
// Talks only to api.getjobber.com. Never logs token values.

import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const JOBBER_GRAPHQL_URL = "https://api.getjobber.com/api/graphql";
export const JOBBER_TOKEN_URL = "https://api.getjobber.com/api/oauth/token";
export const JOBBER_AUTHORIZE_URL = "https://api.getjobber.com/api/oauth/authorize";
export const JOBBER_GRAPHQL_VERSION = "2026-09-25";
/** Saved as the seed app's callback in the Developer Center; Jobber rejects localhost without one. The page need not handle the code: the person pastes the address back. */
export const DEFAULT_REDIRECT_URI = "https://payrollpilot.vercel.app/auth";

export const PRIVATE_DIR = join(import.meta.dir, "..", "..", "data", "private");
export const SEED_TOKEN_PATH = join(PRIVATE_DIR, "jobber-seed-tokens.json");
export const SEED_PKCE_PATH = join(PRIVATE_DIR, "jobber-seed-pkce.json");

type Tokens = { accessToken: string | null; accessTokenExpiresAt: number | null; refreshToken: string };

export function writePrivateJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2), { mode: 0o600 });
  renameSync(tmp, path);
}

export function readJsonOrNull<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

export function seedAuthFromEnv(env: Record<string, string | undefined> = process.env) {
  const clientId = env.JOBBER_SEED_CLIENT_ID;
  const clientSecret = env.JOBBER_SEED_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("JOBBER_SEED_CLIENT_ID and JOBBER_SEED_CLIENT_SECRET must be set (seed app, not the read app)");
  return { clientId, clientSecret };
}

// ---------------------------------------------------------------- one-time authorization (a person opens the URL)

const b64url = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function authorizeUrl(clientId: string, redirectUri = DEFAULT_REDIRECT_URI): string {
  const state = b64url(randomBytes(16));
  const codeVerifier = b64url(randomBytes(32));
  writePrivateJson(SEED_PKCE_PATH, { state, codeVerifier, redirectUri });
  const q = new URLSearchParams({
    response_type: "code", client_id: clientId, redirect_uri: redirectUri, state,
    code_challenge: b64url(createHash("sha256").update(codeVerifier).digest()), code_challenge_method: "S256",
  });
  return `${JOBBER_AUTHORIZE_URL}?${q}`;
}

/**
 * Takes the full address the browser landed on after approving (the callback page need not do anything),
 * checks it is our redirect URI and that `state` matches the one auth-url saved, and returns the code.
 * A bare code is refused: without the address the state cannot be checked.
 */
export function codeFromRedirect(pasted: string, pkce: { state: string; redirectUri: string }): string {
  let url: URL;
  try {
    url = new URL(pasted.trim());
  } catch {
    throw new Error("paste the full address from the browser bar (https://...?code=...&state=...), not just the code");
  }
  const expected = new URL(pkce.redirectUri);
  if (url.origin !== expected.origin || url.pathname !== expected.pathname) throw new Error(`address is not the seed app's redirect (${pkce.redirectUri})`);
  const err = url.searchParams.get("error");
  if (err) throw new Error(`Jobber returned error=${err}${url.searchParams.get("error_description") ? `: ${url.searchParams.get("error_description")}` : ""}`);
  if (url.searchParams.get("state") !== pkce.state) throw new Error("state does not match the last auth-url; run auth-url again and use that link");
  const code = url.searchParams.get("code");
  if (!code) throw new Error("address has no code parameter");
  return code;
}

export async function exchangeCode(auth: { clientId: string; clientSecret: string }, pastedAddress: string, fetchImpl: typeof fetch = fetch) {
  const pkce = readJsonOrNull<{ state: string; codeVerifier: string; redirectUri: string }>(SEED_PKCE_PATH);
  if (!pkce) throw new Error("run `auth-url` first");
  const code = codeFromRedirect(pastedAddress, pkce);
  const res = await fetchImpl(JOBBER_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ grant_type: "authorization_code", client_id: auth.clientId, client_secret: auth.clientSecret, code, redirect_uri: pkce.redirectUri, code_verifier: pkce.codeVerifier }),
  });
  if (!res.ok) throw new Error(`code exchange failed: HTTP ${res.status}`);
  const j = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!j.access_token || !j.refresh_token) throw new Error("code exchange returned no tokens");
  writePrivateJson(SEED_TOKEN_PATH, { accessToken: j.access_token, accessTokenExpiresAt: Date.now() + (j.expires_in ?? 3600) * 1000, refreshToken: j.refresh_token } satisfies Tokens);
}

// ---------------------------------------------------------------- client

export type GqlResult = { data: Record<string, unknown> | null; errors: { message: string; extensions?: { code?: string } }[] };

export class SeedClient {
  private tokens: Tokens;
  constructor(
    private auth: { clientId: string; clientSecret: string },
    private fetchImpl: typeof fetch = fetch,
    private sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
    private log: (s: string) => void = console.log,
  ) {
    const t = readJsonOrNull<Tokens>(SEED_TOKEN_PATH);
    if (!t) throw new Error(`no seed token at ${SEED_TOKEN_PATH}; run \`bun run seed/push-jobber.ts auth-url\` then \`auth-code <code>\``);
    this.tokens = t;
  }

  private async refresh() {
    const res = await this.fetchImpl(JOBBER_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ grant_type: "refresh_token", client_id: this.auth.clientId, client_secret: this.auth.clientSecret, refresh_token: this.tokens.refreshToken }),
    });
    if (!res.ok) throw new Error(`token refresh failed: HTTP ${res.status} (re-run auth-url / auth-code)`);
    const j = (await res.json()) as { access_token: string; refresh_token?: string; expires_in?: number };
    // rotation: the old refresh token is dead as soon as this returns, so save before anything else
    this.tokens = { accessToken: j.access_token, accessTokenExpiresAt: Date.now() + (j.expires_in ?? 3600) * 1000, refreshToken: j.refresh_token ?? this.tokens.refreshToken };
    writePrivateJson(SEED_TOKEN_PATH, this.tokens);
  }

  async gql(query: string, variables: Record<string, unknown> = {}): Promise<GqlResult> {
    for (let attempt = 1; attempt <= 6; attempt++) {
      if (!this.tokens.accessToken || !this.tokens.accessTokenExpiresAt || this.tokens.accessTokenExpiresAt - 60_000 < Date.now()) await this.refresh();
      const res = await this.fetchImpl(JOBBER_GRAPHQL_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.tokens.accessToken}`, "X-JOBBER-GRAPHQL-VERSION": JOBBER_GRAPHQL_VERSION, "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables }),
      });
      if (res.status === 401 && attempt === 1) {
        this.tokens.accessToken = null;
        continue;
      }
      if (res.status === 429 || res.status >= 500) {
        await this.sleep(5000 * attempt);
        continue;
      }
      if (!res.ok) throw new Error(`Jobber HTTP ${res.status}`);
      const j = (await res.json()) as GqlResult & { extensions?: { cost?: { throttleStatus?: { currentlyAvailable: number } } } };
      const available = j.extensions?.cost?.throttleStatus?.currentlyAvailable;
      if (j.errors?.some((e) => e.extensions?.code === "THROTTLED")) {
        await this.sleep(Math.max(2000, ((2000 - (available ?? 0)) / 500) * 1000));
        continue;
      }
      if (available !== undefined && available < 1500) {
        const ms = ((2000 - available) / 500) * 1000;
        this.log(`  (throttle: ${available} points left, sleeping ${Math.round(ms)} ms)`);
        await this.sleep(ms);
      }
      return { data: j.data ?? null, errors: j.errors ?? [] };
    }
    throw new Error("Jobber request failed after retries");
  }
}
