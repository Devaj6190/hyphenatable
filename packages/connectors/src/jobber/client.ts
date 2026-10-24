// Jobber GraphQL client: bearer auth, version header, rotating refresh token, throttling.
// READ-ONLY by construction: `query()` refuses any document that contains a mutation.
// Never logs token values.

import {
  fileTokenStore as fileStore,
  privatePath,
  type StoredTokens,
  type TokenStore,
} from "../tokens.ts";

export type { StoredTokens, TokenStore };

export const JOBBER_GRAPHQL_URL = "https://api.getjobber.com/api/graphql";
export const JOBBER_TOKEN_URL = "https://api.getjobber.com/api/oauth/token";
export const JOBBER_AUTHORIZE_URL =
  "https://api.getjobber.com/api/oauth/authorize";
export const JOBBER_GRAPHQL_VERSION = "2026-09-25";

/** Throttle policy (plan A-03 step 1): below this many points, sleep (2000 - available) / 500 s. */
export const THROTTLE_FLOOR = 1500;
const MAX_ATTEMPTS = 6;
const EXPIRY_SKEW_MS = 60_000;

/** Default token file. data/private/ is gitignored; it is the only runtime write outside the package. */
export const DEFAULT_TOKEN_PATH = privatePath("jobber-token.json");

export const fileTokenStore = (path: string = DEFAULT_TOKEN_PATH): TokenStore =>
  fileStore(path);

/** Company R's real account keeps its own token file; it never shares the trial/tester token. */
export const R_ACCOUNT_TOKEN_PATH = privatePath("r/jobber-token.json");
export type JobberAccount = "trial" | "r";
export const jobberTokenPath = (account: JobberAccount): string =>
  account === "r" ? R_ACCOUNT_TOKEN_PATH : DEFAULT_TOKEN_PATH;

export interface JobberAuth {
  clientId: string;
  clientSecret: string;
  tokenStore?: TokenStore;
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
  /** Progress lines (never token values). */
  log?: (line: string) => void;
}

/** Reads JOBBER_CLIENT_ID / JOBBER_CLIENT_SECRET (shared-context section 16). */
export function authFromEnv(
  env: Record<string, string | undefined> = process.env,
): JobberAuth {
  const clientId = env.JOBBER_CLIENT_ID;
  const clientSecret = env.JOBBER_CLIENT_SECRET;
  if (!clientId || !clientSecret)
    throw new Error("JOBBER_CLIENT_ID and JOBBER_CLIENT_SECRET must be set");
  return { clientId, clientSecret };
}

export interface ThrottleStatus {
  maximumAvailable?: number;
  currentlyAvailable: number;
  restoreRate?: number;
}

interface GraphQLResponse<T> {
  data?: T | null;
  errors?: { message: string; extensions?: { code?: string } }[];
  extensions?: { cost?: { throttleStatus?: ThrottleStatus } };
}

export class JobberError extends Error {
  constructor(
    message: string,
    readonly code: string | null,
    readonly status: number | null,
  ) {
    super(message);
    this.name = "JobberError";
  }
}

/** Seconds to wait given the bucket level, or 0 when above the floor. */
export function throttleDelaySec(currentlyAvailable: number): number {
  if (currentlyAvailable >= THROTTLE_FLOOR) return 0;
  return (2000 - currentlyAvailable) / 500;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((r) => setTimeout(r, ms));

/** True when the document's first operation is (or any operation is) a mutation or subscription. */
export function isWriteDocument(doc: string): boolean {
  const stripped = doc
    .replace(/#[^\n]*/g, "")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""');
  return /(^|[\s}])(mutation|subscription)\b/.test(stripped);
}

export class JobberClient {
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly store: TokenStore;
  private readonly log: (line: string) => void;
  private tokens: StoredTokens | null = null;
  private refreshing: Promise<StoredTokens> | null = null;
  /** Last throttle status seen, for the CLI and tests. */
  lastThrottle: ThrottleStatus | null = null;
  requests = 0;
  refreshes = 0;

  constructor(private readonly auth: JobberAuth) {
    this.fetchImpl = auth.fetchImpl ?? fetch;
    this.sleep = auth.sleepImpl ?? defaultSleep;
    this.store = auth.tokenStore ?? fileTokenStore();
    this.log = auth.log ?? (() => {});
  }

  private async currentTokens(): Promise<StoredTokens> {
    if (!this.tokens) this.tokens = await this.store.load();
    if (!this.tokens) {
      throw new JobberError(
        "No Jobber refresh token stored. Run `cli.ts auth` once (needs a browser).",
        "NO_TOKEN",
        null,
      );
    }
    return this.tokens;
  }

  /** Refresh the access token. Concurrent callers share one in-flight refresh (rotation invalidates the old token). */
  refresh(): Promise<StoredTokens> {
    if (!this.refreshing) {
      this.refreshing = this.doRefresh().finally(() => {
        this.refreshing = null;
      });
    }
    return this.refreshing;
  }

  private async doRefresh(): Promise<StoredTokens> {
    const current = await this.currentTokens();
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: this.auth.clientId,
      client_secret: this.auth.clientSecret,
      refresh_token: current.refreshToken,
    });
    const res = await this.fetchImpl(JOBBER_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body,
    });
    if (!res.ok) {
      throw new JobberError(
        `Jobber token refresh failed: HTTP ${res.status}`,
        "REFRESH_FAILED",
        res.status,
      );
    }
    const json = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };
    if (!json.access_token)
      throw new JobberError(
        "Jobber token refresh returned no access_token",
        "REFRESH_FAILED",
        res.status,
      );
    const next: StoredTokens = {
      accessToken: json.access_token,
      accessTokenExpiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
      // Rotation is on by default; keep the old one only if the server did not send a new one.
      refreshToken: json.refresh_token ?? current.refreshToken,
    };
    // Persist the rotated refresh token before anything else can fail.
    await this.store.save(next);
    this.tokens = next;
    this.refreshes++;
    this.log("jobber: access token refreshed");
    return next;
  }

  private async accessToken(): Promise<string> {
    const t = await this.currentTokens();
    if (
      t.accessToken &&
      t.accessTokenExpiresAt &&
      t.accessTokenExpiresAt - EXPIRY_SKEW_MS > Date.now()
    ) {
      return t.accessToken;
    }
    const fresh = await this.refresh();
    return fresh.accessToken as string;
  }

  /** Run a read-only GraphQL document. Retries on THROTTLED (HTTP 200), 401 (one refresh), 429 and 5xx. */
  async query<T>(
    document: string,
    variables: Record<string, unknown> = {},
    operationName?: string,
  ): Promise<T> {
    if (isWriteDocument(document))
      throw new JobberError(
        "Refusing a mutation: the Jobber connector is read-only",
        "READ_ONLY",
        null,
      );
    let refreshedFor401 = false;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const token = await this.accessToken();
      this.requests++;
      const res = await this.fetchImpl(JOBBER_GRAPHQL_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "X-JOBBER-GRAPHQL-VERSION": JOBBER_GRAPHQL_VERSION,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          query: document,
          variables,
          ...(operationName ? { operationName } : {}),
        }),
      });

      if (res.status === 401 && !refreshedFor401) {
        refreshedFor401 = true;
        await this.refresh();
        continue;
      }
      if (res.status === 429 || res.status >= 500) {
        const wait = Number(res.headers.get("retry-after")) || 2 ** attempt;
        this.log(`jobber: HTTP ${res.status}, retrying in ${wait}s`);
        await this.sleep(wait * 1000);
        continue;
      }
      if (!res.ok)
        throw new JobberError(`Jobber HTTP ${res.status}`, "HTTP", res.status);

      const json = (await res.json()) as GraphQLResponse<T>;
      const throttle = json.extensions?.cost?.throttleStatus ?? null;
      if (throttle) this.lastThrottle = throttle;

      const throttled = json.errors?.some(
        (e) => e.extensions?.code === "THROTTLED",
      );
      if (throttled) {
        const wait = Math.max(
          throttleDelaySec(throttle?.currentlyAvailable ?? 0),
          1,
        );
        this.log(`jobber: THROTTLED, sleeping ${wait}s`);
        await this.sleep(wait * 1000);
        continue;
      }
      if (json.errors?.length) {
        const code = json.errors[0]?.extensions?.code ?? null;
        throw new JobberError(
          `Jobber GraphQL error: ${json.errors.map((e) => e.message).join("; ")}`,
          code,
          res.status,
        );
      }
      if (throttle) {
        const wait = throttleDelaySec(throttle.currentlyAvailable);
        if (wait > 0) {
          this.log(
            `jobber: ${throttle.currentlyAvailable} points left, sleeping ${wait}s`,
          );
          await this.sleep(wait * 1000);
        }
      }
      if (json.data === undefined || json.data === null)
        throw new JobberError("Jobber returned no data", null, res.status);
      return json.data;
    }
    throw new JobberError(
      `Jobber request failed after ${MAX_ATTEMPTS} attempts`,
      "RETRIES_EXHAUSTED",
      null,
    );
  }
}
