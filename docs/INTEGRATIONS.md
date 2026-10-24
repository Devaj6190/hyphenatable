# Integrations ledger (first-hour checks and live proofs)

Status values: **tested** (ran here, evidence noted), **unverified** (docs read only), **blocked** (needs an account or a sponsor), **dropped**. Add a dated line; never overwrite a tested result with an untested claim. No credentials, phone numbers or real names in this file.

| # | Check | Owner | Status | Evidence (time, what ran, what came back) | Fallback if it fails |
|---|---|---|---|---|---|
| H1 | Jobber tester account; read app authorized; `timeSheetEntries(first: 5)` returns `approved`, `ticking`, `totalCount`; second write-scope app created; tester user cap noted | A | unverified | | fewer workers (6) or the Excel export route |
| H2 | Gusto developer org + application; demo company created; `GET /v1/companies/{c}/payrolls?processing_statuses=unprocessed`; `prepare` works | A then B | unverified | | mock of the six payroll endpoints; UI labels Gusto "simulated" |
| H3 | QuickBooks sandbox tokens via OAuth Playground; `SELECT count(*) FROM Purchase`; whose developer account | A | unverified | | Devaj's sandbox or export fixtures |
| H4 | Photon: both demo phones registered; one message sent from `spectrum-ts`; one reply received through `app.messages` without a tunnel | C | unverified | | Telegram provider; in-app inbox labelled simulated |
| H5 | Convex dev deployment: table, scheduled function, HTTP action, subscribed Next.js page; Anthropic call from a `"use node"` action | B | unverified | | Neon Postgres + Railway worker + polling |
| H6 | Claude: one structured-output call to `claude-opus-5-5` with `effort: "medium"`; billing confirmed | B | unverified | | OpenRouter route |
| H7 | Embeddings: one Voyage or OpenAI call; one vector stored and searched with a company filter | B | unverified | | lexical match on structured rule fields |
| H8 | Playwright `storageState` login to the Jobber tester account; one Timesheets report read | A (after G1) | unverified | | Browser Use Cloud |

## Live proofs (fill in as they happen)
- First real text round trip (G1):
- First Gusto draft filled in demo (G2):
- First lesson promoted to a rule by the owner (G3):
- Company R backtest result (G3):
