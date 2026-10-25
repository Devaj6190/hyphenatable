# RollPay

RollPay (formerly PayrollPilot) is the product name. Some code identifiers, env vars and URLs still use the old name.

RollPay is the agent a small service company hires to prepare and check payroll before a person submits it: it syncs Jobber, QuickBooks and Gusto with completeness checks, runs a deterministic checks engine, and texts the right manager or employee one short question when something is missing or contradictory. People approve every message, correction and rule, and each answer becomes a backtested rule the owner approves, so the next cycle asks less; RollPay fills the Gusto draft and never submits it.

Built for the Cal Hacks 13.0 Hyphenate track ("The Hyphenated Enterprise: Autonomous Systems for Finance"). We also enter the Creao track, **Best One-Person Company**.

- **Demo script and shot list:** [docs/DEMO.md](docs/DEMO.md)
- **What's real, what's simulated, and the measured numbers:** [docs/PROOF.md](docs/PROOF.md)

## What's real and what's simulated

Every number below comes from [docs/PROOF.md](docs/PROOF.md); the section is named in the Source column. Numbers on Company A and Company B are synthetic. Anything marked "measured at G3" has not been measured yet, and no target is shown as a result.

| Item | Real or simulated | Number | Synthetic? | Source |
|---|---|---|---|---|
| Jobber trial account | users, clients, properties, jobs, visits, quotes, invoices and expenses are real records in a trial account; time entries and payment records are loaded from fixtures because the Jobber API cannot create them | none quoted | Company A is synthetic | PROOF.md section 1 |
| Gusto demo company | employees, compensations and the current unprocessed payroll are real in the demo; past payrolls come from fixtures; the code has no submit | none quoted | Company A is synthetic | PROOF.md section 1 |
| QuickBooks sandbox | real records in our own sandbox, read back | purchases for cycle 1 match 6 of 6 | synthetic | PROOF.md section 1 |
| Company A | a seeded landscaping crew | 14 worker records, of which 12 are the crew | synthetic | PROOF.md section 2 |
| Company R | real past timesheets and pay, anonymized at ingest, kept in the gitignored `data/private/` | 283 timesheet entries, 188 payroll rows, 8 pay periods | real, anonymized | PROOF.md section 3 |
| Backtest on Company R | Stage 1 gross compared with what was actually paid | 35 of 46 worker pay periods match to the cent; 44 of 46 are within $1 | real, anonymized | PROOF.md section 4 |
| Backtest self-check on Company B | payroll math on four past weekly cycles, including California daily overtime | 120 of 120 worker-cycles match to the cent | synthetic | PROOF.md section 4 |
| Planted-error precision and recall, questions per cycle, rules vs the owner's runbook, completeness, traceability | not yet measured | measured at G3 | synthetic (Company A) | PROOF.md section 5 |
| Creao agent runs | the Auditor, Messenger and Analyst run as saved Creao agents started by our controller | not yet measured: the Creao spike (H9) is unverified | agent ids and run share link are TODO(S7) | [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) row H9 |
| Texts | real iMessage through Photon on registered demo phones; replies written by the simulated-manager persona are labelled **Simulated** | live round trip tested: owner approve → text in 3 s → reply back in 49 s → correction proposed | demo personas are fake | PROOF.md section 1; round-trip log in [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) rows H4, H5 |

Company A is a synthetic landscaping crew in Pennsylvania, paid biweekly, with planted errors and an answer key for checks CHK-01 to CHK-22 in each of two cycles. The model never sees the answer key. Every name on screen, in this repo and in the video is fake.

## How Creao fits

Three batch agents, the **Auditor**, the **Messenger** and the **Analyst**, run as saved agents on Creao behind our Convex controller. The controller starts each run; the agents never start each other or themselves. They read work from RollPay's own HTTP API and return proposals only. Every proposal is validated, stored as `proposed` or `draft`, and waits for a person to approve it. Plain code owns the money, the checks, the holds and the approvals. The live reply path (reading a worker's text) stays in our own code, because a Creao run takes minutes.

**Creao only ever sees ids.** No names, phone numbers, notes or pay amounts are sent to a Creao agent or accepted back from one.

> Remove the agent, and this product dies. Without the Analyst there are no rules learned from history; without the Auditor, no fuzzy matches or morning list; without the Messenger, no questions. What's left is a calculator.

- Agent ids: TODO(S7) Auditor, TODO(S7) Messenger, TODO(S7) Analyst
- Shared run link: TODO(S7)
- Status of the integration: [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) row H9. Design and the go/no-go spike: [docs/plans/creao-plan.md](docs/plans/creao-plan.md).

## Architecture

```
Jobber · QuickBooks · Gusto ──(connectors, read-only + completeness)──▶ Convex ◀──live queries── Dashboard (owner, manager)
                                                                         │  ▲
                                         questions to send / replies in  ▼  │
                                                                       Courier ──Photon──▶ manager / employee phones
```

- **Dashboard** (`apps/web`, Next.js 16, Tailwind, shadcn): the owner home (stage, "what we need from you", one-tap approve / edit / deny), problem detail, manager inbox, onboarding, rules, workbook and readiness, audit log, and an Agents section on the owner home (the Auditor's brief and each Creao agent's latest run). It reads Convex live and renders from fixtures when no deployment is configured. Manager views never show pay, and the manager's texted link opens their inbox as the manager.
- **Convex** (`apps/web/convex`): the database, scheduler and live queries; the controller that owns each cycle's state and approvals; sync, the checks runner, three batch agents (Analyst, Auditor, Messenger) that run on Creao behind the controller and only return validated proposals, the learning loop, the Gusto draft writer, and an append-only audit log.
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

Loading a company into Convex (needs `INGEST_KEY`, the same value as in the Convex env): `cd apps/web && bun run scripts/ingest.ts ../../data/fixtures/a` loads Company A's fixtures; with no folder it loads the engine's sample company. The dev deployment today holds only "Sample Landscaping (synthetic)".

Texting: put the Photon project id and secret in `apps/courier/.env` and the registered demo phones in `apps/courier/contacts.json` (both gitignored), set `DASHBOARD_URL` to the deployed dashboard so the manager's text carries its link, then `bun run courier` from the repo root (keeps the Mac awake, restarts on disconnect, prints "connected to Photon"). Without credentials it prints texts to the terminal instead. Details in `apps/courier/README.md`.

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
