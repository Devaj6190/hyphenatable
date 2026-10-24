// QuickBooks Online REST v3 client (sandbox). READ-ONLY: the only call is GET /query with a SELECT.
// Tokens: intuit-oauth refreshes (refresh token rotates); stored in data/private/qbo-token.json.
// Never logs token values (intuit-oauth logging stays off: it would log token JSON).

import {
  fileTokenStore,
  privatePath,
  type StoredTokens,
  type TokenStore,
  tokenFresh,
} from "../tokens.ts";

export const QBO_SANDBOX_BASE = "https://sandbox-quickbooks.api.intuit.com/v3";
/** Intuit requires minorversion 75+ since 2025. */
export const QBO_MINOR_VERSION = "75";
export const QBO_TOKEN_PATH = privatePath("qbo-token.json");
const MAX_ATTEMPTS = 5;

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
  expiresInSec: number;
}
export type Refresher = (refreshToken: string) => Promise<RefreshResult>;

/** Token refresh through the official intuit-oauth SDK (loaded lazily so tests never pull in axios). */
export function intuitRefresher(
  clientId: string,
  clientSecret: string,
): Refresher {
  return async (refreshToken) => {
    const { default: OAuthClient } = await import("intuit-oauth");
    // redirectUri is required by the constructor but unused for a refresh.
    const oc = new OAuthClient({
      environment: "sandbox",
      clientId,
      clientSecret,
      redirectUri: "http://localhost:3000/qbo/callback",
      logging: false,
    });
    const json = (await oc.refreshUsingToken(refreshToken)).getJson() as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };
    if (!json?.access_token || !json.refresh_token)
      throw new Error("QBO token refresh returned no tokens");
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresInSec: json.expires_in ?? 3600,
    };
  };
}

export interface QboAuth {
  clientId: string;
  clientSecret: string;
  realmId: string;
  baseUrl?: string;
  tokenStore?: TokenStore;
  refresher?: Refresher;
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
  log?: (line: string) => void;
}

/** Reads QBO_CLIENT_ID, QBO_CLIENT_SECRET, QBO_REALM_ID (shared-context section 16). */
export function qboAuthFromEnv(
  env: Record<string, string | undefined> = process.env,
): QboAuth {
  const {
    QBO_CLIENT_ID: clientId,
    QBO_CLIENT_SECRET: clientSecret,
    QBO_REALM_ID: realmId,
  } = env;
  if (!clientId || !clientSecret || !realmId)
    throw new Error(
      "QBO_CLIENT_ID, QBO_CLIENT_SECRET and QBO_REALM_ID must be set",
    );
  return { clientId, clientSecret, realmId };
}

export class QboError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = "QboError";
  }
}

export type QueryResponse = {
  QueryResponse: Record<string, unknown> & {
    totalCount?: number;
    startPosition?: number;
    maxResults?: number;
  };
};

export class QboClient {
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly store: TokenStore;
  private readonly refresher: Refresher;
  private readonly log: (line: string) => void;
  private tokens: StoredTokens | null = null;
  private refreshing: Promise<StoredTokens> | null = null;
  requests = 0;

  constructor(private readonly auth: QboAuth) {
    this.fetchImpl = auth.fetchImpl ?? fetch;
    this.sleep =
      auth.sleepImpl ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.store = auth.tokenStore ?? fileTokenStore(QBO_TOKEN_PATH);
    this.refresher =
      auth.refresher ?? intuitRefresher(auth.clientId, auth.clientSecret);
    this.log = auth.log ?? (() => {});
  }

  /** One in-flight refresh; the rotated refresh token is saved before it is used. */
  refresh(): Promise<StoredTokens> {
    this.refreshing ??= (async () => {
      if (!this.tokens) this.tokens = await this.store.load();
      const current = this.tokens;
      if (!current)
        throw new QboError(
          "No QBO refresh token stored. Run `qbo/cli.ts init-token` with the OAuth Playground refresh token.",
          null,
        );
      const r = await this.refresher(current.refreshToken);
      const next = {
        accessToken: r.accessToken,
        accessTokenExpiresAt: Date.now() + r.expiresInSec * 1000,
        refreshToken: r.refreshToken,
      };
      await this.store.save(next);
      this.tokens = next;
      this.log("qbo: access token refreshed");
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

  /** Run one SELECT. 401 -> one refresh; 429 -> wait 60 s (Intuit's guidance); 5xx -> back off. */
  async query(sql: string): Promise<QueryResponse> {
    if (!/^\s*select\s/i.test(sql))
      throw new QboError(
        "Refusing a non-SELECT: the QBO connector is read-only",
        null,
      );
    const url = `${this.auth.baseUrl ?? QBO_SANDBOX_BASE}/company/${encodeURIComponent(this.auth.realmId)}/query?query=${encodeURIComponent(sql)}&minorversion=${QBO_MINOR_VERSION}`;
    let refreshed = false;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const token = await this.accessToken();
      this.requests++;
      const res = await this.fetchImpl(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });
      if (res.status === 401 && !refreshed) {
        refreshed = true;
        await this.refresh();
        continue;
      }
      if (res.status === 429 || res.status >= 500) {
        const waitSec = res.status === 429 ? 60 : 2 ** attempt;
        this.log(`qbo: HTTP ${res.status}, retrying in ${waitSec}s`);
        await this.sleep(waitSec * 1000);
        continue;
      }
      const body = (await res.json().catch(() => null)) as
        | (QueryResponse & {
            Fault?: { Error?: { Message?: string; Detail?: string }[] };
          })
        | null;
      if (!res.ok || body?.Fault) {
        const f = body?.Fault?.Error?.[0];
        throw new QboError(
          `QBO query failed: HTTP ${res.status}${f ? ` ${f.Message ?? ""} ${f.Detail ?? ""}`.trimEnd() : ""}`,
          res.status,
        );
      }
      if (!body?.QueryResponse)
        throw new QboError("QBO response had no QueryResponse", res.status);
      return body;
    }
    throw new QboError(
      `QBO request failed after ${MAX_ATTEMPTS} attempts`,
      null,
    );
  }
}
