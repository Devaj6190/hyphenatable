# Status (update at every gate and after every merge; newest first)

Format: `HH:MM PDT · who · what landed on main / what I'm on / what I need`. Decisions that change the plan go here too, with the file they changed.

- Sat 02:45 · A1 · Merged #6 (773c00a): Gusto read connector: `pullEmployees` (+ compensations, `onboarded`), `pullContractors`, `pullPayrolls` (processed, per-employee gross/net and lines in cents), `pullUnprocessed` (list only). GET-only and `api.gusto-demo.com`-only enforced in code; no prepare/update/calculate/submit. 70 tests. Not run live (needs `gusto/cli.ts auth`).
  - **Ask → Devaj (B):** section 6 has no payroll table; the connector returns a local `GustoPayroll`. Contract table, or only feeds `Draft` and `eval`? Gusto worker ids are `gusto:employee:<uuid>` / `gusto:contractor:<uuid>`; mapping to Jobber workers is A-07's map.
  - **Blocked (A, H1):** Jobber developer-testing signup fails server-side (CORS on `secure.getjobber.com/signup.json`) in two browsers; trying a regular free trial next.

- Sat 02:35 · A2 · Merged #5 (f01e413): `seed/generate.ts --company a` (deterministic, hash-tested) regenerates `data/fixtures/a/` with past cycles a-c01..a-c04 and every CHK-01..CHK-22 planted in a-c05; answer key 29 rows. **B and C: fixture ids/amounts changed.** a-te-0101..0140 kept, but a-te-0108/0124/0135/0140 moved a-w06 → a-w05; job/quote/invoice totals recomputed; new workers a-w13/a-w14, jobs a-j07..10; new files `pastPayrolls.json`, `questions.json`. Details in `data/fixtures/README.md`.
  - **Ask → Devaj (B), checks:** CHK-04 skips exact duplicates (CHK-05 owns them, a-te-0106/0146); CHK-22 reads regular + Venmo rows of `pastPayrolls.json` until the Gusto reader lands; CHK-18 compares `jobber.labourRateCents` with the pay_rate rule's `costRateCentsPerHour`; CHK-21 margin threshold is assumed 20% (`lowMarginPct` in `seed/companies/a.json`). Do you want it in `Company.settings` (contract)?

- Sat 02:30 · A1 · Merged #4 (a064dc6): QBO read connector `pullExpenses` (Purchase + Bill, SELECT-only guard, `count(*)` completeness, one SyncRun per entity; token via `qbo/cli.ts init-token`), and Jobber expenses now carry `reimbursableToWorkerId` / `reimbursementStatus`; 59 tests. Not run live.
  - **Note → Devaj (B):** QBO `Expense.date` is `YYYY-MM-DD`, Jobber expense dates are full UTC timestamps; CHK-15 should compare both as dates. QBO SyncRun `pulled`/`expected` count purchases/bills, not split Expense lines.

- Sat 02:20 · A1 · Merged #3 (d7c66d1): Jobber connector part 2: jobs (by id), visits, quotes with salesperson, invoices, payment records (deposit if on a quote, final if invoice only), expenses; one SyncRun per object with `totalCount` completeness; 43 tests. Not yet run against an account (tester auth pending).
  - **Ask → Devaj (B), contract:** (1) `Invoice.totalCents` and `Expense.amountCents` can be null from Jobber; schema needs `| null` (we never default to 0). (2) A-10 Reimbursement lines need Jobber's `reimbursableTo` + reimbursement status on `Expense`; propose adding `reimbursableToWorkerId: string|null, reimbursementStatus: string|null`. (3) `Job.jobNumber` is a number. (4) Jobber expenses come back with `kind: "unknown"`, `matchedJobId` from `linkedJob` (set by a person), `matchConfidence: null`.

- Sat 02:15 · A1 · Merged #2 (bafe0a3): `packages/connectors/src/jobber/` v1: OAuth (PKCE, rotating refresh, token in `data/private/`), read-only client (refuses mutations), users + timeSheetEntries, completeness vs `totalCount` and `timeSheetsByDay`; 35 tests, tsc clean. `pullCycle(auth, companyId, from, to, opts)` returns `{ records, syncRuns }`, one SyncRun per object. Not yet run against an account.
  - **Ask → Devaj (B):** (1) insert mutation name, assumed `sync.recordRun`; (2) connector ids are `jobber:<EncodedId>` (sourceId = EncodedId); resolve to Convex ids on insert; (3) Jobber can't know `Worker.role`/`payType`: connector returns null there; B merges with company config on insert, or a `contract:` PR allows null. Say which.

- Sat 02:10 · A2 · Merged #1 (bc14f40): `data/fixtures/a/*.json` (13 files, Company A cycle a-c05, 40 entries) + `answer-key.json` v1 (CHK-01, 02, 03, 04, 05, 10, 11, 14) + `seed/validate.ts`. **B and C: fixtures are on main.** Conventions in `data/fixtures/README.md`.
  - **Ask → Devaj (B):** confirm for the checks: CHK-17 skips expenses with null account (Jobber expenses); CHK-05 doesn't count a ticking entry as zero; cycle `periodEnd` is inclusive. Also expected real-but-unkeyed flags: CHK-06 on a-te-0140, CHK-12 on a-w08/09/10, CHK-23 on a-sr-04.

- Sat 01:50 · A (lead) · On: lanes A1 (connectors: A-01, A-03, A-08, A-09, A-15) and A2 (seed: A-02 → A-04..A-07, A-14) started; A3 (payroll + eval) after G1. A-02 fixtures target 03:00.
  - **Ask → Devaj (B), contract:** A-10 produces a per-line arithmetic trail. `DraftLine` in shared-context §6 has no `explain` field. Until a `contract:` PR adds `explain: string[]` to `DraftLine`, A returns `{ draft, explain: Record<workerId, string[]> }` beside the `Draft`. Please say yes/no here.
  - **Decision (A):** Company R ingest script lives at `packages/connectors/src/ingest-r.ts`, not `seed/ingest-r.ts` (keeps lane folders disjoint). Plan A-09 file list is superseded by this line.
  - **Decision (A):** until B-02 merges, A validates fixtures with `seed/validate.ts` (zod mirror of §6).

- Sat 01:55 · Shanin · Decision: product name is **PayrollPilot**, not PayCheck. Renamed in the spec, plans and README (Gusto's "Paycheck Tips" earning name is unchanged). Package name `payrollpilot`; Convex project `payrollpilot`; seed tags `payrollpilot:`.

- Sat 01:35 · plan · Spec completed (0 open items), shared context, team brief and role plans committed. Next: everyone reads `docs/plans/00-team-brief.md`, then first-hour checks (see `docs/INTEGRATIONS.md`).
