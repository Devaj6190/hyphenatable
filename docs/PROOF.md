# PayrollPilot: proof (v0 skeleton)

Every number here says where it was measured, and when. A target is never shown as a result. Anything not yet measured reads **measured at G3**. Source of the numbers: `eval/results.json` (`bun run metrics` in `eval/`).

## 1. What's real, what's simulated

> One-line statement for the video and Devpost: **measured at G3** (draft below).

Draft: *PayrollPilot reads a real Jobber account, a Gusto demo company and a QuickBooks sandbox, seeded with a synthetic 12-person landscaping crew. Hours are simulated because Jobber's API cannot create time entries. It prepares the Gusto draft and never submits.*

| System | Real | Simulated | Notes |
|---|---|---|---|
| Jobber (trial account) | users, clients, properties, jobs, visits, quotes, invoices, expenses (seeded by API, read back by the read app) | time entries and payment records (the Jobber API has no write for them); loaded from `data/fixtures/a/` | Jobber auto-creates one payment record per invoice; normalized as kind "unknown" |
| Gusto (demo company) | employees mapped to Company A, compensations, the unprocessed payroll for a-c05 | Company A's past payrolls (`pastPayrolls.json`); the demo's own history is read only as "connected" proof | prepare / update / calculate only; there is no submit in the code |
| QuickBooks (sandbox) | measured at G3 | measured at G3 | waiting on sandbox credentials (H3) |
| Company R | measured at G3 | none: real, anonymized | names, notes and client names never leave `data/private/` |
| Messages | measured at G3 | demo personas are labelled **simulated** | |

## 2. Company A (synthetic)

A 12-person landscaping crew in Pennsylvania (`America/New_York`), paid biweekly on Gusto's Sat–Fri schedule, with weekly overtime after 40 h. Cycle 1 is a-c05 (2026-10-10..10-23); cycle 2 is a-c06 (2026-10-24..11-06). Planted errors cover CHK-01 to CHK-22 in each cycle (answer key: `data/fixtures/a/answer-key.json` and `cycles/a-c06/answer-key.json`). The model never sees the answer key.

- Stage 1 on a-c05 (engine golden, synthetic): Gusto wages 2,224,383¢ over 545.08 h. a-w10 is excluded because it has no Venmo rate. Hand-computed in `packages/engine/src/payroll/__golden__/a-c05.json`.
- Live run: **measured at G3**.

## 3. Company R (real, anonymized)

A real 15-person landscaping company; 3 past pay periods. **Measured at G3.**

## 4. Backtest (M4)

- Company R, Stage 1 gross per worker vs what was actually paid: **measured at G3** ("N of M workers match to the cent, max difference X").
- Synthetic self-check, not Company R: Company B's 4 past weekly cycles, 120 of 120 worker-cycles match to the cent, including California daily overtime (`eval/results.json` m4.syntheticSelfCheck, synthetic).

## 5. Metrics

| Metric | Definition | Value |
|---|---|---|
| M1 planted-error recall | answer-key rows caught (same checkId, overlapping subject ids), Company A cycle 1 | measured at G3 |
| M1 precision | flags matching a key row / all flags | measured at G3 |
| M2 rules vs runbook | N of M onboarding rules match the owner's runbook; K differ; J not learned | measured at G3 |
| M3 questions per cycle | `Cycle.questionsAsked`, a-c05 vs a-c06, same planted mix | measured at G3 |
| M4 backtest | Company R workers matching to the cent; max difference | measured at G3 |
| M5 completeness | share of SyncRuns complete; blocked objects listed | measured at G3 |
| M6 traceability | share of flags with a `where` ref and a rule or model-call id | measured at G3 |

Until G3, `eval/results.json` is computed on fixtures. Its M1 and M6 score a naive stand-in checker (`flagsSource` says so), not the product's checks, and are not quoted here.
