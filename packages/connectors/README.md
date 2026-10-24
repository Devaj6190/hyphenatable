# @payrollpilot/connectors

Read-only connectors for Jobber (GraphQL), QuickBooks Online (REST v3, sandbox) and Gusto (demo API), plus export readers (Jobber Timesheets xlsx, Gusto Payroll Journal csv, QBO Excel) and the Company R anonymizer. Every pull returns records in the shared-context section 6 shapes and one `SyncRun` per object. Plain async TypeScript: **no Convex import**, no writes to any source.

## Calling it from Convex (`"use node"` action)

```ts
import { pullSource, callbackTokenStore } from "@payrollpilot/connectors";

const out = await pullSource("jobber", {
  companyId, cycleId,                       // cycleId stamps SyncRuns and Jobber time entries
  from: "2026-10-10", to: "2026-10-23",     // inclusive dates
  timezone: "America/New_York",             // Company.timezone (Jobber periods)
  credentials: { clientId: process.env.JOBBER_CLIENT_ID!, clientSecret: process.env.JOBBER_CLIENT_SECRET! },
  tokenStore: callbackTokenStore(
    () => ctx.runQuery(internal.tokens.get, { source: "jobber" }),          // -> StoredTokens | null
    (t) => ctx.runMutation(internal.tokens.set, { source: "jobber", t }),   // must persist before returning
  ),
  objects: ["timeSheetEntries"],            // optional: one action per object type
});
// out.records.{workers,timeEntries,jobs,visits,quotes,invoices,payments,expenses,payrolls}; out.syncRuns
```

| source | `objects` (= `SyncRun.object`) | range meaning | extra ctx |
|---|---|---|---|
| `jobber` | `users`, `timeSheetEntries`, `visits`, `quotes`, `invoices`, `paymentRecords`, `expenses`, `jobs` | pay period, local dates in `timezone` | |
| `qbo` | `Purchase`, `Bill` | `TxnDate` from..to | `realmId` (QBO_REALM_ID) |
| `gusto` | `employees`, `contractors`, `payrolls_processed`, `payrolls_unprocessed` | processed payrolls whose period overlaps from..to | `gustoCompanyUuid` (else read from the token) |

Notes: Jobber's `users` always runs (the time-entry completeness check needs it); `jobs` are those referenced by the period's records, so ask for them together with the objects that reference them. A source failure is an incomplete `SyncRun`, never a throw (only bad arguments throw).

Per-source functions are also exported: `@payrollpilot/connectors/jobber` (`pullCycle`), `/qbo` (`pullExpenses`), `/gusto` (`pullEmployees`, `pullContractors`, `pullPayrolls`, `pullUnprocessed`), `/exports/*` (readers).

## Tokens

All three use OAuth with **rotating refresh tokens**. The `TokenStore` (`{ load(): StoredTokens | null; save(t) }`) gets the rotated token *before* the new access token is used; one refresh is in flight per client. Run one client per token: two processes refreshing the same token invalidate each other.

- Locally the CLIs use files in `data/private/` (gitignored, 0600): `jobber-token.json` (trial), `r/jobber-token.json` (Company R, `--account r`), `qbo-token.json`, `gusto-token.json`.
- First token (needs a browser): `bun run src/jobber/cli.ts auth [--paste] [--account r]` (redirect `https://payrollpilot.vercel.app/auth`; paste the landed address), `bun run src/gusto/cli.ts auth` (redirect `http://localhost:3000/auth/gusto`), `bun run src/qbo/cli.ts init-token < token` (OAuth Playground refresh token).
- Never log token values; none of this code does.

## Env vars (shared-context section 16)

`JOBBER_CLIENT_ID`, `JOBBER_CLIENT_SECRET`, `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `QBO_REALM_ID`, `GUSTO_CLIENT_ID`, `GUSTO_CLIENT_SECRET`. CLI only: `PASTED_URL` (Jobber paste auth).

## SyncRun semantics

`{ object, pulled, expected, complete, method, error }`

- `complete = true` only when every check for that object passed: `pulled == expected` and the extra checks below. Any mismatch -> `complete = false` and the difference in `error` (ids and counts only, never names). CHK-23 blocks what an incomplete run covers.
- `expected`: Jobber `totalCount`; QBO `count(*)` on the same WHERE; Gusto `X-Total-Count` when sent, else `null` (complete then means pagination ended); exports: data rows in the file.
- Extra checks: Jobber time entries also against per-user `User.timeSheetsByDay` totals; nested lists cut at 10 (visit users, quote/invoice jobs); referenced job ids not returned; totalCount drifting between pages; duplicate ids across pages; export rows vs the report's own total row; Gusto payroll lists vs detail.
- `error` can be set on a complete run as a note (e.g. a field hidden by scope, see below; users in other statuses).
- `--compare data/fixtures/<company>` (CLIs) diffs a pull against the seed fixtures through the pusher's id maps; objects the pusher records under `skipped` (no create mutation for the app: Jobber time entries, payment records) print as `expected: fixture-only by design` and never fail the compare.

## Ids

- Record `id` is `<source>:<upstream id>`: `jobber:<EncodedId>`, `qbo:<Entity>:<Id>[:<LineId>]`, `gusto:employee:<uuid>`, `gusto:contractor:<uuid>`, `gusto:payroll:<uuid>`. References (`workerId`, `jobId`, `invoiceId`, …) use the same form, so the loader can map them to Convex ids.
- `sourceId` is the upstream id; QBO uses the seed marker (`payrollpilot:<ourId>` in PrivateNote, `#<line>` on split purchases) when present.
- Company R (anonymized): `r:w:` / `r:c:` / `r:j:` salted hashes; export rows `xlsx:<file hash>#…`, `csv:<file hash>#…`.

## Money, time, unknowns

Money is integer cents parsed from the decimal string (no float maths); times are ISO 8601 UTC; QBO `Expense.date` is the `TxnDate` (`YYYY-MM-DD`). A value the source does not give is `null`, never 0 or a default (no invented rates, no guessed job when a quote/invoice has several).

## Known live quirks (all handled)

- **Jobber hides `User.labourRate` and `Expense.accountingCode`** from the read app (scope). The connector probes the schema once per pull and asks only for visible fields; otherwise `labourRateCents` / `accountName` stay `null` and `SyncRun.method` says so. `TimeSheetEntry.labourRate` is visible but is never substituted for a user's rate.
- **Jobber `timeSheetsByDay` allows 7 days per call**: walked in 7-day windows.
- **Jobber users**: one unfiltered pull; only `DEACTIVATED` is inactive (`NOT_INVITED` workers log hours and are active).
- **Jobber quotes converted to jobs are rarely "sent"** (`sentAt` null): each in-scope job brings its quote; the `sentAt` range adds quotes sent but not converted.
- **Jobber invoice adjustments**: Jobber creates an `OtherPaymentRecord` (`adjustmentType INVOICE`, `paymentOrigin UNKNOWN_ORIGIN`, amount = invoice total) itself. It is normalized as `kind: "unknown"`, `paymentType: "jobber_invoice_adjustment"`, never a final payment; still counted and traceable.
- **Jobber has no `timeSheetEntryCreate` / payment-record mutations** for our apps: seed time entries and payments are fixture-only.
- **Gusto payroll lists allow at most 1 year per call** and match by period overlap: walked in 365-day windows, deduped by uuid.
- **Gusto demo company**: payroll history starts 2026-07-04 (7 biweekly regular payrolls at the time of writing).
- **QBO**: `minorversion=75`; 429 waits 60 s; `intuit-oauth` logging stays off (it would log token JSON).

## Assembled dataset (for the loader)

`bun --env-file=.env run packages/connectors/src/assemble.ts --company a --cycle a-c05` (read-only) pulls every source whose token is in `data/private/`, merges it with the fixture-only records (time entries, payments, past payrolls), and writes `data/private/assembled/<company>-<cycle>.json` (derived, never committed), printing counts only. Each record carries `origin` (`live` | `fixture`), `ourId` (the fixture / answer-key id, or null) and `url` (Jobber web link for jobs, quotes, invoices). Fixture records reference live ids through the pushers' id maps (a fixture time entry's `jobId` is the live `jobber:` job), so every reference resolves inside the dataset; live records the maps do not know are kept with `ourId: null` and counted. A source that is not pulled falls back to its fixture records (`sources` says which).

## Company R

`src/ingest-r.ts` is the only path for real data: inputs inside `data/private/r/`, anonymized (`anonymize.ts`), output only to `data/private/r/out/`, refused unless stamped `namesAnonymized: true` and free of every real token. See the file header for the commands.

## Tests

`bun run test` (vitest) or `bun test src`; everything runs on recorded or synthetic fixtures, no network.
