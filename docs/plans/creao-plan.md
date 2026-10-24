# Creao plan: verified against Creao's own docs (Sat Oct 24, 15:10 PDT, B)

Replaces the open decisions in [handoff-creao.md](handoff-creao.md). Every platform fact below was read today in one of three places: the hackathon page (`community.creao.ai/CalHacks2026`), its Tech Stack page (`/CalHacks2026/tech`), and the full docs file `docs.creao.ai/llms-full.txt`. Where the handoff or [research/creao.md](../sources/research/creao.md) said something different, section 2 says so.

**Verdict: GO, gated by a 90-minute spike.** Creao helps us in three concrete ways and has no deal-breaker for how we would use it. If the spike fails, we drop Creao and nothing else in the plan changes.

## 1. Why Creao helps us (and only where it does)

1. **It removes our biggest blocker for most agent work.** There is still no `ANTHROPIC_API_KEY` in Convex, so every Claude call is blocked. A Creao agent runs Claude Opus 5.5 on Creao's credits (paid model; the hackathon upgrade covers it). If the batch agents run on Creao, only reply interpretation still needs our own key, and that has a no-model fallback (section 4).
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

### What stays in our code (unchanged spec)
- **Reply interpretation (the live path):**
  1. A poll vote or a bare number maps to an option with no model.
  2. `STOP` is handled in code.
  3. Free text goes to Haiku 5.5 through the direct `complete()` adapter, when the Anthropic key exists. Without the key, free text gets a numbered follow-up question.
- All pay math, checks, holds, gates, Gusto prepare/update/calculate, the rules and lessons store, and backtests.
- **The fallback adapter.** The same agent prompts can run through the direct `complete()` adapter (`b/llm-ready`) if Creao is down on demo day. It is a safety net, never pitched.

## 4. Build plan (B), in order

| Step | What | Who | Time | Done when |
|---|---|---|---|---|
| S0 | Sign up through the hackathon link; give the email to the booth for Pro Plus; ask for credits | Devaj (human) | 15 min | Account shows Pro Plus; scheduled runs available |
| S1 | Convex: `/agent/*` HTTP API (reads above + `run_checks`), bearer `PAYROLLPILOT_KEY`; keep `/mcp` | B (code) | 45 min | curl round trip from outside |
| S2 | **Spike**: in Creao, add the secret; chat until the agent runs our `run_checks` + `get_flags` via a script; Create Agent; trigger it from Convex with `webhookUrl`; add a schedule; measure wall time | Devaj (human) + B | 60 min | All 5 pass checks in section 5 |
| S3 | Controller: `creao.start(agent, cycleId)` action (API Trigger, idempotencyKey), `/creao/webhook` (re-fetch run, dedupe on runId), `creaoRuns` table, progress state for the UI | B | 60 min | A run started from the dashboard shows pending → completed in the audit log |
| S4 | Auditor proposals: `propose_matches`, `propose_expense_kinds`, morning brief | B | 60 min | Planted CHK-01 entries get proposed matches; under 0.85 becomes ask |
| S5 | Messenger drafts: `propose_questions` (QuestionDraft, `assertNoMoney`) | B | 45 min | Open routed flags have draft questions waiting for approval |
| S6 | Analyst: `get_history` + `propose_rules` → backtest → proposed rules | B | 90 min | Company A onboarding proposes rules; graded against `rules.json` |
| S7 | Devpost: agent ids, a run share link, CREAO track selected; demo shows a run in progress and the org chart | C (Varnika) | 20 min | README links work |

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

1. Sign up: https://community.creao.ai/CalHacks2026 → Register (hackathon link). Then send the account email to the CREAO booth (or their Discord) for the Pro Plus upgrade and credits.
2. In Creao, open Secrets → add `PAYROLLPILOT_KEY` (value: `bunx convex env get MCP_KEY` in `apps/web`; it is the same key until we split them).
3. Settings → API Keys → create an account `capi_` key, then set it in Convex with `bunx convex env set CREAO_API_KEY <key>`. Don't paste it in chat or the repo.
4. During S2: build the Auditor by chatting (B gives the exact prompt), click Create Agent, set its default model to Opus 5.5, and add a nightly schedule.
