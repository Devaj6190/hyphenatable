// Read-only GraphQL documents for Jobber (version 2026-09-25). Field names checked against a live
// introspection of https://api.getjobber.com/api/graphql on 2026-10-24.
// Every connection is paginated with cursors, first: 50 (cost = first x fields; no `first` = 100).

import type { JobberClient } from "./client.ts";

export const PAGE_SIZE = 50;

// User.labourRate is in Jobber's public schema but hidden from an app without the matching scope
// (seen live on the trial account 2026-10-24: "Field 'labourRate' doesn't exist on type 'User'").
// It is requested only when the live schema shows it; otherwise labourRateCents stays null.
export const usersQuery = (withLabourRate: boolean) => /* GraphQL */ `
  query PayrollPilotUsers($first: Int!, $after: String) {
    users(first: $first, after: $after) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes { id name { full } status isAccountOwner isAccountAdmin${withLabourRate ? " labourRate" : ""} }
    }
  }
`;
export const USERS_QUERY = usersQuery(true);
export const USERS_QUERY_NO_RATE = usersQuery(false);

/** Field names of a type as this app's token sees them (scope-filtered). Read-only introspection. */
export const TYPE_FIELDS_QUERY = /* GraphQL */ `
  query PayrollPilotTypeFields($name: String!) {
    __type(name: $name) { name fields { name } }
  }
`;

const probes = new WeakMap<JobberClient, Map<string, Promise<Set<string>>>>();
/** Cached per client: one introspection per type per pull. */
export function visibleFields(client: JobberClient, typeName: string): Promise<Set<string>> {
  let byType = probes.get(client);
  if (!byType) probes.set(client, (byType = new Map()));
  let p = byType.get(typeName);
  if (!p) {
    p = client
      .query<{ __type: { fields: { name: string }[] | null } | null }>(TYPE_FIELDS_QUERY, { name: typeName })
      .then((d) => new Set((d.__type?.fields ?? []).map((f) => f.name)));
    byType.set(typeName, p);
  }
  return p;
}

/** Unfiltered count: reveals users in statuses other than ACTIVATED / DEACTIVATED (e.g. NOT_INVITED). */
export const USERS_COUNT_QUERY = /* GraphQL */ `
  query PayrollPilotUsersCount {
    users(first: 1) { totalCount }
  }
`;

// `note` is requested only to compute hasNote; normalize() never copies it.
// `visit` is deprecated in 2026-09-25; `targetItem` (Assessment | Job | Visit) replaces it.
export const TIME_SHEET_ENTRIES_QUERY = /* GraphQL */ `
  query PayrollPilotTimeSheetEntries($after: String, $first: Int!, $startAfter: ISO8601DateTime!, $startBefore: ISO8601DateTime!) {
    timeSheetEntries(
      filter: { startAt: { after: $startAfter, before: $startBefore } }
      sort: [{ field: START_AT, direction: ASCENDING }]
      first: $first
      after: $after
    ) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        user { id }
        job { id }
        targetItem { __typename ... on Job { id } ... on Visit { id job { id } } }
        startAt
        endAt
        finalDuration
        ticking
        approved
        approvedBy { id }
        payable
        label
        timeSheetCategory
        labourRate
        note
        createdAt
        updatedAt
      }
    }
  }
`;

/** Per-user, per-day totals: the second, independent count for time-entry completeness. */
export const USER_TIME_SHEETS_BY_DAY_QUERY = /* GraphQL */ `
  query PayrollPilotUserTimeSheetsByDay($userId: EncodedId!, $startDate: ISO8601Date!, $endDate: ISO8601Date!, $first: Int!, $after: String) {
    user(id: $userId) {
      id
      timeSheetsByDay(startDate: $startDate, endDate: $endDate, first: $first, after: $after) {
        totalCount
        pageInfo { hasNextPage endCursor }
        nodes { date totalDuration entries(first: 1) { totalCount } }
      }
    }
  }
`;

export interface Connection<N> {
  totalCount: number;
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
  nodes: N[];
}

export interface PageResult<N> {
  nodes: N[];
  /** totalCount reported on the first page. */
  totalCount: number;
  /** true when totalCount changed between pages (data moved during the pull). */
  totalCountDrift: boolean;
  pages: number;
}

/** Follow cursors until hasNextPage is false. `pick` extracts the connection from the response. */
export async function paginate<N, R>(
  client: JobberClient,
  document: string,
  variables: Record<string, unknown>,
  pick: (data: R) => Connection<N> | null | undefined,
): Promise<PageResult<N>> {
  const nodes: N[] = [];
  let after: string | null = null;
  let totalCount: number | null = null;
  let drift = false;
  let pages = 0;
  for (;;) {
    const data: R = await client.query<R>(document, { ...variables, first: PAGE_SIZE, after });
    const conn = pick(data);
    if (!conn) throw new Error("Jobber response missing the expected connection");
    pages++;
    if (totalCount === null) totalCount = conn.totalCount;
    else if (conn.totalCount !== totalCount) drift = true;
    nodes.push(...conn.nodes);
    if (!conn.pageInfo.hasNextPage) break;
    if (!conn.pageInfo.endCursor) throw new Error("Jobber hasNextPage without endCursor");
    after = conn.pageInfo.endCursor;
  }
  return { nodes, totalCount: totalCount ?? 0, totalCountDrift: drift, pages };
}

// ---- raw node types (what Jobber returns) ----

export interface RawUser {
  id: string;
  name: { full: string };
  status: string;
  isAccountOwner: boolean;
  isAccountAdmin: boolean;
  /** absent when the field is hidden from this app */
  labourRate?: number | null;
}

export interface RawTimeSheetEntry {
  id: string;
  user: { id: string } | null;
  job: { id: string } | null;
  targetItem: { __typename: string; id?: string; job?: { id: string } | null } | null;
  startAt: string;
  endAt: string | null;
  finalDuration: number;
  ticking: boolean;
  approved: boolean;
  approvedBy: { id: string } | null;
  payable: boolean;
  label: string | null;
  timeSheetCategory: string | null;
  labourRate: number | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RawTimeSheetUserDay {
  date: string;
  totalDuration: number;
  entries: { totalCount: number };
}
