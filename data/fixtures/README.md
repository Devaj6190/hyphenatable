# Fixtures

Normalized sample records in the shapes of `docs/plans/00-shared-context.md` section 6, one JSON file per table, so B and C can build offline. Everything here is **synthetic**: fake display names, fake upstream ids, fake streets and vendors, no phone numbers, no notes, no secrets.

**Generated. Do not hand-edit.** `data/fixtures/a/` is written by `bun run seed/generate.ts --company a` from `seed/companies/a.json` (A-04); see `seed/README.md`.

## Validate

```bash
cd seed && bun install && cd ..
bun run seed/validate.ts data/fixtures/a   # exits 0 only if all 15 files validate
```

`seed/validate.ts` is a zod mirror of section 6 (strict objects: unknown fields fail) plus cross-reference checks (every `companyId` matches, every referenced id resolves, `durationSec == endAt - startAt` for non-ticking entries, past-payroll gross = sum of earnings). It is replaced by B's `packages/engine/src/schemas.ts` once B-02 merges.

## Files (`a/`)

| File | Contents |
|---|---|
| `company.json` | one `Company` (biweekly, `America/New_York`: Pennsylvania, weekly OT only; long shift 11 h, OT after 40 h/week, gross change 25%) |
| `workers.json` | 14 `Worker`s: a-w01..a-w07 hourly field, a-w08 salaried crew lead, a-w09/a-w10 Venmo contractors (`gusto: null`), a-w11 manager, a-w12 owner, a-w13 deactivated hourly, a-w14 new hire not onboarded in Gusto |
| `cycles.json` | a-c01..a-c04 (closed) and the current cycle a-c05 (Sat 2026-10-10 to Fri 2026-10-23), biweekly Sat-Fri to match the Gusto demo pay schedule; earlier cycles step back 14 days |
| `syncRuns.json` | complete runs for a-c05 (Jobber time entries, expenses, visits; QuickBooks Purchase; Gusto employees) and past cycles; one incomplete Jobber time-entry run for a-c04 (a-sr-04, pulled one fewer than expected) for CHK-23 |
| `timeEntries.json` | about 300 past entries (a-te-1001...) and 85 in a-c05 (a-te-0101..0140 from v1, a-te-0141+ new) |
| `jobs.json`, `visits.json` | past jobs a-j11+ (one visit per job day), current jobs a-j01..a-j10, visits a-v01..a-v05 |
| `quotes.json`, `invoices.json`, `payments.json` | past: quote → deposit (jobs over $3,000) → invoice → final; current as configured |
| `expenses.json` | past a-ex-1001..; current a-ex-0001..0011 (QuickBooks and Jobber) |
| `rules.json` | the rules onboarding should propose from history (expected output, `status: "proposed"`, `source: "history"`), incl. one `pay_rate` per active Gusto field worker |
| `pastPayrolls.json` | **not a section 6 table**: what was paid in a-c01..a-c04 (Gusto regular, Gusto off-cycle, Venmo), earnings by Gusto name. Stand-in for A-08's Gusto past payrolls; feeds onboarding and CHK-22 (`pastCycles.gross` = regular + Venmo rows) |
| `questions.json` | past `Question`s (answered) so routing can be learned: job facts to a-w11, money to a-w12 |
| `answer-key.json` | planted errors. **Never given to a model**; only `eval/` and tests read it |

## Conventions

- Ids: company `a`; workers `a-wNN`; cycles `a-cNN`; time entries `a-te-NNNN`; jobs `a-jNN`; visits `a-vNN`; quotes `a-qNN`; invoices `a-inNN`; payments `a-payNN`; expenses `a-ex-NNNN`; sync runs `a-sr-NN`; rules `a-rule-NN`; past payrolls `a-pp-NNN`; past questions `a-qn-NN`; answer-key rows `a-ak-NN`; clients `a-cl-NN` (as `clientRef`).
- `sourceId` equals our id in fixtures (it is the marker the pushers write, e.g. `payrollpilot:a-te-0121`); after a real pull it is the upstream id.
- Upstream ids that do not exist yet are visibly fake: Jobber `userId` is `jobber-user:a-wNN`; Gusto uuids are `00000000-0000-4000-a000-…` (employee) and `…-b000-…` (job). A-07 replaces them.
- `contactRef` is an opaque key (`contact:a-wNN`) the courier maps to a phone; never a number.
- Money is integer cents. Timestamps are ISO 8601 UTC (`…Z`), from local wall time in the company's zone (Company A: EDT, -04:00, until 2026-11-01, then EST; Company B: PDT/PST). Date-only fields (`Expense.date`, `Payment.entryDate`, `Invoice.issuedDate`/`dueDate`) are `YYYY-MM-DD`.
- Cycle bounds (Company A): `periodStart` is local midnight Saturday, `periodEnd` is the last millisecond of the second Friday, local and inclusive. The OT workweek is Sat-Fri. `cutoffAt` is that Friday at 18:00 local; the a-c05 sync snapshot is Friday 18:05 local.
- Ticking entries: `endAt` is `null` and `durationSec` is the elapsed time at the sync snapshot.
- Expenses: `matchedJobId`/`matchConfidence` show the state **after** matching; QuickBooks `customerRef` is the job-number sub-customer (`"101"`); Jobber expenses have `accountName: null` (Jobber has no chart of accounts) and `matchedJobId` from `linkedJobId`. Fuel purchases have `kind: "unknown"` (no rule).
- Job totals come from Jobber job costing (hours x Jobber labour rate + job-cost expenses, incl. linked sub-jobs) and a target margin; quotes and invoices carry the job total.
- `pay_rate` rule params: `{ workerId, rateCents, paymentUnit, costRateCentsPerHour }`; for salaried workers the cost rate is annual / 2080.
- Unknowns are explicit `null`, never `0` (e.g. `a-w10.venmoRateCents`, the owner's and manager's Jobber `labourRateCents`, the disposal sub-job's `totalCents`).

## Changes in the Pennsylvania move (a/company-a-pa)

Company A moved from America/Los_Angeles to America/New_York, and its cycles from Sun-Sat to Sat-Fri. Every id is unchanged, and so are every amount, hour count, working date and wall-clock time. Only the UTC instants moved: entries, visits, jobs, quotes, sync runs and answer-key time values are 3 h earlier (the same local time in EDT instead of PDT). Cycles start one day earlier (Saturday) and end on Friday; the cutoff is still Friday 18:00 local. The same checks fire as before.

## Answer key

Row form: `{ id, checkId, subject: { workerId, jobId, entryIds, expenseIds }, truth, correctAnswer: { kind, values }, registerCategory }`. A flag matches a row when `checkId` is equal and the subject ids overlap (never by text). `correctAnswer.kind` uses the `Interpretation.result.kind` values; when an answer changes more than one record, `values` keys are `<recordId>.<field>`; `keep`/`drop` name the surviving and the duplicate record.

Planted in a-c05 (rows a-ak-01..08 are the v1 rows, same ids):

| Rows | Check | Subject | Planted |
|---|---|---|---|
| 01 | CHK-01 | a-w05, a-te-0121 | 4 h entry with no job and no visit |
| 02 | CHK-02 | a-w05, a-te-0140 | timer still ticking at cutoff |
| 03 | CHK-03 | a-w07, a-te-0130 | 13 h shift (real; answer is confirm) |
| 04 | CHK-04 | a-w03, a-te-0111 + a-te-0113 | overlapping entries on Wed 2026-10-14 (demo-moment fallback) |
| 05, 09 | CHK-05 | a-te-0137; a-te-0106 + a-te-0146 | zero-minute entry; exact duplicate |
| 10..13 | CHK-06 | a-te-0183, 0184, 0185, and the ticking a-te-0140 | not approved at cutoff |
| 14 | CHK-07 | a-w06 | active hourly worker with no entries |
| 15 | CHK-08 | a-w13 + its 2 entries | deactivated worker with hours |
| 16 | CHK-09 | a-w14 | new hire not onboarded in Gusto |
| 06 | CHK-10 | a-w02 | Jobber $26.00/h vs Gusto $25.00/h |
| 07 | CHK-11 | a-w10 | Venmo contractor with no rate |
| 17..19 | CHK-12 | a-w08, a-w09, a-w10 | outside the sync (listed, not an error) |
| 20 | CHK-13 | a-j07 (visit a-v05) | completed visit, no entries (time logged to a-j04) |
| 08 | CHK-14 | a-ex-0003 | $214.37 Materials purchase with no job tag |
| 21 | CHK-15 | a-ex-0003 + a-ex-0009 | same purchase in QuickBooks and Jobber |
| 22 | CHK-16 | a-j08 | "Disposal run - Foxglove Ct" with no parent (parent a-j04) |
| 23 | CHK-17 | a-ex-0011 | Fuel purchase, no account-kind rule |
| 24 | CHK-18 | a-w08 | Jobber costs a-w08 at $30.00/h; pay_rate rule says $32.50/h |
| 25 | CHK-19 | a-j09 | quote deposit a-pay03 recorded as invoice a-in04's final |
| 26 | CHK-20 | a-j10 / a-w12 | lighting quote a-q05 by a-w12; rule says a-w05 quotes in person |
| 27 | CHK-21 | a-j05 | 8% margin (company threshold 20%, in `seed/companies/a.json` `lowMarginPct`) |
| 28, 29 | CHK-22 | a-w04 (+57%), a-w06 (-100%, consequence of CHK-07) | gross vs mean of the last 3 cycles |

Expected but not keyed: CHK-23 on a-sr-04 (a sync run has no subject ids to match). Engine conventions these fixtures assume (asked of B): CHK-04 skips exact duplicates (CHK-05 owns them); CHK-05 never treats a ticking entry as zero; CHK-17 skips null accounts; CHK-22 reads regular + Venmo rows of `pastPayrolls.json` (off-cycle commission, tips and bonus are Stage 2). No other check should fire on a-c05; if one does, the fixture or the check has a bug.

## Company B (`b/`, A-14, P1, fixtures only)

Generated by `bun run seed/generate.ts --company b` from `seed/companies/b.json` (generator `hvac-weekly`, `seed/lib/company-b.ts`). It is synthetic and **not pushed to any sandbox**. The same 15 files and conventions as Company A, with these differences:

- **Company:** 30-person HVAC company, weekly pay, America/Los_Angeles. Cycles b-c01..b-c04 are past; b-c05 (Sun 2026-10-18 to Sat 2026-10-24) is current. Cutoff is Monday 10:00 local after the Saturday.
- **Crews:** the install crew (3 teams of 4) reports to b-w02; the service crew (12 techs) reports to b-w03; the office hourly worker (b-w04, OFFICE entries) and both salespeople report to the owner b-w01. Routing: install job facts go to b-w02, service job facts to b-w03, money to b-w01.
- **California overtime** (what `pastPayrolls.json` paid, and the `overtime_policy` rule):
  - per day: over 8 h at 1.5x, over 12 h at 2x
  - per Sun-Sat workweek: regular hours over 40 at 1.5x; daily-OT hours don't count toward the 40
  - seventh consecutive day: not modeled; no one works 7 consecutive days
  - earnings use the names "Regular Hours", "Overtime" and "Double Overtime"
- **Commission:** 8% of install job profit goes to the quote's salesperson (b-w29, b-w30), paid off-cycle. The salespeople's regular payroll is a salaried draw. Profit is the job total minus hours x Jobber labour rate minus job-cost expenses.
- **No tips, no Venmo.** Installs take a 50% deposit on the quote.
- **Expense chart:** job cost is Equipment (Units), Ductwork & Parts, Refrigerant, Permits and Subcontractors; overhead is Tools & Small Equipment, Shop Supplies and Vehicle Fuel.
- **Ids:** b-te-<cycle><nnn> (current cycle b-te-5001..), b-ex-<cycle><nnn>, b-j001.., b-v0001.., b-q001.., b-in001.., b-pay001.., b-pp-<cycle><nn>, b-qn-NN, b-sr-NN, b-rule-NN, b-ak-NN.

| Row | Check | Planted in b-c05 |
|---|---|---|
| b-ak-01 | CHK-01 | b-w18 parts run with no job (Wed evening) |
| b-ak-02 | CHK-03 | b-w07 13 h rooftop day (real: 8 / 4 at 1.5x / 1 at 2x) |
| b-ak-03 | CHK-04 | b-w21 afternoon call starts 30 min before the morning call ends |
| b-ak-04 | CHK-10 | b-w20 Jobber $34.00/h vs Gusto $32.00/h (Jobber typo) |
| b-ak-05 | CHK-14 | $386.40 Refrigerant purchase with no job |
| b-ak-06 | CHK-15 | ductwork purchase in QuickBooks and again as a Jobber expense |
| b-ak-07 | CHK-19 | install deposit recorded as the invoice's final payment |
| b-ak-08 | CHK-22 | b-w12 10.5 h days plus a full Saturday (+~60%) |
| b-ak-09 | CHK-18 | consequence of b-ak-04: labour costed at $34.00/h against the $32.00/h pay rate |

No other check should fire on b-c05.

## Company A cycle 2: `a/cycles/a-c06/` (demo cycle 2 and M3)

The a-c06 cycle is Gusto's next period, **Sat 2026-10-24 .. Fri 2026-11-06**. US daylight time ends on Nov 1, so its second week is in EST. Its unprocessed regular payroll is `749072b9-abc7-4a30-aa64-6e8bd5811a08`. It ships as an **extension folder** so the base `a/*.json` files, and their hash, stay byte-identical. Generated by `bun run seed/generate.ts --company a` from `seed/companies/a-c06.json` (`seed/lib/cycle-a06.ts`).

- **Loading:** concatenate each file in `a/cycles/a-c06/` onto the same-named base file. The extension files are `cycles`, `syncRuns`, `timeEntries`, `jobs`, `visits`, `quotes`, `invoices`, `payments`, `expenses`, `pastPayrolls` and `answer-key`. Workers, company and rules come from the base. Validate both together: `bun run seed/validate.ts data/fixtures/a data/fixtures/a/cycles/a-c06`.
- **Ids are new:**

  | Record | a-c06 ids |
  |---|---|
  | time entries | a-te-0601.. |
  | jobs | a-j61..a-j70 |
  | visits | a-v61..a-v65 |
  | quotes | a-q61..a-q64 |
  | invoices | a-in61..a-in64 |
  | payments | a-pay61..a-pay63 |
  | expenses | a-ex-0601..a-ex-0611 |
  | sync runs | a-sr-61..a-sr-65 |
  | answer-key rows | a-ak-61.. |
  | a-c05-as-paid payroll rows | a-pp-5NN |

- **Same planted-error mix as a-c05:** the same set of check ids (tested), on new records.
  - CHK-04 is a-w03's overlapping pair on a-j62.
  - CHK-22 is a-w01, who works both Saturdays (+29%). CHK-22 also fires on a-w06, a-w13 and a-w10 as consequences of CHK-07, a-w13 leaving, and the missing Venmo rate.
  - Facts that persist across cycles (a-w02's Gusto rate, a-w10's missing Venmo rate, a-w08's Jobber cost rate, a-w13 inactive but still in Gusto, a-w14 not onboarded) fire again, because nobody fixed the source records.
- **Answer key per cycle:** a-c06 rows carry `cycleId: "a-c06"` and live in the extension's `answer-key.json`. Base rows have no `cycleId` and belong to a-c05.
- **`resolvableByRuleType`:** each a-c06 row says whether a rule learned from cycle 1's answers resolves it without a question (the RuleType), or `null` when it must still be asked. Resolvable rows:

  | Check | Rule type |
  |---|---|
  | CHK-10 | `pay_rate` |
  | CHK-11 | `venmo_rate` |
  | CHK-14 | `vendor_job_hint` (Cedar Creek irrigation fittings go to the running irrigation job) |
  | CHK-16 | `disposal_parent_link` |
  | CHK-17 | `expense_account_kind` (Fuel is overhead) |
  | CHK-18 | `pay_rate` |
  | CHK-19 | `deposit_vs_final` |
  | CHK-20 | `in_person_quoter` |
  | CHK-22 for a-w10 | `venmo_rate` |

  M3 compares `Cycle.questionsAsked` for a-c05 and a-c06.
- **`pastPayrolls.json` (extension):** what a-c05 was paid once cycle 1's answers were applied. That means the duplicate dropped, the timer closed at 17:00, a-te-0111 ending at 12:00, a-w02 at $26.00, a-w10 at $22.00 by Venmo, and a-w14 held. Regular and Venmo pay only. It is the third history cycle for a-c06's CHK-22.

## Expected flags: `a/flags.json`, `a/cycles/a-c06/flags.json`

**These are expected flags derived from the answer key, not output of B's checks engine.** There is one section 6 `Flag` per answer-key row (same `checkId` and `subject`), plus the documented expected extra CHK-23 on `a-sr-04` (cycle a-c04). They are generated by `seed/generate.ts` (`seed/lib/flags.ts`), so they stay in sync with the key. Ids are `a-fl-NN` for a-c05 and `a-fl-6NN` for a-c06. They exist so the dashboard can be built before the engine runs.

- `status: "open"`.
- `seen` is one plain sentence with ids, not names.
- `where` uses our own record ids with the system they live in (`jobber`, `qbo`, `gusto`, or `payrollpilot` for the Venmo list), with `url: null`. It never uses upstream ids, so fixtures stay id-stable.
- `confidence` is `"certain"`, except CHK-14 (0.6), CHK-15 (0.9) and CHK-20 (0.75), which are fuzzy.
- `precedent` is the rule that applies (`ruleId` plus a `rule: …` note), or for a-c06 the matching a-c05 flag (`same as flag a-fl-NN on 2026-10-23`). Otherwise it is `"no precedent"`.
- `routeTo` follows section 9.
- `affects.dollarsCents` is filled only where the amount is a fact: expense amounts, and the balance still owed for CHK-19. Otherwise it is null.

## B-02 contract fields (packages/engine/src/schemas.ts, strict)

- `company.json` `settings.lowMarginPct`: the CHK-21 threshold, taken from `lowMarginPct` in the company config. It is 20 for both A and B.
- `expenses.json` `reimbursableToWorkerId` and `reimbursementStatus`: null on every seeded expense; none are reimbursable.
- `pastPayrolls.json` `sourceId`: upstream it is the Gusto payroll uuid or the Venmo export row id. Seeded rows have no upstream record, so `sourceId` equals the row's own `id`.

`seed/validate.ts` mirrors these strictly, and `flags.json` is validated whenever it is present.
