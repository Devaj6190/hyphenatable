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
| `company.json` | one `Company` (biweekly, `America/Los_Angeles`, long shift 11 h, OT after 40 h/week, gross change 25%) |
| `workers.json` | 14 `Worker`s: a-w01..a-w07 hourly field, a-w08 salaried crew lead, a-w09/a-w10 Venmo contractors (`gusto: null`), a-w11 manager, a-w12 owner, a-w13 deactivated hourly, a-w14 new hire not onboarded in Gusto |
| `cycles.json` | a-c01..a-c04 (closed) and the current cycle a-c05 (Sun 2026-10-11 to Sat 2026-10-24) |
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
- Money is integer cents. Timestamps are ISO 8601 UTC (`…Z`), from local wall time (PDT until 2026-11-01, PST after). Date-only fields (`Expense.date`, `Payment.entryDate`, `Invoice.issuedDate`/`dueDate`) are `YYYY-MM-DD`.
- Cycle bounds: `periodStart` is local midnight Sunday, `periodEnd` is the last millisecond of Saturday local (inclusive). `cutoffAt` is Friday 18:00 local; the a-c05 sync snapshot is Friday 18:05 local.
- Ticking entries: `endAt` is `null` and `durationSec` is the elapsed time at the sync snapshot.
- Expenses: `matchedJobId`/`matchConfidence` show the state **after** matching; QuickBooks `customerRef` is the job-number sub-customer (`"101"`); Jobber expenses have `accountName: null` (Jobber has no chart of accounts) and `matchedJobId` from `linkedJobId`. Fuel purchases have `kind: "unknown"` (no rule).
- Job totals come from Jobber job costing (hours x Jobber labour rate + job-cost expenses, incl. linked sub-jobs) and a target margin; quotes and invoices carry the job total.
- `pay_rate` rule params: `{ workerId, rateCents, paymentUnit, costRateCentsPerHour }`; for salaried workers the cost rate is annual / 2080.
- Unknowns are explicit `null`, never `0` (e.g. `a-w10.venmoRateCents`, the owner's and manager's Jobber `labourRateCents`, the disposal sub-job's `totalCents`).

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
