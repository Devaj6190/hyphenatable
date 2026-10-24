# PayrollPilot (working name)

PayrollPilot is the agent a small service company hires to prepare and check payroll before a person submits it: it syncs Jobber, QuickBooks and Gusto with completeness checks, runs a deterministic checks engine, and texts the right manager or employee one short question when something is missing or contradictory. People approve every message, correction and rule, and each answer becomes a backtested rule the owner approves, so the next cycle asks less; PayrollPilot fills the Gusto draft and never submits it.

Built for the Cal Hacks 13.0 Hyphenate track ("The Hyphenated Enterprise: Autonomous Systems for Finance").

- **Demo script and shot list:** [docs/DEMO.md](docs/DEMO.md)
- **What's real, what's simulated, and the measured numbers:** [docs/PROOF.md](docs/PROOF.md)

## What's real and what's synthetic

The full table, with what was measured and when, is in [docs/PROOF.md](docs/PROOF.md) section 1. In short:

| System | Real | Synthetic |
|---|---|---|
| Jobber (trial account) | users, clients, properties, jobs, visits, quotes, invoices and expenses, seeded and read back through the API | time entries and payment records, loaded from `data/fixtures/a/` because the Jobber API has no write for them |
| Gusto (demo company) | employees mapped to Company A, their compensations, and the current unprocessed payroll | Company A's past payrolls; PayrollPilot only prepares, updates and calculates, and the code has no submit |
| QuickBooks (sandbox) | [TODO: waiting on sandbox credentials] | [TODO] |
| Company R | a real company's past pay cycles, anonymized at ingest, for the backtest [TODO: measured at G3] | none; names, notes and client names stay in the gitignored `data/private/` |
| Texts | [TODO: real iMessage/SMS through Photon once the round trip is proven] | anything the simulated-manager persona writes is labelled **Simulated** |

Company A is a synthetic landscaping crew in Pennsylvania, paid biweekly, with planted errors and an answer key for checks CHK-01 to CHK-22 in each of two cycles. The model never sees the answer key. Every name on screen, in this repo and in the video is fake.

Measured results, all **[TODO: measured at G3]**: planted-error precision and recall, questions asked in cycle 1 vs cycle 2, learned rules vs the owner's runbook, and the Company R backtest to the cent.

## Architecture

```
Jobber · QuickBooks · Gusto ──(connectors, read-only + completeness)──▶ Convex ◀──live queries── Dashboard (owner, manager)
                                                                         │  ▲
                                         questions to send / replies in  ▼  │
                                                                       Courier ──Photon──▶ manager / employee phones
```

- **Dashboard** (`apps/web`, Next.js 16, Tailwind, shadcn): the owner home (stage, "what we need from you", one-tap approve / edit / deny), problem detail, manager inbox, onboarding, rules, workbook and readiness, audit log. It reads Convex live and renders from fixtures when no deployment is configured. Manager views never show pay.
- **Convex** (`apps/web/convex`): the database, scheduler and live queries; the controller that owns each cycle's state and approvals; sync, the checks runner, three Claude agents (Analyst, Auditor, Messenger) that only return validated proposals, the learning loop, the Gusto draft writer, and an append-only audit log.
- **Courier** (`apps/courier`, Bun + Photon `spectrum-ts`): the only process that touches phones. It sends what Convex approved and relays replies; Convex sees a sha256 key, never a phone number.
- **Engine** (`packages/engine`, pure TypeScript, no IO, Vitest): the contract schemas, the 23 checks (CHK-01 to CHK-23), Stage 1 and Stage 2 payroll math in integer cents, and the message templates (under 240 characters, never a pay amount).
- **Connectors** (`packages/connectors`): Jobber GraphQL, QuickBooks Online and Gusto readers, each reporting pulled vs expected. Also `seed/` (synthetic companies, answer keys, sandbox pushers) and `eval/` (the metrics behind PROOF.md).

## Run it locally

Needs Bun 1.4+ and Node 22+.

```bash
bun install
cp .env.example .env     # leave NEXT_PUBLIC_CONVEX_URL empty to run on fixtures
bun run dev              # dashboard at http://localhost:3000
```

With a Convex deployment:

```bash
cd apps/web && bunx convex dev    # in a second terminal; prints NEXT_PUBLIC_CONVEX_URL for .env
```

Loading Company A into Convex: [TODO: `sync.ingestFixture` lands with the contract PR (#15)].

Texting: [TODO: once the courier PR is merged] put the Photon project id and secret in `apps/courier/.env` and the registered demo phones in `apps/courier/contacts.json` (both gitignored), then `bun run apps/courier/src/index.ts`. Without credentials it prints texts to the terminal instead. Details in `apps/courier/README.md`.

Checks, tests and metrics:

```bash
bun run check                 # Biome + typecheck in every package
bun run test                  # every package's tests
cd eval && bun run metrics    # writes eval/results.json
```

## Safety and privacy

- Sources are read-only. Corrections land in the review workbook, never in Jobber, QuickBooks or Gusto.
- The Gusto draft is prepared, updated and calculated; there is no submit function in the code. The owner submits.
- Nothing changes without a person's approval, and the person who answered a question can't approve the rule it becomes.
- Texts carry worker, date, job and hours only: never pay amounts, SSNs or bank details. Anyone can reply STOP.
- The model sees ids, never names or phone numbers. Real data stays in the gitignored `data/private/`; `.env` is never committed.

## For the team

- [docs/plans/00-team-brief.md](docs/plans/00-team-brief.md): who does what, the clock, the first hour.
- [docs/plans/00-shared-context.md](docs/plans/00-shared-context.md): binding contracts, stack, repo layout, checks catalogue, cut order.
- Role plans: [A data and payroll](docs/plans/A-data-payroll.md), [B agent and backend](docs/plans/B-agent-backend.md), [C product, messaging and demo](docs/plans/C-product-messaging-demo.md).
- [specs/final.md](specs/final.md): the product spec; [specs/conflicts.md](specs/conflicts.md): every decision and why.
- [docs/plan-research.md](docs/plan-research.md): verified facts about every tool, sandbox and prize track.
- [docs/sources/](docs/sources/README.md): Hyphenate track document, workshop notes, validation research.
- [docs/STATUS.md](docs/STATUS.md): what is on `main` and what each person is doing now. [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md): first-hour check results.

## Team

Varnika (product, messaging and demo), Devaj (agent and backend), Shanin (data and payroll).
