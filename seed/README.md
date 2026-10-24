# seed/

Synthetic company configs, the deterministic generator, the answer key, and (A-05..A-07) the pushers into Jobber, QuickBooks and Gusto. Owner: A. Everything here is synthetic: fake display names, fake streets and vendors, no phone numbers, no secrets.

```bash
cd seed && bun install && cd ..
bun run seed/generate.ts --company a        # writes data/fixtures/a/*.json (15 files)
bun run seed/validate.ts data/fixtures/a    # zod mirror of shared-context section 6; exits 0 only if all valid
bun test seed                               # determinism hash, committed fixtures == output, coverage, clean past
```

## Files

| Path | What |
|---|---|
| `companies/a.json` | Company A config: workers and rates (with raise history), cycles, holidays, past-cycle patterns, the current cycle's schedule, jobs, quotes, invoices, payments, expenses, pinned v1 ids, the rules onboarding should learn |
| `generate.ts` | builds past cycles a-c01..a-c04 from the patterns, the current cycle a-c05 from the schedule, applies the plants, costs jobs, writes fixtures |
| `lib/plant.ts` | planted errors in a-c05 and the answer-key rows (CHK-01..CHK-22) |
| `lib/random.ts` | seeded RNG (mulberry32 over an FNV-1a hash of `seed:<cycle>`) |
| `lib/names.ts` | fake streets, job kinds, vendors |
| `lib/time.ts` | local wall time to UTC per zone (A: America/New_York, EDT until 2026-11-01 then EST; B: America/Los_Angeles), working days, Friday cutoff |
| `validate.ts` | the validator (replaced by `packages/engine/src/schemas.ts` once B-02 lands) |
| `__tests__/generate.test.ts` | tests; `EXPECTED_SHA256_A` changes only when the config or generator changes on purpose |

## What the past cycles teach (onboarding should propose `data/fixtures/a/rules.json`)

- **Overtime after 40 h/week at 1.5x**: a-w01 works 42.5 h weeks every cycle; `pastPayrolls.json` shows Regular Hours and Overtime split weekly.
- **Pay rates** from what was paid: a-w02 $25.00/h then $26.00/h from a-c04; a-w08 $62,400/yr then $67,600/yr from a-c04.
- **Expense account kinds**: Materials, Equipment Rental, Disposal always tagged to jobs (job cost); Software, Insurance never (overhead). **Fuel is ambiguous** (one tagged, one not, every cycle), so no rule; onboarding should ask.
- **Venmo list**: a-w09 paid by Venmo at $25.00/h (`paidVia: "venmo"`). a-w10 is new in a-c05 with no rate.
- **In-person quoter and commission**: landscape lighting jobs are quoted in person by a-w05, who gets 5% of the job total (off-cycle Commission).
- **Tips** split by hours on the job (a-c03, one $150 tip, off-cycle Paycheck Tips / Venmo Cash Tips).
- **Manager split**: a-w11 gets 10% of the cycle's job profit (off-cycle Bonus). Profit uses Jobber job costing: hours x Jobber labour rate + job-cost expenses, including linked disposal sub-jobs.
- **Disposal sub-jobs** ("Disposal run - <street>") are linked to the parent job on the same street (a-c02, a-c04).
- **Routing**: `questions.json` holds the past questions; job facts went to a-w11, money to a-w12.
- **Deposits vs finals**: jobs over $3,000 take a 30% deposit on the quote; the invoice gets the remainder as the final.

Past cycles are clean: every entry approved, on a job, 8.5 to 9.25 h, no overlaps; every job-cost purchase is tagged; job margins about 30 to 45%.

## Planted in a-c05

See the table in `data/fixtures/README.md`. Plants live in `lib/plant.ts` (entries and expenses added or marked) and `companies/a.json` (worker settings, schedule gaps, jobs, quotes).

## Ids

New ids never reuse v1 (#1) ids. v1 a-c05 time entries `a-te-0101..0140` are pinned in `a.json` (`current.pinnedEntryIds`, key `workerId|startAt`); new a-c05 entries count up from `a-te-0141` in start-time order. Past entries are `a-te-<cycle><nnn>` (a-te-1001...), past expenses `a-ex-<cycle><nnn>`, past jobs `a-j11+`, visits `a-v11+`, quotes `a-q11+`, invoices `a-in11+`, payments `a-pay11+`, past payrolls `a-pp-<cycle><nn>`, past questions `a-qn-NN`.

## Pushers (A-05..A-07)

Each pusher is a dry run unless given `--live`. A dry run reads only the fixtures (and the id map, if present), makes no network call and reads no credentials.

### Jobber (A-05): `push-jobber.ts`, `lib/jobber-mutations.ts`, `lib/jobber-seed-client.ts`

```bash
bun run seed/push-jobber.ts --company a [--verbose]      # plan: counts per object, mutations, both manual checklists
# live, once the seed account and the "PayrollPilot Seed" app exist (needs JOBBER_SEED_CLIENT_ID / _SECRET / _ACCOUNT_ID):
bun run seed/push-jobber.ts auth-url                      # a person opens the URL as the seed account admin (callback https://payrollpilot.vercel.app/auth)
pbpaste | bun run seed/push-jobber.ts auth-code           # paste the WHOLE redirected address (stdin or PASTED_URL); state is checked
                                                          # stores data/private/jobber-seed-tokens.json (not the read app's token)
bun run seed/push-jobber.ts --company a --live --one      # step 4: one past-dated entry plus what it needs; check it in Jobber
bun run seed/push-jobber.ts --company a --live            # the rest; rerunnable
```

- **Safety:** live mode queries `account { id name }` and refuses unless the id equals `JOBBER_SEED_ACCOUNT_ID` (the free-trial seed account). The live schema has no `Account.tester`, so there is no other way in and no "any account" fallback; the refusal prints the id and name to copy into `.env`. Before writing anything it checks that every mutation it needs exists in the live schema and stops if one is missing. Writes go only to `api.getjobber.com` with the seed app's token. Never uses GraphiQL on the read app.
- **Order:** clients, properties, quotes, jobs (linked to their quote), visits, visit completes, time entries, Jobber expenses, invoices (from job), mark sent, payment records (quote deposits on the quote; the CHK-19 deposit on the invoice).
- **Idempotent:** every record carries `payrollpilot:<id>` (entry note, title, company name, invoice subject, payment details). Before writing, live mode looks up existing markers in the account. The id map `data/private/<company>-jobber-map.json` is saved after every create. A rerun creates only what is missing.
- **Not pushed:** the open timer (a-te-0140), which has to be started by hand just before the pull; tip payments (history only); QuickBooks purchases (A-06). `labourRate` is not sent per entry: Jobber costs entries at the user's labour rate, set by hand in Manage Team.
- **Manual steps** (printed by the dry run): before the push, add every worker in Manage Team with the exact display name. After the push, approve all but the CHK-06 entries, start the CHK-02 timer, and deactivate a-w13.
- **Live schema (read-app introspection, Oct 24):** clientCreate, propertyCreate, quoteCreate, jobCreate, visitCreate (schedule with local date/time/timezone), visitComplete, expenseCreate and invoiceMarkAsSent(id) are verified and match the plan. **timeSheetEntryCreate, invoiceCreateFromJob, invoiceCreatePaymentRecord and quoteCreatePaymentRecord are not in the live schema**, so time entries and payments cannot be pushed by API as written; live mode stops before writing. `User.labourRate` and `Expense.accountingCode` do not exist live; the pusher reads neither and sends no `labourRate`.
- **Formerly UNVERIFIED input shapes** (names are verified by introspection; see the comments in `lib/jobber-mutations.ts`): clientCreate, propertyCreate, quoteCreate line items, jobCreate `invoicing`, visitCreate argument placement, invoiceCreateFromJob, payment-record enums. Check them once in GraphiQL on the seed app, or let `--one` surface the error; the run stops on the first `userErrors`.

### QuickBooks (A-06): `push-qbo.ts`, `lib/qbo.ts`

```bash
bun run seed/push-qbo.ts --company a [--verbose]       # plan: accounts, vendors, customers, job sub-customers, purchases, bills
# live, once H3 gives sandbox credentials (QBO_CLIENT_ID / QBO_CLIENT_SECRET / QBO_REALM_ID):
bun run seed/push-qbo.ts init-token <refresh token>    # OAuth Playground, sandbox; stored in data/private/qbo-seed-token.json
bun run seed/push-qbo.ts --company a --live            # creates what is missing; rerunnable
bun run seed/push-qbo.ts --company a --live --reseed   # deletes OUR Purchases/Bills by API first, then pushes
```

- **Host:** `sandbox-quickbooks.api.intuit.com` only. Every URL is built in one function that refuses any other host.
- **What is created:**
  - Accounts and vendors are looked up by name and created only if missing.
  - One parent customer per client, and one sub-customer per job (`Job: true`, `DisplayName` = job number, marker in `Notes`). A name match without our marker is refused, never adopted.
  - One Purchase per QuickBooks expense (CreditCard, from the "Company A Card (payrollpilot)" account), with the expense account on the line and `CustomerRef` only when the fixture is job-tagged. a-ex-0003 (CHK-14) has none.
  - Bills for two vendor invoices: the first two past-cycle Equipment Rental expenses. The current cycle's Purchase count therefore equals the fixtures (6).
- **Idempotent:** our marker `payrollpilot:<id>` is in `PrivateNote`. Live mode scans the fixture date range for marked Purchases and Bills (PrivateNote is not filterable in a query) and maps them before creating anything. The id map is `data/private/<company>-qbo-map.json`.
- **Re-seed:** deletes only marked Purchases and Bills, one by one with `?operation=delete` (`Id` + `SyncToken`). Customers, vendors and accounts are reused. Never "Clear data and reset".
- **Limits:** at most 10 requests/s; on a 429 it sleeps 60 s.
- **Token file:** separate from the read connector's `qbo-token.json`. If both are initialized from the same Playground authorization, refreshing one may rotate the other's token. Authorize twice, or refresh only one.

### Gusto (A-07): `push-gusto.ts`, `lib/gusto.ts`

```bash
bun run seed/push-gusto.ts --company a                # plan: who maps to what, compensations, new hire, payroll lookup
# live, once A1's Gusto token exists (GUSTO_CLIENT_ID / GUSTO_CLIENT_SECRET; `packages/connectors/src/gusto/cli.ts auth`):
bun run seed/push-gusto.ts --company a --live         # writes data/private/a-gusto-map.json
bun run seed/push-gusto.ts --company a --apply-map    # copies the uuids into seed/companies/a.json (gustoIds, current.gustoPayrollId)
bun run seed/generate.ts --company a                  # fixtures now carry the real uuids; update EXPECTED_SHA256_A
```

- **Host and auth:** `api.gusto-demo.com` only, with `X-Gusto-API-Version: 2026-06-15`. Reads go through A1's read-only `GustoClient`. Writes go through `GustoSeedWriter`, which shares A1's token file `data/private/gusto-token.json` and refreshes only through A1's client, so there is one rotation path. Nothing is taken from B's `gusto/write*`.
- **Write allowlist:** `PUT /v1/compensations/{uuid}`, `POST /v1/companies/{c}/employees`, `POST /v1/employees/{uuid}/jobs`. Any path containing "payroll" is refused before a request. There is no prepare, update, calculate or submit. The payroll is only read, to record `gustoPayrollId`.
- **Mapping:** the demo company comes from the token (`/v1/token_info`), never from its name. Onboarded, non-terminated demo employees are assigned in uuid order to a-w01..a-w08, a-w11, a-w12, a-w13. a-w14 is created (plus a job) with onboarding left unfinished (CHK-09); if that is refused, it falls back to an existing employee with unfinished onboarding. a-w09 and a-w10 (Venmo) are never sent to Gusto (`gusto: null`). Rates come from the config only; a null rate leaves the demo compensation alone. a-w02 is $25.00 against Jobber's $26.00 (CHK-10).
- **Fixtures stay generated:** real uuids enter through the config (`--apply-map`), never by editing `data/fixtures`.

## Company B (A-14): `companies/b.json`, `lib/company-b.ts`

`bun run seed/generate.ts --company b` writes `data/fixtures/b/`. The config sets `"generator": "hvac-weekly"`, so `generate.ts` hands it to `lib/company-b.ts`; Company A's generator and hash are unchanged. B is a weekly, 30-person HVAC company in California with daily overtime (`caOvertime` in `lib/company-b.ts`, tested), two crews with separate managers, commission on install profit, no tips, and its own expense chart. It is fixtures only; the pushers are not run for B. `__tests__/company-b.test.ts` pins `EXPECTED_SHA256_B`. The 8 planted errors and their answer key are listed in `data/fixtures/README.md`.
