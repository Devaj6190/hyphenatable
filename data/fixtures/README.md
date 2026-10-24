# Fixtures

Normalized sample records in the shapes of `docs/plans/00-shared-context.md` section 6, one JSON file per table, so B and C can build offline. Everything here is **synthetic**: fake display names, fake upstream ids, no phone numbers, no notes, no secrets.

`data/fixtures/a/` is Company A v1 (ticket A-02, hand-specified). A-04's generator (`seed/generate.ts`) will regenerate this folder with 4 learnable past cycles and every check CHK-01 to CHK-22 planted; ids for the records below are meant to stay stable where possible.

## Validate

```bash
cd seed && bun install && cd ..
bun run seed/validate.ts data/fixtures/a   # exits 0 only if all 13 files validate
```

`seed/validate.ts` is a zod mirror of section 6 (strict objects: unknown fields fail) plus cross-reference checks (every `companyId` matches, every worker/job/cycle/visit/quote/invoice/entry/expense id resolves, `durationSec == endAt - startAt` for non-ticking entries). It is replaced by B's `packages/engine/src/schemas.ts` once B-02 merges.

## Files (`a/`)

| File | Contents |
|---|---|
| `company.json` | one `Company` (biweekly, `America/Los_Angeles`, long shift 11 h, OT after 40 h/week, gross change 25%) |
| `workers.json` | 12 `Worker`s: `a-w01`..`a-w07` hourly field, `a-w08` salaried crew lead, `a-w09`/`a-w10` Venmo contractors (`gusto: null`), `a-w11` manager (salary), `a-w12` owner (salary) |
| `cycles.json` | `a-c01`..`a-c04` (closed, no records yet; A-04 fills them) and the current cycle `a-c05` (Sun 2026-10-11 to Sat 2026-10-24) |
| `syncRuns.json` | one complete run per source for `a-c05` (Jobber time entries 40/40, QuickBooks Purchase 5/5, Gusto employees 10/10) and one incomplete Jobber run for `a-c04` (pulled 39, expected 40) for CHK-23 |
| `timeEntries.json` | 40 entries in `a-c05`, `a-te-0101`..`a-te-0140` numbered by start time |
| `jobs.json`, `visits.json` | 6 jobs `a-j01`..`a-j06` (job numbers 101..106), 4 completed visits `a-v01`..`a-v04` |
| `quotes.json`, `invoices.json`, `payments.json` | 3 quotes, 3 invoices, 2 payments (`a-pay01` deposit on quote `a-q02`, `a-pay02` final on invoice `a-in01`) |
| `expenses.json` | 8 expenses: `a-ex-0001`..`0005` QuickBooks purchases, `a-ex-0006`..`0008` Jobber expenses |
| `rules.json` | the rules onboarding should propose from history (expected output, `status: "proposed"`, `source: "history"`) |
| `answer-key.json` | planted errors. **Never given to a model**; only `eval/` and tests read it |

## Conventions

- Ids: company `a`; workers `a-wNN`; cycles `a-cNN`; time entries `a-te-NNNN`; jobs `a-jNN`; visits `a-vNN`; quotes `a-qNN`; invoices `a-inNN`; payments `a-payNN`; expenses `a-ex-NNNN`; sync runs `a-sr-NN`; rules `a-rule-NN`; answer-key rows `a-ak-NN`; clients `a-cl-NN` (as `clientRef`).
- `sourceId` equals our id in fixtures (it is the marker the pushers write, e.g. `payrollpilot:a-te-0121`); after a real pull it is the upstream id.
- Upstream ids that do not exist yet are visibly fake: Jobber `userId` is `jobber-user:a-wNN`; Gusto uuids are `00000000-0000-4000-a000-…` (employee) and `…-b000-…` (job). A-07 replaces them.
- `contactRef` is an opaque key (`contact:a-wNN`) the courier maps to a phone; never a number.
- Money is integer cents. Timestamps are ISO 8601 UTC (`…Z`). Date-only fields (`Expense.date`, `Payment.entryDate`, `Invoice.issuedDate`/`dueDate`) are `YYYY-MM-DD`.
- Cycle bounds: `periodStart` is local midnight Sunday (`07:00Z`), `periodEnd` is the last millisecond of Saturday local (`06:59:59.999Z`, inclusive). `cutoffAt` is Friday 18:00 local; the sync snapshot is Friday 18:05 local.
- Ticking entries: `endAt` is `null` and `durationSec` is the elapsed time at the sync snapshot.
- Expenses: `matchedJobId`/`matchConfidence` show the state **after** matching; QuickBooks `customerRef` is the job-number sub-customer (`"101"`); Jobber expenses have `accountName: null` (Jobber has no chart of accounts) and `matchedJobId` from `linkedJobId`.
- Unknowns are explicit `null`, never `0` (e.g. `a-w10.venmoRateCents`, the owner's and manager's Jobber `labourRateCents`).

## Answer key

Row form: `{ id, checkId, subject: { workerId, jobId, entryIds, expenseIds }, truth, correctAnswer: { kind, values }, registerCategory }`. A flag matches a row when `checkId` is equal and the subject ids overlap (never by text). `correctAnswer.kind` uses the `Interpretation.result.kind` values; when an answer changes more than one record, `values` keys are `<recordId>.<field>`.

Planted in `a-c05` (v1):

| Row | Check | Subject | Planted |
|---|---|---|---|
| a-ak-01 | CHK-01 | a-w05, a-te-0121 | 4 h entry with no job and no visit |
| a-ak-02 | CHK-02 | a-w06, a-te-0140 | timer still ticking at cutoff |
| a-ak-03 | CHK-03 | a-w07, a-te-0130 | 13 h shift (real; answer is confirm) |
| a-ak-04 | CHK-04 | a-w03, a-te-0111 + a-te-0113 | overlapping entries on Wed 2026-10-14 (demo-moment fallback) |
| a-ak-05 | CHK-05 | a-w04, a-te-0137 | zero-minute entry |
| a-ak-06 | CHK-10 | a-w02 | Jobber $26.00/h vs Gusto $25.00/h |
| a-ak-07 | CHK-11 | a-w10 | Venmo contractor with no rate |
| a-ak-08 | CHK-14 | a-ex-0003 | $214.37 Materials purchase with no job tag |

Other flags a correct engine also raises on these fixtures (consequences of the data, not planted errors, so not in the key in v1): CHK-06 on `a-te-0140` (a ticking timer cannot be approved), CHK-12 on `a-w08`, `a-w09`, `a-w10` (outside the sync, a workbook note), CHK-23 on `a-sr-04` (cycle `a-c04`). No other check should fire; if one does, the fixture or the check has a bug.

Not covered in v1 (A-04 adds them): CHK-05 exact-duplicate branch, CHK-06 to CHK-09, CHK-13, CHK-15 to CHK-22.

## Regenerate

v1 was written by hand (no generator). From A-04 on: `bun run seed/generate.ts --company a` rewrites `data/fixtures/a/*.json` deterministically; do not hand-edit after that.
