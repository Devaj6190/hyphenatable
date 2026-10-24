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
| `lib/time.ts` | local wall time to UTC (PDT until 2026-11-01, PST after), working days |
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
bun run seed/push-jobber.ts auth-url                      # a person opens the URL as the seed account admin
bun run seed/push-jobber.ts auth-code <code>              # stores data/private/jobber-seed-tokens.json (not the read app's token)
bun run seed/push-jobber.ts --company a --live --one      # step 4: one past-dated entry plus what it needs; check it in Jobber
bun run seed/push-jobber.ts --company a --live            # the rest; rerunnable
```

- **Safety:** live mode queries `account { id name tester }` first and refuses unless the id equals `JOBBER_SEED_ACCOUNT_ID` (the free-trial account made for seeding, since the developer-testing signup is broken) or Jobber reports `tester = true`. With the variable unset only a tester account passes; there is no "any account" fallback. The refusal prints the account id and name to copy into `.env`. Writes go only to `api.getjobber.com` with the seed app's token. Never uses GraphiQL on the read app.
- **Order:** clients, properties, quotes, jobs (linked to their quote), visits, visit completes, time entries, Jobber expenses, invoices (from job), mark sent, payment records (quote deposits on the quote; the CHK-19 deposit on the invoice).
- **Idempotent:** every record carries `payrollpilot:<id>` (entry note, title, company name, invoice subject, payment details). Before writing, live mode looks up existing markers in the account. The id map `data/private/<company>-jobber-map.json` is saved after every create. A rerun creates only what is missing.
- **Not pushed:** the open timer (a-te-0140), which has to be started by hand just before the pull; tip payments (history only); QuickBooks purchases (A-06). `labourRate` is not sent per entry: Jobber costs entries at the user's labour rate, set by hand in Manage Team.
- **Manual steps** (printed by the dry run): before the push, add every worker in Manage Team with the exact display name. After the push, approve all but the CHK-06 entries, start the CHK-02 timer, and deactivate a-w13.
- **UNVERIFIED input shapes** (names are verified by introspection; see the comments in `lib/jobber-mutations.ts`): clientCreate, propertyCreate, quoteCreate line items, jobCreate `invoicing`, visitCreate argument placement, invoiceCreateFromJob, payment-record enums. Check them once in GraphiQL on the seed app, or let `--one` surface the error; the run stops on the first `userErrors`.
