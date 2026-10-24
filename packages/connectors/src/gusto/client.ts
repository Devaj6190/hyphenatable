// Gusto demo API client. READ-ONLY: GET only, on https://api.gusto-demo.com only. The one POST is the
// OAuth token endpoint. B owns the draft writer (gusto/write*); nothing here can prepare, update or submit.
// Refresh tokens rotate; stored in data/private/gusto-token.json. Never logs token values.

import {
  fileTokenStore,
  privatePath,
  type StoredTokens,
  type TokenStore,
  tokenFresh,
} from "../tokens.ts";

export const GUSTO_BASE = "https://api.gusto-demo.com";
export const GUSTO_API_VERSION = "2026-06-15";
export const GUSTO_TOKEN_URL = `${GUSTO_BASE}/oauth/token`;
export const GUSTO_AUTHORIZE_URL = `${GUSTO_BASE}/oauth/authorize`;
/** Registered on the Gusto application "PayrollPilot Demo". */
export const GUSTO_REDIRECT_URI = "http://localhost:3000/auth/gusto";
export const GUSTO_TOKEN_PATH = privatePath("gusto-token.json");
export const GUSTO_PER_PAGE = 100;
const MAX_ATTEMPTS = 5;

export interface GustoAuth {
  clientId: string;
  clientSecret: string;
  redirectUri?: string;
  tokenStore?: TokenStore;
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
  log?: (line: string) => void;
}

/** Reads GUSTO_CLIENT_ID / GUSTO_CLIENT_SECRET (shared-context section 16). */
export function gustoAuthFromEnv(
  env: Record<string, string | undefined> = process.env,
): GustoAuth {
  const { GUSTO_CLIENT_ID: clientId, GUSTO_CLIENT_SECRET: clientSecret } = env;
  if (!clientId || !clientSecret)
    throw new Error("GUSTO_CLIENT_ID and GUSTO_CLIENT_SECRET must be set");
  return { clientId, clientSecret };
}

export class GustoError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = "GustoError";
  }
}

type TokenJson = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
};

/** POST /oauth/token (the only non-GET call). grant: authorization_code or refresh_token. */
export async function gustoTokenRequest(
  auth: GustoAuth,
  grant:
    | { grant_type: "authorization_code"; code: string }
    | { grant_type: "refresh_token"; refresh_token: string },
): Promise<StoredTokens> {
  const res = await (auth.fetchImpl ?? fetch)(GUSTO_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: auth.clientId,
      client_secret: auth.clientSecret,
      redirect_uri: auth.redirectUri ?? GUSTO_REDIRECT_URI,
      ...grant,
    }),
  });
  if (!res.ok)
    throw new GustoError(
      `Gusto token request (${grant.grant_type}) failed: HTTP ${res.status}`,
      res.status,
    );
  const json = (await res.json()) as TokenJson;
  if (!json.access_token || !json.refresh_token)
    throw new GustoError("Gusto token response had no tokens", res.status);
  return {
    accessToken: json.access_token,
    accessTokenExpiresAt: Date.now() + (json.expires_in ?? 7200) * 1000,
    refreshToken: json.refresh_token,
  };
}

/** Build a GET URL on the demo host; anything that would leave it is refused. */
export function gustoUrl(
  path: string,
  query: Record<string, string | number | undefined> = {},
): string {
  const url = new URL(path, GUSTO_BASE);
  if (url.origin !== GUSTO_BASE)
    throw new GustoError(
      `Refusing host ${url.origin}: only ${GUSTO_BASE} is allowed`,
      null,
    );
  for (const [k, v] of Object.entries(query))
    if (v !== undefined) url.searchParams.set(k, String(v));
  return url.toString();
}

export class GustoClient {
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly store: TokenStore;
  private readonly log: (line: string) => void;
  private tokens: StoredTokens | null = null;
  private refreshing: Promise<StoredTokens> | null = null;
  requests = 0;

  constructor(private readonly auth: GustoAuth) {
    this.fetchImpl = auth.fetchImpl ?? fetch;
    this.sleep =
      auth.sleepImpl ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.store = auth.tokenStore ?? fileTokenStore(GUSTO_TOKEN_PATH);
    this.log = auth.log ?? (() => {});
  }

  /** One in-flight refresh; the rotated refresh token is saved before use. */
  refresh(): Promise<StoredTokens> {
    this.refreshing ??= (async () => {
      if (!this.tokens) this.tokens = await this.store.load();
      const current = this.tokens;
      if (!current)
        throw new GustoError(
          "No Gusto token stored. Run `gusto/cli.ts auth` once (needs a browser).",
          null,
        );
      const next = await gustoTokenRequest(this.auth, {
        grant_type: "refresh_token",
        refresh_token: current.refreshToken,
      });
      await this.store.save(next);
      this.tokens = next;
      this.log("gusto: access token refreshed");
      return next;
    })().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async accessToken(): Promise<string> {
    this.tokens ??= await this.store.load();
    if (this.tokens && tokenFresh(this.tokens)) return this.tokens.accessToken;
    return (await this.refresh()).accessToken as string;
  }

  /** GET with JSON body + headers. 401 -> one refresh; 429 -> Retry-After; 5xx -> back off. */
  async get<T>(
    path: string,
    query: Record<string, string | number | undefined> = {},
  ): Promise<{ body: T; headers: Headers }> {
    const url = gustoUrl(path, query);
    let refreshed = false;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const token = await this.accessToken();
      this.requests++;
      const res = await this.fetchImpl(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Gusto-API-Version": GUSTO_API_VERSION,
          Accept: "application/json",
        },
      });
      if (res.status === 401 && !refreshed) {
        refreshed = true;
        await this.refresh();
        continue;
      }
      if (res.status === 429 || res.status >= 500) {
        const waitSec = Number(res.headers.get("retry-after")) || 2 ** attempt;
        this.log(`gusto: HTTP ${res.status}, retrying in ${waitSec}s`);
        await this.sleep(waitSec * 1000);
        continue;
      }
      if (!res.ok)
        throw new GustoError(
          `Gusto GET ${new URL(url).pathname} failed: HTTP ${res.status}`,
          res.status,
        );
      return { body: (await res.json()) as T, headers: res.headers };
    }
    throw new GustoError(
      `Gusto request failed after ${MAX_ATTEMPTS} attempts`,
      null,
    );
  }

  /** page/per pagination until a short page. X-Total-Count, when Gusto sends it, is the expected count. */
  async getAll<T>(
    path: string,
    query: Record<string, string | number | undefined> = {},
  ): Promise<{ rows: T[]; totalCount: number | null }> {
    const rows: T[] = [];
    let totalCount: number | null = null;
    let previous = "";
    for (let page = 1; ; page++) {
      const { body, headers } = await this.get<T[]>(path, {
        ...query,
        page,
        per: GUSTO_PER_PAGE,
      });
      if (!Array.isArray(body))
        throw new GustoError(`Gusto GET ${path} did not return a list`, null);
      // An endpoint that ignores `page` would repeat itself forever: fail instead of looping or double counting.
      const signature = JSON.stringify(body);
      if (page > 1 && body.length > 0 && signature === previous)
        throw new GustoError(`Gusto GET ${path} ignored page=${page}`, null);
      previous = signature;
      const header = headers.get("x-total-count");
      if (header !== null && totalCount === null) totalCount = Number(header);
      rows.push(...body);
      if (body.length < GUSTO_PER_PAGE) break;
    }
    return { rows, totalCount };
  }
}
