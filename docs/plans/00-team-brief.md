# PayrollPilot: Team Brief (read this first, 10 minutes)

Cal Hacks 13.0, Palace of Fine Arts, SF. Team of 3. Written Sat 2026-10-24 at about 1:30 AM PDT. Submission **Sun 9:00 AM PDT, hard**; everyone at the venue by **8:00 AM**; judging 10:30 to 12:30; pitch 3 minutes plus 2 of questions; live demo required; all work during the hackathon.

Binding files: [00-shared-context.md](00-shared-context.md) (contracts, stack, clock, cut order; wins on conflict), [../../specs/final.md](../../specs/final.md) (what we build), your role plan.

## What we are building, in one breath

PayrollPilot is the agent a service company hires to prepare and check payroll before the owner submits it. It **learns** the company's rules from past cycles in Jobber, QuickBooks and Gusto, **runs** each cycle on its own with completeness checks and a deterministic checks engine, **escalates** by texting the right person one short question with a confidence and a precedent note, and **improves** by turning each answer into a backtested rule the owner approves, so cycle 2 asks less. People approve every message, correction and rule. The owner submits payroll. PayrollPilot fills the Gusto draft and never submits.

Proof: a synthetic 12-person landscaping company seeded into the real Jobber, QuickBooks and Gusto sandboxes with planted errors and an answer key, plus Shanin's real company's past cycles, anonymized, as a backtest. The moment: double-booked hours caught before the draft is filled.

## Who does what

| Role | Person | Owns (folders) | First task | Plan |
|---|---|---|---|---|
| **A: Data and payroll** | Shanin | `seed/`, `packages/connectors/` (Jobber, QuickBooks, Gusto read, exports, readers), `packages/engine/src/payroll/`, `eval/`, `data/fixtures/`, `docs/PROOF.md` | H1 Jobber tester account + read app authorized; H2 Gusto developer org; fixtures for every table by G0 | [A-data-payroll.md](A-data-payroll.md) |
| **B: Agent and backend** | Devaj | `apps/web/convex/` (schema, controller, sync, checks, agents, learning, gusto writer, messaging, audit), `packages/engine/src/{schemas,checks,matching,lessons,llm}/`, `packages/connectors/src/gusto/write*`, CI, `AGENTS.md` | B-01 scaffold + H5 Convex + H6 Claude; B-02 the contract PR (schema + function stubs) by G0 | [B-agent-backend.md](B-agent-backend.md) |
| **C: Product, messaging and demo** | Varnika | `apps/web/app/`, `apps/web/components/`, `apps/courier/`, `packages/engine/src/messages/`, `apps/web/convex/demo.ts`, `docs/DEMO.md`, `README.md`, Devpost, video | H4 Photon round trip on the real phone; Next.js skeleton reading Convex by G0 | [C-product-messaging-demo.md](C-product-messaging-demo.md) |

Roles were set from the team's stated preferences: Devaj asked for the technical core; Varnika had no preference and gets the role that owns the demo, which decides the score; Shanin owns the data and the payroll rules because it is his company and his runbook.

## The clock (PDT)

| When | What | Gate owner |
|---|---|---|
| Sat 01:45 to 03:00 | Foundation: accounts, first-hour checks, scaffold, contract PR, fixtures | |
| **Sat 03:00 G0** | Repo on `main` with Convex deployed, schema merged, fixtures, `docs/INTEGRATIONS.md` filled, Jobber and Gusto accounts live, Photon test message sent | B schema; A accounts and fixtures; C Photon |
| Sat 05:00 to 09:00 | Sleep, everyone | |
| **Sat 13:00 G1** | Company A seeded and pulled with completeness checks; flags for planted errors; dashboard live; courier round trip proven | A, B, C |
| **Sat 18:00 G2** | Full loop once: flag → question → approval → real text → reply → correction → workbook → Gusto draft filled; onboarding proposes rules | B, C, A |
| **Sat 23:00 G3** | Lesson loop and cycle 2 fewer questions; catch-all and judge scenario; eval numbers; Stage 2 report; Devpost draft submitted; video script locked | B, A, C |
| Sat 23:00 to Sun 02:00 | Stretch in cut-order (Company B, off-cycle draft, real live run) and raw video takes | |
| Sun 02:00 to 05:00 | Sleep in two shifts; one person keeps `main` green | |
| **Sun 06:30 Freeze** | Fixes only; cached fallbacks verified | C |
| Sun 08:00 | At the venue | all |
| **Sun 08:40** | Submitted on Devpost, confirmed on a second device | C |

## Hand-offs (who waits on whom, and how not to wait)

| From | To | What | By | Until then |
|---|---|---|---|---|
| B | A, C | `contract:` PR: `packages/engine/src/schemas.ts`, `apps/web/convex/schema.ts`, Convex function stubs with the binding names | G0 03:00 | A and C write against shared-context section 6 as text |
| A | B, C | `data/fixtures/a/*.json` (one file per table) and `answer-key.json` | G0 03:00 | B and C use hand-written 3-row samples |
| A | B | Connectors (`packages/connectors/src/{jobber,qbo,gusto}`) with `normalize()` returning section 6 shapes and a `completeness()` result | G1 13:00 | B's sync action reads fixtures through a `FixtureConnector` with the same interface |
| B | C | Convex queries and mutations live on the dev deployment | from G0, growing | C renders fixtures through the same function names |
| C | B | Courier running against the dev deployment; templates and `Interpretation` schema in `packages/engine/src/messages/` | G1 13:00 | B tests `messages.inbound` with `bunx convex run` |
| A | B | `packages/engine/src/payroll` producing `Draft.lines` from fixtures | G2 18:00 | B fills Gusto with a hand-built `Draft` |
| B | A | `eval.summary` query and the stored flags for M1 | G2 18:00 | A scores against fixture flags |
| A | C | `eval/results.json` and `docs/PROOF.md` numbers | G3 23:00 | C shows placeholders labelled "measured at G3" |
| C | all | `docs/DEMO.md` script v1; Devpost draft | G3 23:00 | |

Rule: never block. If your dependency is late, build against fixtures and open your PR anyway. Say what you need in `docs/STATUS.md`, not in chat.

## The first hour, per person (01:45 to 03:00)

**Shanin (A).** (1) Create the Jobber developer tester account from the Getting Started signup link; authorize "PayrollPilot (Dev)" through GraphiQL once; run `timeSheetEntries(first: 5)` with header `X-JOBBER-GRAPHQL-VERSION: 2026-09-25`; note the user cap of the tester account. (2) Create the second Jobber app "PayrollPilot Seed" with write scopes. (3) Create the Gusto developer organization and application at dev.gusto.com; create a demo company from the portal; put the client id and secret in the shared `.env` message. (4) QuickBooks: confirm with Devaj whose developer account holds the sandbox; get tokens in the OAuth Playground. (5) Start `data/fixtures/a/` from the shared-context shapes. Log every result in `docs/INTEGRATIONS.md`.

**Devaj (B).** (1) Scaffold per shared-context 4.2 (Next.js in `apps/web`, `bunx convex dev`, workspaces, Biome, CI, `AGENTS.md`, `.env.example`). (2) H5: one table, one scheduled function, one HTTP action, one subscribed page. (3) H6: one structured-output call to `claude-opus-5-5` from a `"use node"` action. (4) H7: one embedding stored and searched with a company filter. (5) Open the `contract:` PR with the schema and function stubs. (6) Invite A and C to the Convex project.

**Varnika (C).** (1) Photon: in the dashboard, register the owner's phone and the second demo phone as project users; `bun create spectrum-project@latest courier --providers imessage`; send one message and receive one reply through `app.messages` without a tunnel. (2) Next.js skeleton: a page that subscribes to a Convex query and shows the fixture flags. (3) Start `docs/DEMO.md` with the shot list for the moment. (4) Register MLH and Devpost: create the Devpost project page now and add teammates.

## Rules we keep because we broke them last time

- Data first: seed the sandboxes and pull real data before building screens on fixtures alone.
- Every PR targets `main`; after merging, check `main` has your code; write a line in `docs/STATUS.md`.
- Short, one-question texts with tappable or numbered answers. Never a pay amount in a text.
- The owner view is simple: stage, "what we need from you", one-tap actions; detail one click away.
- Prove each integration in the first hours (Jobber, Gusto, QuickBooks, Photon, Convex, Claude).
- Decisions live in repo files, not in chat.
- Private data (runbook, register rows, real names) never enters the repo, the UI, the video or Devpost.

## What judges must see (and who makes sure)

| Hyphenate asks | We show | Owner |
|---|---|---|
| Is it real enough? | Real Jobber, QuickBooks and Gusto sandboxes; a real company's cycles anonymized; completeness checks on screen; planted errors with an answer key and the measured recall and precision | A |
| Would you hire it? | Read-only sources, draft-only Gusto with no submit function, separation of duties on rules, every number traceable in the audit log, confidence and precedent on every flag, held items instead of guesses | B |
| Did we see something new? | Payroll inputs verified across three systems before the payroll tool ever runs; workers outside the official sync handled; fix-at-source re-checked on the next sync; owner-approved, backtested rules with provenance | B, A |
| The moment | Double-booked hours caught before the draft is filled; the text goes out; the reply lands; only that worker's disputed hours are held | C |
| Cal Hacks: Application, Intentionality, Functionality, Creativity, Technical Complexity | Named user (owners of small service companies), purposeful owner-first UI, live demo plus video, the "payroll inputs are the problem" framing, Convex + Claude + three sandboxes + deterministic engine | C |

## Stretch, in order, only if ahead

1. Company B (30-person HVAC, weekly) to prove generalization.
2. Stage 2 off-cycle Gusto draft.
3. Live run on Shanin's current real cycle to catch the double-booked hours for real.
4. Playwright reader as an Apify Actor; Backboard mirror.
5. Polish and a third rehearsal.

## Decisions the plan made that the team can overrule (say so in `docs/STATUS.md` by G0)

Convex + Next.js + a Bun courier (vs. Postgres + a worker); one-to-one texting on Photon's free plan with polls (vs. a paid group line); three named agents over one engine; Stage 2 math P0 and off-cycle fill P1; working name PayrollPilot; the sponsor list in `specs/final.md` section 11.
