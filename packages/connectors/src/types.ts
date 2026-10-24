// Contract (plan B section 3): A's clients implement Connector<T>; B's convex/sync calls them in "use node" actions.
// Connectors are pure clients: credentials and a range in, normalized records plus the source's own total out.

export interface ConnectorCtx {
  companyId: string;
  /** Read from Convex env by the caller; never logged. */
  credentials: Record<string, string>;
  fetch: typeof fetch;
}

export interface ConnectorResult<T> {
  records: T[];
  /** The total the source reports (Jobber totalCount, QuickBooks count(*), ...); null when it reports none. */
  expected: number | null;
  /** How the records were read: "api", "export", "browser", "fixture". Shown in the UI. */
  method: string;
}

export interface Connector<T> {
  list(
    range: { start: string; end: string },
    ctx: ConnectorCtx,
  ): Promise<ConnectorResult<T>>;
}
