# Creao plan: verified against Creao's own docs (Sat Oct 24, 15:10 PDT, B)

Replaces the open decisions in the Creao handoff (retired; in git history at `a90563e`). Every platform fact below was read today in one of three places: the hackathon page (`community.creao.ai/CalHacks2026`), its Tech Stack page (`/CalHacks2026/tech`), and the full docs file `docs.creao.ai/llms-full.txt`. Where the handoff or [research/creao.md](../sources/research/creao.md) said something different, section 2 says so.

**Verdict: GO, gated by a 90-minute spike.** Creao helps us in three concrete ways and has no deal-breaker for how we would use it. If the spike fails, we drop Creao and nothing else in the plan changes.

## 0. Decisions (updated Sat Oct 24, 18:00 PDT, B)

**Decided by Devaj**
1. **Creao stays in.** The three batch agents (Auditor, Messenger, Analyst) run as saved Creao agents on Opus 5.5, started by our Convex controller. The live reply path stays in our own code.
2. **Agents are created by a repo script** on the CREAO CLI API (`cr_sk_` key), so they are reproducible. Building them by chatting in the UI is the fallback.
3. **S0 is done.** Devaj signed up through the hackathon link and gave the email to the booth for Pro Plus.
4. **Build to the plan, not to a cut-down version.** Plan fallbacks are used only when a key or service is missing, and each one is labelled in the code and in section 9.

**Defaults B chose (Devaj can change any of them; the code keeps both paths open)**
5. **Free-text replies are read by Haiku 5.5** through `complete()`, as the original plan says. Numbers, poll votes, `STOP` and clock times are read by code first, with no model. Jev is an optional faster path for the same job (J2), only if a Jev key arrives. Until `ANTHROPIC_API_KEY` is set, free text gets one follow-up and is then held.
6. **Extra flagging beyond the fixed checks:** the Creao Auditor may raise `AGT-01` agent flags for vague cases, with a reason and evidence ids. They always route to the owner as a question and never block or correct anything. This needs a `contract:` PR adding `AGT-01` to `CheckId`. Jev entry scoring (J1) is optional and comes last: no key yet, and its accuracy figures are the vendor's own.

**Still open (nothing blocks on them)**
- Jev at all (J1/J2), and its thresholds if used.
- `creaoRuns` table (a `contract:` PR) vs. run state kept only in `auditEvents`. Default: a `creaoRuns` table, because the UI needs pending/running/done per run.
- Telling Varnika: the morning brief and run progress need a place in the UI.

## 1. Why Creao helps us (and only where it does)

1. **It removes our biggest blocker for most agent work.** There is still no `ANTHROPIC_API_KEY` in Convex, so every Claude call is blocked. A Creao agent runs Claude Opus 5.5 on Creao's credits (paid model; the hackathon upgrade covers it). With the batch agents on Creao, our own Anthropic key is needed only for reading free-text replies (Haiku), which has a no-model fallback.
2. **It matches our architecture.** The spec already has three agents (Analyst, Auditor, Messenger) and a plain-code controller. Creao's One-Person Company track asks for "an org chart of agents that hand work to each other", built as "one saved agent per role, coordinated by … an orchestrator via API Trigger". Our Convex controller is that orchestrator.
3. **It gives us the "runs while you sleep" part for real.** Scheduled runs (every 5 minutes or slower) can run the cycle's checks overnight and have the owner's list ready by morning.

Where it does **not** help, and we don't use it: money, approvals, rules and lessons (our code owns them), and the live reply on stage (runs take minutes).

## 2. Verified facts that change the handoff

| Topic | Handoff said | Docs say (verified) | Effect on us |
|---|---|---|---|
| Our own tools | "Custom MCP servers over HTTPS" is the way in | Custom MCP servers appear only in the Privacy page's connector table (auth: API key, bearer or none). No setup guide. The Tech Stack page's documented path is **"Your services + Secrets"**: store our key in Secrets, and the agent calls our HTTP API from its sandbox. | Primary path: a bundled script calls our Convex HTTP endpoint with `PAYROLLPILOT_KEY` from Secrets. The `/mcp` endpoint (already live) is the bonus path if the MCP connector UI exists. |
| Creating agents | "Saving is done in the UI; the API only runs agents" | True for `capi_` keys. The CREAO CLI API (`cr_sk_` key, developer.creao.ai) can create agents (`POST /v1/agents`), edit them, and manage agent files and secrets. | We can create and update the three agents from a script. Fallback: build them by chatting in the UI. |
| Streaming | "No live token streaming" | No streaming on the API Trigger. The CLI path has `POST /v1/realtime/runs` (NDJSON). | It doesn't change the live-reply decision: a run still takes minutes end to end. |
| Memory | Account-wide, not owner-approved | Chat memory is account-wide. **Agent memory ("playbooks") is per agent**, with statuses `pending`/`approved`/`rejected`, readable and writable by API. | Still not our rule store (no per-company scope, no backtest). We may mirror approved rules into the agent's memory as context only. Not P0. |
| Models | Opus 5.5 and Sonnet 5.5 | Opus 5.5: paid plan. Sonnet 5.5: everyone, the default. **Haiku 5.5 is not offered** (Haiku 4.5 is). Ids are provider-qualified (`anthropic/claude-opus-5-5`). | Agents default to Opus 5.5. Reply interpretation stays outside Creao anyway. |
| Webhooks | Dedupe on runId | Also: **webhooks aren't signed**. Verify each by fetching `GET /api/v1/runs/{runId}` with our key. Optionally add a random token to the callback URL. | Our webhook handler re-fetches the run before trusting it. |
| Retries | — | `idempotencyKey` (8–128 chars) on run creation returns the same run on a retry. | The controller sends `cycleId:agent:attempt` so a retry never doubles credits. |
| Upgrade | Sign up through the link | Sign up through the link, **then give your account email to the CREAO booth**; they upgrade every registered hacker to Pro Plus. | A human step. Scheduled runs need Pro Plus. |
| Privacy | No finance-specific promise | Confirmed. The Anthropic path is not used for training. Creao stores runs and inputs. Sampled conversation text may be used for internal quality evaluations by another provider. | Ids only, as today. Never names, phone numbers, notes or pay in what a Creao agent sees or returns. Never Browser Use. |

Unchanged and verified: runs take minutes; API runs cannot pause for "Ask first" approvals; every run spends credits (minimum 0.1 per run); a schedule auto-pauses after 2 runs skipped for lack of credits; secrets are injected into every sandbox; agent reference files (up to 50, 10 MB each) are mounted on every run and form inputs arrive as env vars; webhooks retry up to 3 times and must be public HTTPS.

## 3. Architecture

```
Convex (system of record, controller)                         Creao (agent.creao.ai)
  cycles stage machine ──API Trigger (capi_, idempotencyKey)──▶ Auditor agent  ─┐
  creao.ts runs table  ◀──────── webhook /creao/webhook ─────── Messenger agent ├─ each runs a bundled
  /agent/* HTTP API    ◀── PAYROLLPILOT_KEY (Creao Secret) ──── Analyst agent  ─┘   script: GET work, POST proposals
  zod validation at the door; every proposal lands as "proposed"/"draft"; humans approve in our app
```

- **Agents read and write only through our endpoints.** Reads return ids, dates, hours, check ids and statuses. Writes are proposals that we validate with the existing zod schemas and store as `proposed` or `draft`. Anything invalid is rejected with a reason, and the agent can retry once.
- **Hand-offs are audit events.** Examples: "Auditor flagged 12, routed 3 to Messenger". Each event is written with `actor.kind: "agent"` and the agent's name, which gives us the org chart on screen.
- **The controller starts runs; agents never start each other or themselves.** That keeps credits bounded at about 3 runs per cycle.

### The three agents

| Agent | Trigger | Reads (our API) | Proposes (zod schema) | Lands as |
|---|---|---|---|---|
| **Auditor** (nightly cycle run) | Creao schedule (nightly) + controller after a sync | `list_cycles`, `run_checks`, `get_flags`, unmatched entries with candidate jobs | `MatchDecision[]` (entry to job; under 0.85 becomes an ask), `ExpenseKind[]` | Flags get `confidence` and a proposed match. Plus a morning brief (a text artifact) of what needs the owner. |
| **Messenger** (question drafter) | Controller, after the Auditor finishes | Open flags routed to people, with worker role and job ids | `QuestionDraft[]` (no money; poll options when 4 or fewer) | `questions` with `status: "draft"`. The owner or manager approves, then the courier sends. |
| **Analyst** (onboarding + learning) | Controller on onboarding; after answers are corrected | Past cycles, ids only (entries, jobs, past payrolls, answered questions) | `ProposedRules`, `LessonClassification` | `rules` with `status: "proposed"`, which our code backtests. The owner approves. |

### Jev (optional; see section 0, items 5 and 6)

Jev answers typed multiple-choice questions with a calibrated probability in about 70–500 ms. It doesn't write text. Cost: about $0.042 per million input tokens. Accuracy figures are the vendor's own; a wrong choice is still possible, which is why a Jev result only ever creates a question.

| Job | Input (ids and scrubbed text only) | Output | Above threshold | Below threshold |
|---|---|---|---|---|
| **Entry scoring** | Each entry the checks didn't flag: hours, dates, job status, worker role, ids | "Is this entry unusual?" yes/no with probability | Entry becomes a suspect: an `AGT-01` question for the owner, with the score as evidence | Nothing happens |
| **Reply interpretation** | The question's options plus the worker's reply, scrubbed by `scrub` | One option with probability | Answer recorded as that option, cited to the reply | Numbered follow-up to the worker |

- **Where it lives:** an engine-side typed request builder (pure, tested) and a thin Convex action that calls Jev with `JEV_API_KEY`. No names, phone numbers, notes or pay amounts are sent.
- **Thresholds:** start at 0.80 for scoring and 0.85 for replies (matching the 0.85 match rule); tune on the sample cycle. Stored as constants, not per-company config.
- **Example:** a worker replies "the second one" to "Which job were you on Tuesday? 1) Job 12 2) Job 15". Jev returns option 2 at 0.97, so the answer is recorded as Job 15.

### What stays in our code (unchanged spec)
- **Reply interpretation (the live path):**
  1. A poll vote or a bare number maps to an option with no model.
  2. `STOP` is handled in code.
  3. Free text goes to Haiku 5.5 through `complete()` with the question and its options (Jev instead, if J2 is turned on). Confidence 0.8 or more applies the answer as a correction proposal; below that, or with no key, the worker gets one follow-up, then the item is held.
- All pay math, checks, holds, gates, Gusto prepare/update/calculate, the rules and lessons store, and backtests.
- **The fallback adapter.** The same agent prompts can run through the direct `complete()` adapter (`b/llm-ready`) if Creao is down on demo day. It is a safety net, never pitched.

## 4. Build plan (B), in order

| Step | What | Who | Time | Done when |
|---|---|---|---|---|
| S0 | ~~Sign up through the hackathon link; give the email to the booth for Pro Plus~~ **done** | Devaj (human) | — | Account shows Pro Plus; scheduled runs available |
| S1 | Convex: `/agent/*` HTTP API (reads above + `run_checks`), bearer `PAYROLLPILOT_KEY`; keep `/mcp` | B (code) | 45 min | curl round trip from outside |
| S2 | **Spike**: Devaj adds the secret and a `cr_sk_` key; `scripts/creao-agents.ts` creates the Auditor (`POST /v1/agents`); trigger it from Convex with `webhookUrl`; add a schedule; measure wall time | Devaj (human) + B | 60 min | All 5 pass checks in section 5 |
| S3 | Controller: `creao.start(agent, cycleId)` action (API Trigger, idempotencyKey), `/creao/webhook` (re-fetch run, dedupe on runId), `creaoRuns` table, progress state for the UI | B | 60 min | A run started from the dashboard shows pending → completed in the audit log |
| S4 | Auditor proposals: `propose_matches`, `propose_expense_kinds`, morning brief | B | 60 min | Planted CHK-01 entries get proposed matches; under 0.85 becomes ask |
| S5 | Messenger drafts: `propose_questions` (QuestionDraft, `assertNoMoney`) | B | 45 min | Open routed flags have draft questions waiting for approval |
| J1 (optional) | Jev entry scoring: engine request builder + Convex action; above threshold raises `AGT-01` | B | 45 min | A planted odd entry on a closed job becomes a question |
| J2 (optional) | Jev reply interpretation: options + scrubbed reply → option or follow-up | B | 30 min | "the second one" maps to option 2; a vague reply gets a numbered follow-up |
| S6 | Analyst: `get_history` + `propose_rules` → backtest → proposed rules | B | 90 min | Company A onboarding proposes rules; graded against `rules.json` |
| S7 | Devpost: agent ids, a run share link, CREAO track selected; demo shows a run in progress and the org chart | C (Varnika) | 20 min | README links work |

**Build order:** the texting loop first (B-08 to B-11, it is what the demo shows and needs no Creao), then S3 → S4 (with `AGT-01`) → S5 → S6, then J2 and J1 only if Jev is turned on.

**Cut order (lowest value first):** S6 on Creao (Analyst falls back to the direct adapter, or is cut) → S5 → schedule (manual trigger only). The S2 spike and the Auditor are the minimum that satisfies the Creao rule.

## 5. Go/no-go spike (S2), time-boxed to 90 minutes

All five must pass, or we drop Creao:
1. The account is upgraded and an agent can use `anthropic/claude-opus-5-5`.
2. A Creao agent run calls our endpoint with the secret and gets real flags back (ids only).
3. A run started from Convex via API Trigger completes, and our webhook receives it; re-fetching the run confirms it.
4. A schedule fires a run on its own.
5. One Auditor run finishes in **under 5 minutes**. We also measure credits per run, which must fit the weekend budget at about 10 runs per hour of demo rehearsal.

Log the result as a row in `docs/INTEGRATIONS.md`.

## 6. Deal-breakers we checked (none found)

| Would be a deal-breaker | Finding |
|---|---|
| The agent cannot call our backend | Documented: Secrets + HTTP from the sandbox (Tech Stack "C"), plus bundled scripts |
| Approvals would have to live in Creao | No: API runs can't pause anyway; approvals stay in our app, as the spec already says |
| Payroll data would leave our control | Only ids leave; our scrubber rules apply to the agent API responses |
| The live demo depends on a minutes-long run | No: the live reply path stays in our code; Creao runs are shown as async progress |
| Unbounded credits | The controller starts at most about 3 runs per cycle, never self-triggered; a schedule auto-pauses on no credits |

## 7. Pitch and track

- **Track:** Best One-Person Company. Our org chart is literally three role agents handing off under an API-Trigger orchestrator. Check on Devpost whether AI-First Disruptor can also be selected; if so, select both.
- **The line:** "Remove the agent, and this product dies. Without the Analyst there are no rules learned from history; without the Auditor, no fuzzy matches or morning list; without the Messenger, no questions. What's left is a calculator." The math being code is the trust story, not a weakness.
- **Don't claim:** "Creao keeps finances private". Say instead: "Creao only ever sees ids."

## 8. Human steps for Devaj (nobody else can do these)

1. ~~Sign up through the hackathon link and give the email to the booth.~~ **Done.**
2. In Creao, open Secrets → add `PAYROLLPILOT_KEY` (value: `bunx convex env get MCP_KEY` in `apps/web`; it is the same key until we split them).
3. Settings → API Keys → create an account `capi_` key, then set it in Convex with `bunx convex env set CREAO_API_KEY <key>`. Don't paste it in chat or the repo.
4. Create a `cr_sk_` key at developer.creao.ai and keep it local (for example `CREAO_CLI_KEY` in your shell, never in the repo); the agent-creation script reads it from the environment.
5. Only if we use Jev: get a key and set it with `bunx convex env set JEV_API_KEY <key>`.
6. During S2: run the agent script, check the Auditor's default model is Opus 5.5, and add a nightly schedule.

## 9. What Creao changes in the original plan, ticket by ticket

The original plan ran the three agents inside Convex through `complete()`. With Creao, the agents run on Creao's computers and talk to Convex only through `/agent/*`. Everything else is unchanged.

| Ticket | Original plan | With Creao | Unchanged |
|---|---|---|---|
| B-03 model adapter | Every agent call goes through `complete()` | Used for reply reading (Haiku) and as the fallback that runs the same agent prompts if Creao is down | Scrubber, schema validation, audit of every call |
| B-07 matching and the Auditor | Auditor model call for 0.5–0.95 matches inside Convex | The Creao Auditor gets the candidates through `/agent/*` and proposes `MatchDecision`s; it also writes the morning brief and may raise `AGT-01` | Code matches at 0.95 or more with no model; under 0.85 becomes an ask (code downgrades); proposals only |
| B-08 Messenger drafting | Messenger drafts every question from C's templates | Code fills C's templates for the five template kinds (CHK-01/02/03/04/14). The Creao Messenger drafts `QuestionDraft`s for person-routed flags that have no template | Owner or manager approves every text; no money in texts; one open question per phone |
| B-09 interpretation | Haiku reads replies | Same (Haiku; Jev optional). Not on Creao: a run takes minutes | `STOP` by code; one follow-up, then held; reminders and expiry |
| B-10 corrections | Auditor builds `CorrectionProposal` from an interpretation | Code builds the proposal for the five template kinds (the answer maps to one field); the Creao Auditor proposes for the rest | A person approves; pay effect computed by the payroll engine |
| B-13 Analyst onboarding | Analyst proposes rules from aggregated history in Convex | The Creao Analyst reads aggregates (ids only) through `/agent/*` and proposes `ProposedRules` | Code aggregates first, validates evidence ids, backtests; owner approves |
| B-14 learning loop | Analyst classifies each lesson | Classification is a short call: runs through `complete()` in Convex (seconds), not a Creao run (minutes) | Lessons, vector search, backtest, separation of duties, active rules feed the next cycle |
| New: B-19 | — | `/agent/*` API, controller trigger, `/creao/webhook`, run state, agent-creation script | — |

## 10. Implementation status (Sat Oct 24, 18:00 PDT)

| Piece | Status |
|---|---|
| Contract (schema, function names) | merged (#15) |
| Model adapter `complete()` + scrubber (B-03) | PR #75 |
| Fixed checks CHK-01..12, 23 + `checks.run` (B-06) | PR #76; CHK-13..22 not started |
| Messages: templates (C-03) | merged (#77); courier app (C-02) still needs a PR to main |
| Texting backend: drafting, approval, outbox, inbound, reading replies, reminders (B-08/B-09) | in progress on `b/messenger` |
| Corrections, controller, Gusto draft, sync (B-10/B-11/B-12/B-05) | not started |
| Learning loop (B-13/B-14) | not started |
| Creao: `/mcp` and `/agent/*` read tools (S1) | built on `b/creao-mcp` and `b/agent-api`, live on dev, not merged |
| Creao: controller, webhook, agents (S3–S6) | not started |

Diagram: [creao-architecture.excalidraw](creao-architecture.excalidraw) (open it at excalidraw.com).
