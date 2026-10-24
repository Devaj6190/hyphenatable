// One-time authorization-code exchange that produces the first refresh token (the app's own OAuth,
// not GraphiQL: GraphiQL invalidates the app's refresh tokens). Needs a browser, run by a person.

import { createHash, randomBytes } from "node:crypto";
import {
  JOBBER_AUTHORIZE_URL,
  JOBBER_TOKEN_URL,
  type StoredTokens,
} from "./client.ts";

/**
 * The callback saved on the read app in the Developer Center (Jobber refused localhost until a real one was
 * saved). The page there just lands; the person pastes its full address back into `cli.ts auth --paste`.
 */
export const DEFAULT_REDIRECT_URI = "https://payrollpilot.vercel.app/auth";

/** Pending authorization (state + PKCE verifier) between printing the URL and pasting the redirect. */
export interface PendingAuth {
  state: string;
  codeVerifier: string;
  redirectUri: string;
  createdAt: string;
}

/** Jobber auth codes live 10 minutes; an older pending file is useless. */
export const PENDING_MAX_AGE_MS = 10 * 60 * 1000;

/** Code from a pasted redirect address (full URL or bare query string); the state must match the pending one. */
export function codeFromPastedRedirect(
  pasted: string,
  pending: PendingAuth,
  nowMs = Date.now(),
): string {
  const s = pasted.trim();
  if (!s) throw new Error("nothing pasted");
  if (nowMs - Date.parse(pending.createdAt) > PENDING_MAX_AGE_MS)
    throw new Error(
      "pending authorization is older than 10 minutes; run auth --paste again",
    );
  const q = new URL(
    s.includes("://")
      ? s
      : `${pending.redirectUri}${s.startsWith("?") ? "" : "?"}${s}`,
  ).searchParams;
  if (q.get("error"))
    throw new Error(`Jobber returned an error: ${q.get("error")}`);
  if (q.get("state") !== pending.state)
    throw new Error(
      "state mismatch: this redirect is not from the pending authorization",
    );
  const code = q.get("code");
  if (!code) throw new Error("pasted address has no code");
  return code;
}

const b64url = (buf: Buffer) =>
  buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

export interface AuthorizeRequest {
  url: string;
  state: string;
  codeVerifier: string;
}

export function buildAuthorizeUrl(
  clientId: string,
  redirectUri = DEFAULT_REDIRECT_URI,
): AuthorizeRequest {
  const state = b64url(randomBytes(16));
  const codeVerifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(codeVerifier).digest());
  const q = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return { url: `${JOBBER_AUTHORIZE_URL}?${q}`, state, codeVerifier };
}

export async function exchangeCode(
  args: {
    clientId: string;
    clientSecret: string;
    code: string;
    codeVerifier: string;
    redirectUri?: string;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<StoredTokens> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: args.clientId,
    client_secret: args.clientSecret,
    code: args.code,
    redirect_uri: args.redirectUri ?? DEFAULT_REDIRECT_URI,
    code_verifier: args.codeVerifier,
  });
  const res = await fetchImpl(JOBBER_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });
  if (!res.ok)
    throw new Error(`Jobber code exchange failed: HTTP ${res.status}`);
  const json = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!json.access_token || !json.refresh_token)
    throw new Error("Jobber code exchange returned no tokens");
  return {
    accessToken: json.access_token,
    accessTokenExpiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
    refreshToken: json.refresh_token,
  };
}
