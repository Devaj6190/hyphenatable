// One-time authorization-code exchange that produces the first refresh token (the app's own OAuth,
// not GraphiQL: GraphiQL invalidates the app's refresh tokens). Needs a browser, run by a person.

import { createHash, randomBytes } from "node:crypto";
import { JOBBER_AUTHORIZE_URL, JOBBER_TOKEN_URL, type StoredTokens } from "./client.ts";

/** Jobber's own template repo uses this redirect; it must match the app's Developer Center setting. */
export const DEFAULT_REDIRECT_URI = "http://localhost:3000/auth";

const b64url = (buf: Buffer) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export interface AuthorizeRequest {
  url: string;
  state: string;
  codeVerifier: string;
}

export function buildAuthorizeUrl(clientId: string, redirectUri = DEFAULT_REDIRECT_URI): AuthorizeRequest {
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
  args: { clientId: string; clientSecret: string; code: string; codeVerifier: string; redirectUri?: string },
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
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  if (!res.ok) throw new Error(`Jobber code exchange failed: HTTP ${res.status}`);
  const json = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!json.access_token || !json.refresh_token) throw new Error("Jobber code exchange returned no tokens");
  return {
    accessToken: json.access_token,
    accessTokenExpiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
    refreshToken: json.refresh_token,
  };
}
