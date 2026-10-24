# PayCheck (working name)

The agent a service company hires to prepare and check payroll before a person submits it. It learns the company's rules from past pay cycles in Jobber, QuickBooks and Gusto, runs each cycle on its own with completeness checks and a deterministic checks engine, texts the right person one short question when something is missing or contradictory, and turns each answer into a backtested rule the owner approves, so the next cycle asks less. People approve every message, correction and rule. The owner submits payroll; PayCheck fills the Gusto draft and never submits.

Built for the Cal Hacks 13.0 Hyphenate track ("The Hyphenated Enterprise: Autonomous Systems for Finance").

## Start here
- [docs/plans/00-team-brief.md](docs/plans/00-team-brief.md): who does what, the clock, the first hour.
- [docs/plans/00-shared-context.md](docs/plans/00-shared-context.md): binding contracts, stack, repo layout, checks catalogue, cut order.
- Role plans: [A data and payroll](docs/plans/A-data-payroll.md), [B agent and backend](docs/plans/B-agent-backend.md), [C product, messaging and demo](docs/plans/C-product-messaging-demo.md).
- [specs/final.md](specs/final.md): the product spec; [specs/conflicts.md](specs/conflicts.md): every decision and why.
- [docs/plan-research.md](docs/plan-research.md): verified facts about every tool, sandbox and prize track.
- [docs/sources/](docs/sources/README.md): Hyphenate track document, workshop notes, validation research.
- [docs/STATUS.md](docs/STATUS.md): what is on `main` and what each person is doing now. [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md): first-hour check results.

## What is real and what is simulated
Stated in [docs/PROOF.md](docs/PROOF.md) once measured. Short version: the demo company is synthetic but lives in the real Jobber, QuickBooks and Gusto developer sandboxes, read through their APIs, with planted errors and an answer key; the backtest uses a real company's past pay cycles, anonymized at ingest. Every name on screen, in this repo and in the video is fake.
