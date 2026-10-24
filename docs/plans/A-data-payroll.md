# Role A: Data and Payroll (PayCheck, Cal Hacks 13.0)

Binding context: `docs/plans/00-shared-context.md` (wins on any conflict), `specs/final.md`, `docs/plan-research.md` (sections 9 to 14 are A's reference material). Written Sat 2026-10-24 about 1:30 AM PDT. All clock times are PDT. Anything not confirmed is marked **UNVERIFIED** and has a first-hour check. No number in this file is invented; every figure has a source or is labelled synthetic.

Person: Shanin. Also the only person who can run anything against Company R (the real company) and the only one with the Jobber Developer Center login.

---

## 1. Role summary

**Mission.** Make the data real, complete and traceable, make the money math right to the cent, and measure both. Everything the Auditor flags, the Messenger asks and the dashboard shows is only as good as what A puts into Convex and what A's payroll functions compute from it.

**Three phases.**
- **Foundation (01:45 to 05:00):** first-hour checks H1, H2, H3; fixtures for every table so B and C work offline from G0; seed generator v1 with the answer key; Jobber connector reading the tester account into Convex.
- **Data in (09:00 to 18:00):** pushers fill Jobber, QuickBooks and Gusto with Company A; connectors pull it back with completeness checks; Company R's past cycle is ingested read-only and anonymized; Stage 1 payroll math and the workbook lines feed B's Gusto writer at G2.
- **Proof (18:00 to Sun 02:00):** eval scripts (M1 to M6), the Company R backtest to the cent, Stage 2 math and the reconciliation report, `docs/PROOF.md`, then stretch: Company B, Playwright reader, the live run on the current cycle.

**What judges must see from A's work.**
| Hyphenate question | A's evidence |
|---|---|
| Is it real enough? | Company A lives in the real Jobber, QuickBooks and Gusto sandboxes, not in mocks; Company R is a real company's real past cycle (anonymized); planted errors come from the register categories; every sync shows pulled vs. expected |
| Would you hire it? | Pay computed to the cent and backtested against what was actually paid (M4); no invented rates; held items excluded, never zeroed; read-only credentials on every source |
| Did we see something new? | The gap in the Jobber-to-Gusto sync (salaried, contractor, commission workers) handled by our math; profit-driven Stage 2 that explains why "small" errors matter |
| The moment | Double-booked hours in the current real cycle (CHK-04 on Company R) caught before the draft is filled; fallback: the planted overlap in Company A |

---

## 2. Role onboarding (15 minutes)

1. **Accounts.** Jobber Developer Center (Shanin's; app "PayCheck (Dev)" read-only, plus a new "PayCheck Seed" app with write scopes; a tester account from the "developer testing signup link" on https://developer.getjobber.com/docs/getting_started). Gusto developer org at https://dev.gusto.com (A creates it in H2 and invites Devaj, because activation time is undocumented and it must start first). QuickBooks developer account (Devaj's sandbox per the spec; confirm in H3 whose it is and get `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `QBO_REALM_ID` into the shared `.env`). Convex project (B invites A). Photon dashboard (Shanin's; C needs the owner phone and the "manager" phone registered as users).
2. **Tools.** Bun 1.4.3 and Node 22.22 are installed. Playwright Chromium 1248 is cached (`bunx playwright install chromium` only if a reader fails to launch). No `uv`, no `cloudflared`; neither is needed.
3. **Repo.** After B's scaffold lands (G0): `git pull`, `bun install`, `cp .env.example .env`, fill from the shared vault message. Branch names `a/<feature>`. Every PR targets `main`; check `main` after merging.
4. **Where A's files live** (from shared-context section 5):

| Path | Contents | Owner |
|---|---|---|
| `seed/companies/a.json`, `seed/companies/b.json` | company configs: workers, rules, jobs, planted errors | A |
| `seed/generate.ts` | writes fixtures and the answer key | A |
| `seed/push-jobber.ts`, `seed/push-qbo.ts`, `seed/push-gusto.ts` | idempotent pushers | A |
| `data/fixtures/<company>/*.json` | one file per table in shared-context section 6, fake names only | A |
| `data/fixtures/<company>/answer-key.json` | planted errors, never read by the model | A |
| `packages/connectors/src/jobber/`, `src/qbo/`, `src/gusto/read*`, `src/exports/`, `src/readers/`, `src/anonymize.ts` | connectors, normalizers, completeness, anonymizer | A (B owns `src/gusto/write*`) |
| `packages/engine/src/payroll/` | Stage 1 and Stage 2 math, golden tests | A |
| `eval/` | M1 to M6 scripts, `eval/results.json` | A |
| `docs/PROOF.md`, `docs/INTEGRATIONS.md` (A's rows) | what's real, simulated, how we know | A |
| `data/private/` | gitignored: Company R exports, pseudonym map, runbook grading sheet | A, never committed |

---

## 3. Interfaces (what A produces, for whom, by when)

| For | Artifact | Path | Hand-off time |
|---|---|---|---|
| B, C | One fixture JSON per table for Company A, matching `packages/engine/src/schemas.ts` | `data/fixtures/a/*.json` | **03:00 (G0)** |
| B | Answer key format and first version | `data/fixtures/a/answer-key.json` | 03:00 (G0), full by 11:00 |
| B | Jobber connector exposing `pullCycle(companyId, periodStart, periodEnd)` and `completeness` results in `SyncRun` shape | `packages/connectors/src/jobber/index.ts` | 04:30 (v1 against the tester account), 11:00 (all objects) |
| B | QuickBooks connector `pullExpenses(realmId, from, to)` with `count(*)` completeness | `packages/connectors/src/qbo/index.ts` | 11:00 |
| B | Gusto read connector `pullEmployees`, `pullPayrolls` | `packages/connectors/src/gusto/read.ts` | 11:00 |
| B | `computeStage1(cycle, entries, workers, rules): Draft` and `computeStage2(...)` with golden tests | `packages/engine/src/payroll/` | Stage 1 by **16:00** (before G2), Stage 2 by 22:00 |
| B | Company A seeded in all three sandboxes; `docs/INTEGRATIONS.md` says which objects are real | sandboxes | **13:00 (G1)** |
| B, C | Company R past cycle in Convex, anonymized | Convex, via `sync.run` | 13:00 (G1) |
| C | Readiness numbers: `eval/results.json` (M1 to M6) consumed by the readiness screen and `docs/PROOF.md` | `eval/results.json`, `docs/PROOF.md` | first version 21:00, final Sun 05:30 |
| C | The one-line "what's real, what's simulated" statement for the video and Devpost | `docs/PROOF.md` section 1 | 23:00 (G3) |
| Everyone | Manual-steps checklist for the Jobber UI (add users, approve timesheets) | `seed/README.md` | 10:00 |

**Contract notes for B (confirm in `docs/STATUS.md` at G0).**
- Fixtures use the section 6 shapes unchanged; ids are strings like `a-w03` (worker 3 of Company A), `a-c05` (cycle 5), `a-te-0142`; Convex ids are assigned on insert and `sourceId` keeps our id or the upstream id.
- Answer-key rows are matched by `checkId` plus overlapping subject ids, never by text (B generates `seen`).
- Connectors are plain async functions returning `{ records, syncRun }`; they do not import Convex. B's `convex/sync/` calls them from a `"use node"` action and writes the records. A needs from B: the exact `SyncRun` insert mutation name (expected `sync.recordRun`) and whether B wants one action per object type or one per source. Default: one per object type, so a QuickBooks failure never blocks Jobber hours.
- `computeStage1` is pure: it takes already-filtered records and the active `Rule[]`, returns a `Draft` with `lines` and the per-worker arithmetic trail (`explain: string[]` per line) that the workbook screen shows. It never reads the database and never calls a model.

---

## 4. Facts and numbers A owns

| # | Claim | Status | Safe wording |
|---|---|---|---|
| N1 | Jobber tester accounts last 90 days and work with the full API; the read app in Draft needs no approval and connects to up to 5 accounts | **VERIFIED** (developer.getjobber.com, Oct 24; research section 10) | "running against a Jobber developer account" |
| N2 | `TimeSheetEntry` exposes `id`, `approved`, `approvedBy`, `ticking`, `payable`, `finalDuration`; connections have `totalCount`; `User.timeSheetsByDay` gives per-day totals | **VERIFIED** by live introspection, version 2026-09-25 | "every entry traced by its Jobber id" |
| N3 | Seeding mutations exist: `clientCreate`, `propertyCreate`, `jobCreate`, `visitCreate`, `timeSheetEntryCreate`, `expenseCreate`, `quoteCreate`, `invoiceCreate`, `invoiceCreatePaymentRecord`, `quoteCreatePaymentRecord`. No `userCreate`, no approve mutation | **VERIFIED** (introspection) | manual steps printed by the pusher |
| N4 | How many users a tester account allows | **UNVERIFIED**; Company A needs 12 | H1 checks it; fallback 6 workers |
| N5 | QuickBooks sandbox: up to 10 companies for 2 years, `count(*)` returns `totalCount`, Purchases can be created and deleted by API, 500 requests/min per realm | **VERIFIED** (developer.intuit.com, Oct 24) | |
| N6 | Gusto demo: self-serve signup, scopes not enforced in demo, demo company comes with employees and past payrolls, draft path is prepare → update → calculate, submit is never called | **VERIFIED** except activation time (**UNVERIFIED**) | H2 starts first |
| N7 | Jobber-to-Gusto sync: hourly employees only; salaried, contractor, commission not supported; approved timesheets only; overwrites manual hours | **VERIFIED** (Jobber and Gusto help centers) | the pitch's market gap |
| N8 | Company R: 15 people, biweekly, 3 past cycles with a problem register of 125 rows across the register categories; the current cycle has double-booked hours | Team facts from the handoff; register rows stay private | "a real 15-person landscaping company; 3 past pay periods" |
| N9 | Backtest match count and max difference (M4) | **Must be measured** | "N of M workers match to the cent, measured <time>" |
| N10 | Planted-error recall and precision (M1) | **Must be measured** | never a target |
| N11 | Oct 20 Browser Use read of Company R recovered 58 entries with 58 ids and approval states for $0.91 | Tested Oct 20 (private ledger) | "the browser fallback has worked on this account before" |

Rule: a target is never presented as a result. Every number on screen says "measured on Company A, cycle N, <time>" or "synthetic".

---

## 5. Timeline and gates (PDT)

| Time | A work | Gate checklist |
|---|---|---|
| 01:15 to 01:45 | Read brief, this plan, shared context sections 5, 6, 9, 13, 14 | |
| 01:45 to 02:15 | **A-01** H2 Gusto signup first (activation time unknown), then H1 Jobber tester + GraphiQL, then H3 QuickBooks Playground. Log each in `docs/INTEGRATIONS.md` | |
| 02:15 to 03:00 | **A-02** fixtures for every table, Company A, fake names; answer-key v1 | **G0 03:00:** [ ] `data/fixtures/a/*.json` merged; [ ] answer-key v1 merged; [ ] H1, H2, H3 rows in INTEGRATIONS.md; [ ] tester account authorized; [ ] Gusto org created |
| 03:00 to 04:30 | **A-03** Jobber connector v1 (OAuth refresh, `users`, `timeSheetEntries`, completeness) against the tester account | [ ] `bun run packages/connectors/src/jobber/cli.ts pull --from … --to …` prints pulled = expected |
| 04:30 to 05:00 | **A-04** seed generator v1 (workers, 4 past cycles, current cycle, planted errors) writes fixtures that validate | [ ] `bun run seed/generate.ts --company a` validates against schemas |
| 05:00 to 09:00 | Sleep | |
| 09:00 to 11:00 | **A-05** push Jobber; **A-06** push QuickBooks; **A-07** push Gusto; manual Jobber UI steps | |
| 11:00 to 13:00 | **A-03** rest of the Jobber objects; **A-08** QuickBooks and Gusto read connectors; **A-09** Company R ingest + anonymizer | **G1 13:00:** [ ] Company A in all three sandboxes; [ ] pulled into Convex, every `SyncRun.complete = true`; [ ] Company R past cycle in Convex, anonymized; [ ] B's checks fire on the planted errors |
| 13:00 to 16:00 | **A-10** Stage 1 payroll math with golden tests; workbook lines | [ ] `computeStage1` on fixtures matches the golden file to the cent |
| 16:00 to 18:00 | Support B's Gusto fill with real `Draft.lines`; fix normalizer bugs found by the checks | **G2 18:00:** [ ] a Gusto draft filled from A's lines |
| 18:00 to 21:00 | **A-11** eval M1, M3, M5, M6 → `eval/results.json`; **A-12** Company R backtest (M4) | |
| 21:00 to 23:00 | **A-13** Stage 2 math and reconciliation report; **A-11** M2 rule grading (private sheet, aggregates only); `docs/PROOF.md` v1 | **G3 23:00:** [ ] results.json has M1 to M6; [ ] PROOF.md v1; [ ] Stage 2 report renders |
| 23:00 to Sun 02:00 | Stretch in cut order: **A-14** Company B seed; **A-15** Playwright reader; **A-16** live run on the current real cycle (the moment) | |
| Sun 02:00 to 04:00 | Sleep (shift 1) | |
| 04:00 to 06:30 | Final eval run on `main`; PROOF.md final; help rehearsal with the judge scenario | **Freeze 06:30** |
| 08:00 | At the venue | |

---

## 6. Tickets (one PR each)

Each ticket is one PR under 400 changed lines where possible (fixture files may exceed; say so in the PR). Branch names `a/<feature>`. Verification commands assume the repo root and B's scaffold (`bun install` done).

### A-01 First-hour checks and INTEGRATIONS.md rows
- **Branch:** `a/first-hour-checks`
- **Goal:** Prove Gusto, Jobber and QuickBooks access before anyone builds on them.
- **Priority:** P0. Serves "Is it real enough?" and every pillar.
- **Files:** `docs/INTEGRATIONS.md` (A's rows), `.env` (local only), `seed/README.md` (account notes without secrets).
- **Depends on:** nothing. Start at 01:45.
- **Steps:**
  1. **H2 Gusto first.** Sign up at dev.gusto.com, create Organization and Application, copy `GUSTO_CLIENT_ID` / `GUSTO_CLIENT_SECRET` into `.env`. Create a demo company from the Developer Portal. With a company token, call `GET https://api.gusto-demo.com/v1/companies/{c}/payrolls?processing_statuses=unprocessed&payroll_types=regular,off_cycle` with header `X-Gusto-API-Version: 2026-06-15`. Record: activation time, company uuid, employee count, pay schedule, number of past payrolls. Invite Devaj to the org.
  2. **H1 Jobber.** Create a tester account from the Getting Started link. In the Developer Center, open "PayCheck (Dev)" (the existing read app; rename later), click "Test in GraphiQL" once, authorize the tester account, run `{ timeSheetEntries(first: 5) { totalCount nodes { id approved ticking finalDuration startAt user { id } job { id } } } }` with header `X-JOBBER-GRAPHQL-VERSION: 2026-09-25`. Record which scopes were needed. **Then do not use GraphiQL again on that account** (it invalidates the app's refresh token). Create the second app "PayCheck Seed" with write scopes on clients, properties, jobs, visits, timesheets, expenses, quotes, invoices, payments. **Check the user cap:** try adding users in the tester account's Settings → Manage Team until it refuses; record the number.
  3. **H3 QuickBooks.** With Devaj: OAuth 2.0 Playground → pick the sandbox → tokens and `realmId`. Run `SELECT count(*) FROM Purchase` and `SELECT * FROM Purchase MAXRESULTS 5`. Record whose developer account it is and put `QBO_*` in the shared `.env`.
  4. Write one row per check in `docs/INTEGRATIONS.md`: check, time, result, what was verified, what was not, fallback chosen if any.
- **Acceptance test:** three rows in INTEGRATIONS.md with real response excerpts (ids only); `.env` has all `JOBBER_*`, `GUSTO_*`, `QBO_*` names filled.
- **Verification:** `grep -c "VERIFIED" docs/INTEGRATIONS.md` ≥ 3; the Jobber query above returns `totalCount`.
- **Time:** 30 min. **Fallback:** Gusto not activating → B builds against the local mock (shared-context 4.3); Jobber tester cap below 12 → Company A becomes 6 field workers plus manager and owner (edit `a.json`); no QuickBooks sandbox access → Excel-export fixtures for Company A's expenses.

### A-02 Fixtures for every table (Company A, v1)
- **Branch:** `a/fixtures-a`
- **Goal:** One JSON file per table in shared-context section 6 so B and C build offline from G0.
- **Priority:** P0. Unblocks everyone.
- **Files:** `data/fixtures/a/company.json`, `workers.json`, `cycles.json`, `syncRuns.json`, `timeEntries.json`, `jobs.json`, `visits.json`, `quotes.json`, `invoices.json`, `payments.json`, `expenses.json`, `rules.json` (the rules onboarding should learn, as the expected output), `answer-key.json`; `data/fixtures/README.md`.
- **Depends on:** B-02 (the contract PR) schema PR for the exact zod file. Safe to start now against shared-context section 6; adjust field names when B-02 (the contract PR) merges.
- **Steps:**
  1. Hand-write `company.json` and `workers.json` (12 workers: W01 to W10 field, incl. W09 and W10 Venmo contractors and W08 salaried crew lead; W11 manager; W12 owner). Fake names from a short list (e.g. "Avery Reed", "Jordan Ellis", "Sam Okafor"); never real ones.
  2. Hand-write one current cycle `a-c05` (biweekly, ending on a Saturday) with ~40 time entries, 6 jobs, 4 visits, 3 quotes, 3 invoices, 2 payments (one deposit on a quote, one final), 8 expenses (5 QuickBooks purchases, 3 Jobber expenses).
  3. Plant 8 errors in this hand-written cycle for the first checks B writes: CHK-01, 02, 03, 04, 05, 10, 11, 14. Write the matching `answer-key.json` rows: `{ "id": "a-ak-01", "checkId": "CHK-04", "subject": { "workerId": "a-w03", "entryIds": ["a-te-0142", "a-te-0143"] }, "truth": "entry a-te-0143 belongs to job a-j04, not a-j02", "correctAnswer": { "kind": "change", "values": { "jobId": "a-j04" } }, "registerCategory": "overlapping hours" }`.
  4. Add `syncRuns.json` with one complete run per source and one incomplete run (`pulled 39, expected 40`) to let B test CHK-23.
  5. `data/fixtures/README.md`: id conventions, how to regenerate (A-04 replaces the hand-written files).
- **Acceptance test:** `bun run packages/engine/src/schemas.validate.ts data/fixtures/a` (B provides this script in B-02 (the contract PR); until then a 10-line zod loop in `seed/validate.ts`) exits 0 for every file.
- **Verification:** `bun run seed/validate.ts data/fixtures/a`
- **Time:** 45 min. **Fallback:** if B-02 (the contract PR) is late, publish the files anyway with the section 6 names; rename fields in a follow-up PR.

### A-03 Jobber connector (read app)
- **Branch:** `a/jobber-connector`
- **Goal:** Pull users, time entries, jobs, visits, quotes, invoices, payments and expenses for a date range into section 6 shapes with completeness checks.
- **Priority:** P0. Pillar: Runs. Criterion: real enough.
- **Files:** `packages/connectors/src/jobber/client.ts` (OAuth refresh, headers, throttling), `queries.ts`, `normalize.ts`, `completeness.ts`, `index.ts`, `cli.ts`, `__tests__/normalize.test.ts`, `__fixtures__/*.json` (recorded responses with ids only).
- **Depends on:** A-01 (token). B-02 (the contract PR) for `SyncRun` shape (use section 6 meanwhile).
- **Safe to start:** `normalize.ts` and tests against recorded responses right away.
- **Steps:**
  1. `client.ts`: `POST https://api.getjobber.com/api/graphql` with `Authorization: Bearer`, `X-JOBBER-GRAPHQL-VERSION: 2026-09-25`, `Content-Type: application/json`. Refresh via `POST https://api.getjobber.com/api/oauth/token` (form-encoded, `grant_type=refresh_token`, `client_id`, `client_secret`, `refresh_token`); **store the rotated refresh token** (rotation is on by default) in Convex env or a local file under `data/private/`; one in-flight refresh at a time. Read `extensions.cost.throttleStatus.currentlyAvailable`; if below 1,500 points, sleep `(2000 - available) / 500` seconds. Treat `THROTTLED` error code (HTTP 200) as retry-after-sleep.
  2. `queries.ts`: cursor pagination `first: 50` on every connection (cost = first × fields, max 100, no `first` means 100). `users(filter: {status: ACTIVATED})` and `users(filter: {status: DEACTIVATED})`; `timeSheetEntries(filter: { startAt: { after, before } }, sort: [{ field: START_AT, direction: ASCENDING }])` requesting `id user { id } job { id } visit { id } startAt endAt finalDuration ticking approved approvedBy { id } payable label timeSheetCategory labourRate createdAt updatedAt` plus `note` only to set `hasNote` (never stored); `jobs`, `visits`, `quotes` (with `salesperson { id } sentAt status amounts`), `invoices`, payment records, `expenses(filter: {...})`.
  3. `completeness.ts`: for time entries, compare `nodes.length` with `totalCount` and with the sum of `User.timeSheetsByDay(startDate, endDate)` totals per user; any mismatch → `SyncRun.complete = false` with the difference in `error`. For other objects, `nodes.length` vs `totalCount`.
  4. `normalize.ts`: Jobber ids → `sourceId`; map `timeSheetCategory`, `approved`, `ticking`; `Payment.kind = "deposit"` when the record is on a quote, `"final"` when on an invoice; `hasNote` boolean only.
  5. `index.ts`: `pullCycle(auth, companyId, periodStart, periodEnd): Promise<{ records, syncRuns }>`; `cli.ts` prints pulled vs expected per object.
  6. Tests: normalizers on recorded fixtures; completeness on a hand-made mismatch.
- **Acceptance test:** against the tester account after A-05, `pullCycle` returns every seeded entry; every `SyncRun.complete = true`; a deliberately deleted entry makes the run incomplete.
- **Verification:** `bun test packages/connectors/src/jobber` and `bun run packages/connectors/src/jobber/cli.ts pull --company a --from 2026-10-11 --to 2026-10-24`
- **Time:** 2.5 h (v1 with users and time entries in 1.5 h by 04:30; the rest by 11:00). **Fallback:** export reader A-08b for timesheets (Jobber emails an Excel copy of the Timesheets report).

### A-04 Seed generator and answer key (Company A)
- **Branch:** `a/seed-generator`
- **Goal:** Generate Company A deterministically: 12 workers, 4 clean-ish past cycles that teach the rules, one current cycle with every planted error, and the answer key.
- **Priority:** P0. Pillars: Learns (past cycles), Runs and Escalates (planted errors). Criterion: proof it works.
- **Files:** `seed/companies/a.json`, `seed/generate.ts`, `seed/lib/{names,random,plant}.ts`, `seed/README.md`, `data/fixtures/a/*` (regenerated), `seed/__tests__/generate.test.ts`.
- **Depends on:** A-02 (shapes). B-02 (the contract PR).
- **Safe to start:** now; the generator replaces the hand-written fixtures.
- **Steps:**
  1. `a.json` config: workers (as A-02), rules to be learnable from history: overtime after 40 h per week at 1.5×; long shift threshold 11 h; expense account kinds (Materials, Equipment Rental, Disposal → job cost; Software, Insurance, Fuel → overhead; Fuel is deliberately ambiguous so onboarding asks); Venmo list (W09 at a rate, W10 with no rate in cycle 5 → CHK-11); commission plan (quote salesperson 5% of job total when the quote was in person); tips split by hours on the job; manager split 10% of job profit for the manager of record; routing (job facts → W11, money → W12); deposit vs final.
  2. Past cycles `a-c01` to `a-c04`: consistent with the rules; a few resolved questions as history (who answered what) so routing can be learned; QuickBooks purchases tagged to jobs correctly.
  3. Current cycle `a-c05` planted errors, one or two per check, seeded RNG so ids are stable: CHK-01 two entries with no job; CHK-02 one ticking entry; CHK-03 a 13 h shift; CHK-04 two overlapping entries for W03 (the demo moment fallback); CHK-05 a zero-minute entry and an exact duplicate; CHK-06 three unapproved entries; CHK-07 W06 active with no hours; CHK-08 a deactivated worker W13 with two entries; CHK-09 a new hire W14 not onboarded in Gusto; CHK-10 W02 rate differs by $1/h between Jobber and Gusto; CHK-11 W10 with no Venmo rate; CHK-12 W08 salaried listed; CHK-13 a job with a completed visit and no entries; CHK-14 a $214.37 materials purchase with no job tag; CHK-15 the same purchase also entered as a Jobber expense; CHK-16 a disposal fee whose description names job a-j04's address but has no parent; CHK-17 a purchase on an account with no kind rule ("Fuel"); CHK-18 a job costed at W02's old rate; CHK-19 a quote deposit counted as the invoice's final; CHK-20 a quote where the salesperson is W12 but the register category says W05 quoted in person; CHK-21 a job with 8% margin; CHK-22 W04 with gross up 60% vs the prior three cycles because of the overlap and the long shift.
  4. `answer-key.json` rows for each, with `registerCategory` from the handoff's category list (no register rows copied).
  5. `generate.ts --company a` writes `data/fixtures/a/*.json` and the key; `--company b` reads `b.json` (A-14). Deterministic: same config, same output; test asserts a hash.
- **Acceptance test:** every CHK-01 to CHK-22 appears at least once in `answer-key.json`; fixtures validate; the generator is deterministic.
- **Verification:** `bun run seed/generate.ts --company a && bun run seed/validate.ts data/fixtures/a && bun test seed`
- **Time:** 2 h (v1 by 05:00, complete by 11:00). **Fallback:** keep the hand-written A-02 fixtures and extend them by hand for the missing checks.

### A-05 Push Company A into Jobber (write app)
- **Branch:** `a/push-jobber`
- **Goal:** Company A exists in the real Jobber tester account with our ids recoverable.
- **Priority:** P0. Criterion: real enough ("in the real tools' sandboxes").
- **Files:** `seed/push-jobber.ts`, `seed/lib/jobber-mutations.ts`, `seed/README.md` (manual steps).
- **Depends on:** A-01 (seed app token, user cap known), A-04 (fixtures). H1 user cap **UNVERIFIED**.
- **Safe to start:** mutation strings and dry-run mode against fixtures now.
- **Steps:**
  1. **Manual first (print a checklist):** add the 12 workers as users in the tester account UI (Settings → Manage Team) with the fake names; the pusher then reads `users` and maps by name to `a-wNN`. If the cap is below 12, use the reduced config from A-01's fallback.
  2. Order: `clientCreate` → `propertyCreate` → `jobCreate(propertyId, invoicing, salespersonId)` → `visitCreate` (assigned users, startAt/endAt) → `timeSheetEntryCreate({ startAt, duration, userId, jobId | visitId | label, labourRate, note: "paycheck:a-te-0142" })` → `expenseCreate({ title, date, total, reimbursableToId, linkedJobId })` → `quoteCreate({ clientId, propertyId, lineItems, salespersonId })` → `invoiceCreate` / `invoiceCreateFromJob` → `invoiceCreatePaymentRecord` and `quoteCreatePaymentRecord` (deposits). Field names verified by introspection (research section 10); check argument shapes in GraphiQL **on the seed app only**.
  3. Idempotent: before creating, query by our marker (`note` on entries, `title` prefix on expenses, `jobNumber` mapping file `data/private/a-jobber-map.json`). Re-running creates nothing new.
  4. Past cycles: create entries with past `startAt`; **UNVERIFIED** whether the API accepts entries far in the past; test one before the batch.
  5. Print the second manual checklist: approve all but the three CHK-06 entries (Timesheets → Approve Timesheets, cutoff slider), leave the CHK-02 timer ticking (`timeSheetClockIn` for W05 just before the pull, or a manual timer), deactivate W13 after the entries exist.
  6. Rate limits: 10,000 points, 500/s restore; mutations cost per field; batch 20 per request and sleep on `throttleStatus`.
- **Acceptance test:** A-03 `pullCycle` on the tester account returns the same entry count as `data/fixtures/a/timeEntries.json` for cycle 5, with `approved` false on exactly the CHK-06 entries and `ticking` true on exactly one.
- **Verification:** `bun run seed/push-jobber.ts --company a --dry-run` then `bun run seed/push-jobber.ts --company a` then `bun run packages/connectors/src/jobber/cli.ts pull --company a --from … --to … --compare data/fixtures/a`
- **Time:** 1.5 h plus 20 min of manual UI steps. **Fallback:** if a mutation is missing from the seed app's scopes, tick it and re-authorize the seed app (not the read app); if past-dated entries are refused, shift Company A's calendar so cycle 1 starts the day the tester account was created and pull only what exists; if the tester account cannot hold the data, run the hero path on fixtures loaded directly into Convex and label Jobber "simulated" in `docs/PROOF.md`.

### A-06 Push Company A expenses into the QuickBooks sandbox
- **Branch:** `a/push-qbo`
- **Goal:** Company A's purchases and bills exist in the sandbox with job tags where the config says so.
- **Priority:** P0. Criterion: real enough; pillar Runs (CHK-14 to CHK-17).
- **Files:** `seed/push-qbo.ts`, `seed/lib/qbo.ts`.
- **Depends on:** A-01 (H3 tokens), A-04.
- **Steps:**
  1. Create sub-customers for jobs: `POST /v3/company/{realmId}/customer` with `Job: true`, `ParentRef` to a Company A customer, `DisplayName` = job number. Record the mapping in `data/private/a-qbo-map.json`.
  2. `POST /v3/company/{realmId}/purchase` per expense: `PaymentType` CreditCard, `AccountRef` (bank/card account from the sandbox chart), `TxnDate`, `PrivateNote: "paycheck:a-ex-0007"`, lines `AccountBasedExpenseLineDetail` with `AccountRef` (Materials, Equipment Rental, Disposal, Fuel, Software), `CustomerRef` to the sub-customer when tagged, none for CHK-14. Bills for two vendor invoices.
  3. Idempotent via `SELECT * FROM Purchase WHERE PrivateNote LIKE 'paycheck:%'`; delete with `?operation=delete` on re-seed. Never "Clear data and reset".
  4. Respect 10 requests/s; sleep on 429 for 60 s.
- **Acceptance test:** `SELECT count(*) FROM Purchase WHERE TxnDate >= '<cycle start>'` equals the fixture count; the CHK-14 purchase has no `CustomerRef`.
- **Verification:** `bun run seed/push-qbo.ts --company a && bun run packages/connectors/src/qbo/cli.ts pull --from … --to … --compare data/fixtures/a`
- **Time:** 1 h. **Fallback:** load `expenses.json` straight into Convex via B's fixture loader and label QuickBooks "export" in PROOF.md.

### A-07 Map Company A onto the Gusto demo company
- **Branch:** `a/push-gusto`
- **Goal:** Each Company A worker maps to a Gusto demo employee or contractor with the rates the config needs; W10 and W09 are contractors; W14 is not onboarded.
- **Priority:** P0. Pillar: Runs (CHK-09, 10, 12), gate 1 fill.
- **Files:** `seed/push-gusto.ts`, `data/private/a-gusto-map.json`, `data/fixtures/a/workers.json` (gusto block filled).
- **Depends on:** A-01 (H2). **UNVERIFIED:** whether compensations can be updated by API in demo, and whether a demo company can add employees quickly.
- **Steps:**
  1. `GET /v1/companies/{c}/employees?include=all_compensations` and `GET /v1/companies/{c}/contractors`. Assign existing demo employees to `a-w01`…`a-w08`, `a-w11`, `a-w12` by order; record uuids in the map and in `workers.json` `gusto` block.
  2. Set rates to match `a.json` where the API allows (`PUT /v1/compensations/{id}` with `rate`, `payment_unit: "Hour"`, `flsa_status: "Nonexempt"`; W08 `payment_unit: "Year"`, `flsa_status: "Exempt"`). W02's Gusto rate deliberately differs from Jobber by $1/h (CHK-10).
  3. Contractors W09 and W10: `POST /v1/companies/{c}/contractors` (type Individual, `wage_type: Hourly`) if the demo allows; otherwise mark them `gusto: null` and `payType: contractor_venmo` (they are never sent to Gusto anyway).
  4. W14 new hire: `POST /v1/companies/{c}/employees` without finishing onboarding so `onboarded = false` (CHK-09). If creation is blocked, pick an existing demo employee whose `onboarding_status` is not complete.
  5. Note the unprocessed regular payroll uuid covering cycle 5 in `cycles.json` (`gustoPayrollId`) for B's writer.
- **Acceptance test:** A-08 `pullEmployees` returns a uuid for every non-Venmo worker; W02 shows the rate mismatch; W14 shows `onboarded = false`; one unprocessed regular payroll exists.
- **Verification:** `bun run seed/push-gusto.ts --company a && bun run packages/connectors/src/gusto/cli.ts employees --company a`
- **Time:** 1 h. **Fallback:** keep the demo company's own employees and rates, and move the CHK-10 mismatch to the Jobber side (change the Jobber `labourRate` instead).

### A-08 QuickBooks and Gusto read connectors, export readers
- **Branch:** `a/qbo-gusto-read`
- **Goal:** Pull expenses and Gusto employees, compensations and payrolls into section 6 shapes with completeness; read the three export formats for Company R.
- **Priority:** P0 (API readers), P0 for the Jobber Timesheets Excel and Gusto Payroll Journal CSV readers (Company R depends on them), P1 for QuickBooks Excel.
- **Files:** `packages/connectors/src/qbo/{client,queries,normalize,index,cli}.ts`, `packages/connectors/src/gusto/{client,read,normalize,cli}.ts`, `packages/connectors/src/exports/{jobber-timesheets-xlsx,qbo-xlsx,gusto-payroll-journal-csv}.ts`, tests and recorded fixtures.
- **Depends on:** A-01. B-02 (the contract PR).
- **Steps:**
  1. QuickBooks: `intuit-oauth` (4.2.5, official) for token refresh; queries `SELECT * FROM Purchase WHERE TxnDate >= '…' AND TxnDate <= '…' STARTPOSITION 1 MAXRESULTS 1000`, same for `Bill`; completeness `SELECT count(*) FROM Purchase WHERE …` → `QueryResponse.totalCount`. Normalize: line-level `CustomerRef` → `customerRef`, `AccountRef.name` → `accountName`, `PaymentType`, `PrivateNote` → our `sourceId` when it carries the marker. One `Expense` per line with a job tag; header-only when no lines are tagged.
  2. Gusto read: company token refresh; `pullEmployees` (employees + `GET /v1/jobs/{j}/compensations` for rate, `payment_unit`, `flsa_status`), `pullContractors`, `pullPayrolls(processed=true)` for history (onboarding and M4), `pullUnprocessed()`. Completeness: employee count vs `GET /v1/companies/{c}` totals where available; else record `expected = null` and `complete = true` only when the pagination ended.
  3. Export readers: Jobber Timesheets "Receive Excel Copy" (decimal hours; columns to confirm on the first real file), QuickBooks Export to Excel (zip of workbooks; read Purchases sheet), Gusto Payroll Journal CSV (per-employee gross by type). Each returns the same section 6 shapes plus a `SyncRun` with `source: "export"` and `method` naming the file; completeness = rows parsed vs rows in file.
- **Acceptance test:** Company A expenses pulled from the sandbox equal the fixture count with `complete = true`; Gusto employees map to all non-Venmo workers; each export reader parses a sample file in `data/private/` (not committed) and a tiny synthetic sample in `__fixtures__/` (committed).
- **Verification:** `bun test packages/connectors` and the two `cli.ts pull --compare` commands.
- **Time:** 2 h. **Fallback:** fixtures loaded directly; PROOF.md says so.

### A-09 Company R ingest and anonymizer
- **Branch:** `a/company-r-ingest`
- **Goal:** The real company's three past cycles (and later the current one) in Convex with fake names, ids only to the model, and the pseudonym map kept private.
- **Priority:** P0. Criterion: real enough (real data, real errors); the moment.
- **Files:** `packages/connectors/src/anonymize.ts`, `packages/connectors/src/anonymize.test.ts`, `seed/ingest-r.ts`, `data/private/r/` (exports, pseudonym map; gitignored), `docs/PROOF.md` section "Company R".
- **Depends on:** A-03 (Jobber read against the real account: authorize "PayCheck (Dev)" on the real account via the app's own OAuth flow, **not** GraphiQL), A-08 export readers (QuickBooks Excel, Gusto Payroll Journal).
- **Steps:**
  1. `anonymize.ts`: deterministic pseudonyms from a seeded generator keyed by `sha256(realName + salt)`; map stored at `data/private/r/pseudonyms.json`; drops `note`, addresses, client names (clients become `Client C07`), phone numbers; keeps dates, durations, amounts, job numbers (renumbered), approval states.
  2. `ingest-r.ts`: pull the three past cycles through the Jobber connector (read-only), anonymize, write via B's fixture loader into company `r`; read the Gusto Payroll Journal CSVs for the same periods into `data/private/r/paid/*.csv` (never Convex: only aggregate gross per pseudonymous worker enters Convex, for M4); QuickBooks Excel export for expenses.
  3. Verify no real string survives: a test runs the anonymizer over the private export and greps the output for every token in the pseudonym map's keys.
  4. PROOF.md: "Company R: 3 past pay periods, N workers, M time entries, read through the Jobber API and two exports; anonymized at ingest; real errors from the owner's records" (counts only).
- **Acceptance test:** `grep -rF -f data/private/r/real-tokens.txt data/fixtures/ apps/ packages/ seed/ eval/ docs/` returns nothing; Convex company `r` shows three cycles with `SyncRun.complete = true`.
- **Verification:** `bun test packages/connectors/src/anonymize.test.ts && bun run seed/ingest-r.ts --cycles 3 --dry-run` (dry run prints counts only).
- **Time:** 1.5 h. **Fallback:** Jobber Timesheets Excel export for Company R instead of the API (the real account's OAuth needs the Vercel callback or localhost; both are allowed).

### A-10 Stage 1 payroll math and workbook lines
- **Branch:** `a/payroll-stage1`
- **Goal:** `computeStage1` turns entries, workers and active rules into `Draft.lines` to the cent with an arithmetic trail per worker.
- **Priority:** P0. Pillar: Runs; criterion "would you hire it" (to the cent, never guesses).
- **Files:** `packages/engine/src/payroll/{stage1,hours,overtime,rates,venmo,salaried,reimbursements,explain}.ts`, `packages/engine/src/payroll/__tests__/stage1.golden.test.ts`, `packages/engine/src/payroll/__golden__/a-c05.json`.
- **Depends on:** B-02 (the contract PR) schemas. Nothing else; pure functions.
- **Safe to start:** immediately against fixtures.
- **Steps:**
  1. Hours: sum `durationSec` per worker per workweek (company timezone, week boundary from the rule), excluding `BREAK`, excluding entries whose flags are `held` (passed in as `heldEntryIds`), never trimming, never assuming breaks.
  2. Overtime from the `overtime_policy` rule (`{ weeklyHours: 40, multiplier: 1.5, dailyHours?: null }`); regular and overtime hours as decimals rounded to 0.01 only at the Gusto line, cents computed from unrounded seconds × rate then rounded half-up once.
  3. Rates: `pay_rate` rule per worker overrides Gusto rate; a worker with no rate anywhere → the line is `excluded: true` with `heldFlagIds` and a `CHK-11`-style reason in `explain`; never a default rate.
  4. Venmo contractors: computed the same way, listed in `Draft.venmoList` (add this optional field to `Draft` via a `contract:` PR with B if not present), never in Gusto lines.
  5. Salaried: fixed per-period amount from the compensation (`rateCents` / periods per year), hours listed for information only.
  6. Reimbursements: Jobber expenses with `reimbursableTo` and `paymentStatus PENDING_REIMBURSEMENT` → fixed `Reimbursement`.
  7. `explain[]`: one line per step per worker ("W03: 44.50 h in week 1 → 40 regular + 4.50 OT at 1.5× of 2800¢ = …").
  8. Golden test: `a-c05` expected lines hand-computed in the golden file; a second golden for a week-boundary case and a held-entry case.
- **Acceptance test:** golden tests pass; a worker with no rate yields `excluded: true` and no amount; removing a held entry changes exactly that worker's line.
- **Verification:** `bun test packages/engine/src/payroll`
- **Time:** 2 h. **Fallback:** none needed; if OT rules get complicated, support only the weekly rule and record daily OT as P2.

### A-11 Eval scripts M1 to M6 and results.json
- **Branch:** `a/eval`
- **Goal:** Measured numbers for the readiness screen, PROOF.md and the pitch.
- **Priority:** P0. Criterion: proof it works ("planted errors with an answer key").
- **Files:** `eval/run.ts`, `eval/m1-planted.ts`, `eval/m2-rules.ts`, `eval/m3-questions.ts`, `eval/m4-backtest.ts`, `eval/m5-completeness.ts`, `eval/m6-traceability.ts`, `eval/results.json`, `eval/README.md`.
- **Depends on:** B's `eval.summary` query (flags, rules, cycles, syncRuns, audit events for a company) or a Convex export; A-04 answer key; A-12 for M4.
- **Safe to start:** against fixtures plus a hand-made `flags.json` now.
- **Steps:**
  1. M1: for Company A cycle 1 (`a-c05` first run), join `Flag` rows to answer-key rows on `checkId` and overlapping subject ids. Recall and precision per check and overall; list every unmatched flag (false positive candidates) and every missed key row.
  2. M2: `data/private/r/rule-grading.json` maps each learned rule id for Company R to a runbook rule id and a verdict (match, differs, not learned); the script emits only counts. The runbook never enters the repo.
  3. M3: `Cycle.questionsAsked` for the two Company A runs plus the per-check breakdown.
  4. M4: from A-12.
  5. M5: share of `SyncRun.complete`, list of blocked objects. M6: share of flags with ≥1 `where` ref and a rule id or model call id in the audit log.
  6. `results.json` schema: `{ generatedAt, gitSha, company, cycle, m1: {...}, m2: {...}, ... }`; C's readiness screen reads it through B's `eval.summary` or a committed copy.
- **Acceptance test:** `results.json` validates; M1 precision is reported from real flags, not fixtures, by G3.
- **Verification:** `bun run eval/run.ts --company a --cycle a-c05 && cat eval/results.json | head -40`
- **Time:** 1.5 h. **Fallback:** if `eval.summary` is late, export Convex tables with `npx convex export` and read the JSONL.

### A-12 Company R backtest to the cent (M4)
- **Branch:** `a/backtest-r`
- **Goal:** Stage 1 gross per worker computed by the engine on one past Company R cycle equals what was actually paid.
- **Priority:** P0. Criterion: would you hire it.
- **Files:** `eval/m4-backtest.ts`, `data/private/r/paid/` (never committed), `docs/PROOF.md` section "Backtest".
- **Depends on:** A-09, A-10, B's onboarding having proposed Company R's rules (or A's hand-entered `rules.json` for R as "stated by owner", labelled so).
- **Steps:**
  1. Pick the cleanest past cycle (the one with the fewest register categories of its kind). Load its entries and the rules.
  2. `computeStage1` → gross per pseudonymous worker; compare to the Gusto Payroll Journal CSV for the same period (aggregate gross by worker, pseudonymized through the same map).
  3. Report exact matches, count within $1, max difference, and for each difference the `explain[]` trail so the cause can be named (a correction applied after the fact, a rate change mid-cycle). Differences caused by corrections that the owner made before paying are expected: the backtest's second line applies the register's corrections (as `Correction` records) and recomputes.
- **Acceptance test:** M4 in `results.json` with N exact matches of M; every difference has an `explain` trail.
- **Verification:** `bun run eval/m4-backtest.ts --company r --cycle r-c02`
- **Time:** 1 h. **Fallback:** report "pre-correction" and "post-correction" match counts separately; if the paid export cannot be obtained tonight, report the backtest as "pending" and do not claim it.

### A-13 Stage 2 math and reconciliation report
- **Branch:** `a/payroll-stage2`
- **Goal:** Job profit, commissions, tips and the manager split from the reconciled workbook, with the low-profit reasons and stale-rate detection inputs for CHK-18 to CHK-21.
- **Priority:** P0 for the math and the report (most real errors matter through profit); the off-cycle draft fill is B's P1.
- **Files:** `packages/engine/src/payroll/{reconcile,profit,commissions,tips,managerSplit,stage2}.ts`, `__tests__/stage2.golden.test.ts`, `__golden__/a-c05-stage2.json`.
- **Depends on:** A-10; B's matching output (`Expense.matchedJobId`, `Payment.kind`).
- **Steps:**
  1. `reconcile`: per job, invoice total, payments by kind (deposit vs final), labor cost = Σ hours × rate at the time (flag `stale_rate` when a stored costing rate differs from the current rule), job-cost expenses by `matchedJobId`, overhead to the cycle total.
  2. `profit = invoice − labor − jobCost`; margin; low-profit flag input when below the threshold rule, with reason hints computed deterministically: unmatched expense candidates on the same dates, unlinked disposal, stale rate.
  3. `commissions`: from the `commission_plan` rule (`{ pct, basis: "job_total" | "profit", onlyInPerson: true }`) and the `in_person_quoter` rule's answer per quote; no rule → no commission line and a question (CHK-20 input).
  4. `tips`: from the `tip_policy` rule (split by hours on the job or equal split); `managerSplit`: pct of profit for the manager of record.
  5. `computeStage2` → `Draft` stage 2 with fixed lines `Commission`, `Cash Tips` / `Paycheck Tips`, `Bonus` (manager split) and `explain[]`.
- **Acceptance test:** golden tests; changing one expense's `matchedJobId` changes exactly one job's profit and the dependent commission.
- **Verification:** `bun test packages/engine/src/payroll`
- **Time:** 2 h. **Fallback:** ship profit and the low-profit flag; mark commissions and tips "computed, not drafted" if the rules are still proposed.

### A-14 Company B seed (P1)
- **Branch:** `a/seed-b`
- **Goal:** A 30-worker HVAC company paid weekly with different rules, to show the engine is shared and rules are learned.
- **Priority:** P1. Criterion: did we see something new (generalizes).
- **Files:** `seed/companies/b.json`, `data/fixtures/b/*`, pusher runs with `--company b` (Jobber: a second tester account or the same one with a prefix; QuickBooks: a second sandbox; Gusto: a second demo company).
- **Depends on:** A-04, A-05 to A-07.
- **Steps:** config with daily OT after 8 h, commission on profit, no tips, a different expense chart; fewer planted errors (8). Push; pull; run onboarding; show both companies on the dashboard.
- **Acceptance test:** onboarding proposes B's OT rule, not A's; M1 on B above 0 with precision reported.
- **Verification:** `bun run seed/generate.ts --company b && bun run seed/push-jobber.ts --company b`
- **Time:** 1.5 h. **Fallback:** fixtures only, labelled synthetic without sandboxes.

### A-15 Playwright reader fallback (P1)
- **Branch:** `a/readers-playwright`
- **Goal:** A saved Playwright script reads the Jobber Timesheets report with a stored login, to show a second access method and to cover an API gap.
- **Priority:** P1. Criterion: real enough (more than one access method); Apify Actor is P2 on top.
- **Files:** `packages/connectors/src/readers/jobber-timesheets.ts`, `readers/README.md`, `data/private/jobber-storageState.json` (gitignored).
- **Depends on:** A-05 (data to read). H8.
- **Steps:** `bunx playwright codegen --save-storage data/private/jobber-storageState.json https://secure.getjobber.com` once by hand; script loads the state, opens Insights → Reports → Timesheets for the period, reads the table or triggers "Receive Excel Copy", parses with the A-08 reader, emits `SyncRun` with `source: "browser"`. Stagehand local only if a selector breaks.
- **Acceptance test:** the reader's entry count equals the API pull for the same period.
- **Verification:** `bun run packages/connectors/src/readers/jobber-timesheets.ts --from … --to …`
- **Time:** 1 h. **Fallback:** Browser Use Cloud (worked Oct 20 on the real account).

### A-16 Live run on the current real cycle (stretch, the moment)
- **Branch:** none (operational), plus `docs/PROOF.md` and `docs/DEMO.md` lines.
- **Goal:** Run PayCheck on Company R's current cycle and catch the known double-booked hours live, before any draft is filled.
- **Priority:** P2 unless G3 is met on time; then it becomes the video's opening.
- **Depends on:** A-09 on the current cycle, B's checks, C's recording setup. Gusto for Company R is **never** written (no partner access, and it is real payroll): the Gusto step is shown on Company A only.
- **Steps:** pull the current cycle read-only; anonymize; run `checks.run`; confirm CHK-04 fires on the known overlap; record the screen; the question goes to Shanin's own phone as the manager stand-in.
- **Acceptance test:** the overlap flag shows the two entries with their Jobber ids and the precedent note.
- **Time:** 45 min. **Fallback:** the planted overlap in Company A, labelled synthetic.

---

## 7. Risks and fallbacks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Tester account user cap below 12 (**UNVERIFIED**) | medium | H1 checks it first; `a.json` has a `--small` variant with 6 field workers; all planted errors still fit |
| Past-dated timesheet entries refused by the API (**UNVERIFIED**) | medium | test one in A-05 step 4 before the batch; shift the calendar or load past cycles into Convex directly from fixtures and label them |
| Gusto demo activation delayed (**UNVERIFIED**) | medium | started first at 01:45; B's mock; Gusto labelled simulated until real |
| GraphiQL use invalidates the app's refresh token | certain if repeated | GraphiQL once per account, then the app's own OAuth only |
| Jobber throttling during pushes | medium | batch 20 mutations, watch `throttleStatus`, sleep |
| Real names leak from Company R | low, high impact | anonymizer test greps the repo for every real token; pseudonym map and exports only under `data/private/`; PR reviewer checks `git diff --stat` for `data/private` |
| Backtest differs from paid amounts | high (corrections happened before paying) | report pre- and post-correction match counts; never claim what was not measured |
| A is the only person who can touch Company R | certain | do Company R work during A's awake hours; snapshot results into Convex before sleeping |
| Time: A has the most tickets | high | cut order inside A: A-14, A-15, A-16 first; then A-13 commissions and tips (keep profit); never cut A-02, A-04, A-05, A-10, A-11 |

---

## 8. Definition of done at each gate

**G0 (03:00):** fixtures for every table merged and validating; answer-key v1 with 8 planted errors; INTEGRATIONS.md rows for H1, H2, H3; Jobber tester account authorized once via GraphiQL; seed app created; Gusto org created and demo company requested; QuickBooks credentials in the shared `.env`.

**G1 (13:00):** Company A pushed to Jobber, QuickBooks and Gusto with manual steps done; `pullCycle` returns every seeded record with `complete = true` for every `SyncRun`; Company R's three past cycles in Convex, anonymized, with the grep test passing; `seed/README.md` manual checklist written.

**G2 (18:00):** `computeStage1` golden tests green; B fills a Gusto draft from A's `Draft.lines`; the workbook screen shows A's `explain[]` trail; one incomplete sync demonstrably blocks only its objects.

**G3 (23:00):** `eval/results.json` with M1, M3, M5, M6 from real flags and M4 from the backtest (pre- and post-correction); M2 aggregates from the private grading sheet; Stage 2 report rendering on Company A; `docs/PROOF.md` v1 stating what is real, simulated, and how we know.

**Freeze (Sun 06:30):** final `eval/run.ts` on `main`, PROOF.md final with timestamps and git SHA, Company A snapshot at cycle 2 restorable, judge-scenario inputs ready (an unseen expense type and an unseen worker), phone charged and registered.
