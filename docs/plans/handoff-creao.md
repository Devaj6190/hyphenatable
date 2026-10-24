# Handoff: the Creao plan change (from Devaj, Sat Oct 24, 13:45 PDT)

Devaj (B) started this plan change and is handing it off; **Varnika takes it over.** Read this file, then [../sources/research/creao.md](../sources/research/creao.md) (the verified facts, with URLs). Nothing in the spec or the role plans has changed yet: the decisions in section 5 come first.

## 1. What Devaj asked for

Devaj talked to Creao at their booth. Their pitch matched many of our needs: privacy for financial data, a sandbox, agents that run while we sleep, and self-improvement. Devaj's instructions:

- Use Creao for as much of the agent and the automation as actually works. Find out what works and what doesn't.
- If Creao deviates a little from our agent or can't do one thing, **discuss it with the team**. If it is a big gap, **drop Creao and keep our own agent.**
- Also decide **where our agent and the rest of the system are hosted.**
- Run a grill-me session (one hard question at a time, each with a recommended answer), then rewrite the plan, everyone's tickets and `AGENTS.md`.

## 2. Where things stand (13:37)

- **The agent layer isn't built.** On `main`, B's work is the scaffold, `schema.ts` and the probes. The contract PR #15 is repaired and CI is green, but it isn't merged (it waits on A and C acks). The controller, Analyst, Auditor, Messenger, checks runner, learning loop and Gusto writer (B-03 and B-05 to B-16) don't exist yet. Swapping the agent layer is cheap now and gets expensive fast.
- **H6 (our own Claude call) is blocked:** Convex has no `ANTHROPIC_API_KEY`. Creao includes Claude Opus 5.5 and Sonnet 5.5 on its credits, which works around this for agent runs, but not for anything we call directly.
- A's payroll engine (Stage 1, Stage 2, reconcile) and the Company R backtest are on `main` and unaffected. C's UI and the courier are in progress and mostly unaffected.
- Submission is **Sun 9:00 AM**; G2 (the full loop) was due at 18:00.

## 3. What Creao requires (verified, hackathon page)

- **One rule:** "At least one CREAO agent does the core work of your project." The agent is built on agent.creao.ai. The Devpost README needs **a share link to one of its runs and the agent ID**. The demo shows it running. Select the CREAO track on Devpost.
- **Rubric:** 30% "remove the agent, does the product stop working?"; 25% depth (our own tools and APIs, called from our product); 20% originality; 15% track fit; 10% demo and saying what Creao does.
- **Sign up through the hackathon link** in [../sources/README.md](../sources/README.md) to get the upgraded account (paid models, scheduled runs, extra credits). The booth tops up credits on request.

## 4. How Creao fits our spec

**Fits well**
- **"Runs while you sleep":** scheduled runs (cron, at least 5 minutes apart) can run each cycle's sync and checks overnight and have the owner's "what we need from you" list ready by morning. That's the Hyphenate "Runs" pillar.
- **Three agents in an org chart:** our spec already has three Claude roles (Analyst, Auditor, Messenger) coordinated by a controller. Make them three saved Creao agents, triggered by our Convex controller through the API Trigger with webhooks back to Convex. That's the "Best One-Person Company" track almost word for word, and the 25% depth criterion.
- **Our own tools:** Creao supports custom MCP servers over HTTPS, so its agents can call our Convex backend: read the cycle snapshot, run the checks, propose flags, questions, corrections and rules.
- QuickBooks is a built-in connector (optional; our own connector already exists).

**Differs from our spec (the "discuss" list)**
1. **Approvals.** Creao's "Ask first" gates only its built-in connectors, and **runs started by API can't pause for approval.** Owner and manager approvals must stay in our app. Creao agents only *propose* through our tools; our code decides. This keeps the spec's segregation of duties, so the deviation is small.
2. **Self-improvement.** Creao memory and playbooks are account-wide, built automatically, not per company, not backtested and not owner-approved. Using them as our rules would break "would you hire it". Proposal: rules and lessons stay in Convex, and Creao memory holds only the low-risk items our spec already lets apply alone (message tone, who to ask first). Small deviation if we do that; big if we try to use playbooks as rules.
3. **Privacy.** The docs make no finance-specific privacy promise: data passes through Creao and the model provider, and is encrypted at rest. Don't claim "Creao keeps finances private" in the pitch. Keep our IDs-not-names rule, and **never use Browser Use** on company pages (its provider may train on page content).
4. **Speed.** "Runs take minutes," and the API doesn't stream tokens. Interpreting an employee's reply on stage can't wait minutes. Either the Messenger's reply step runs outside Creao (our own Claude call, which needs the H6 key) or the demo shows a progress state while the run finishes. **This is the biggest risk to the hero path.**
5. **"Remove the agent, the product dies" vs. "code owns the money".** These don't actually conflict. Code still does the math, holds and approvals. The agents do the judgment work: learning rules from history, fuzzy matching, deciding who to ask, drafting the question, interpreting the answer. Without them, PayrollPilot is a calculator with no flags explained, no questions and no learning. The pitch must say it that way. A fallback adapter that bypasses Creao is a demo safety net only, never pitched.
6. **Credits.** Every run costs credits, and an orchestrator that starts three agents per cycle spends three runs. Never let an agent trigger itself. Ask the booth for a top-up before the demo.

**Verdict so far:** every gap is small *if* we use Creao as the agent layer over our Convex tools and keep money, approvals and rules in code. The only gap that could become big is speed on the live reply. The spike in section 6 tests it.

## 5. Open decisions for the grill-me session (recommendation first)

Ask them one at a time and record each answer in `docs/STATUS.md`.

1. **Creao's role.** *Rec:* Creao hosts the three role agents (Analyst, Auditor, Messenger). Convex is the controller and the system of record. Alternatives: Creao for one agent only (a nightly readiness brief), or skip Creao.
2. **Which track.** *Rec:* Best One-Person Company (an org chart of agents handing work to each other is our architecture). Alternative: AI-First Disruptor, which has the bigger prize but whose "end to end on the agent's output" is a harder sell when code owns the money. Check on Devpost whether we can select more than one.
3. **The live reply path.** *Rec:* keep reply interpretation as a direct Claude call from Convex (get the Anthropic key in today), and run Creao for the overnight cycle, onboarding and question drafting. Alternative: everything through Creao, with a progress state on screen while the run finishes.
4. **Learning.** *Rec:* rules and lessons stay in Convex; Creao memory only holds low-risk preferences. Alternative: Creao playbooks as the lesson store (not recommended).
5. **Hosting.** *Rec:* Convex cloud (backend, scheduler, the webhook receiver and the MCP endpoint as HTTP actions). Next.js on Vercel. Agents on Creao. The Photon courier is a long-running Bun process that reads `app.messages`, so it can't run on Vercel or in a Creao sandbox (which pauses after 30 min idle). Run it on Railway or Fly, with a teammate's laptop as the demo fallback. Decide who owns the courier deploy.
6. **Who builds it.** Devaj is stepping off this. Decide who owns the Creao agents, the MCP endpoint, the API Trigger and the webhook: the person who takes over B's tickets. Varnika already owns the courier, UI and demo, so the load is heavy; consider moving Devpost and the video to Shanin after G3.
7. **Whose Creao account.** *Rec:* one team account through the hackathon link (team plans allow up to 3 to 5 seats). `capi_` keys go only in Convex env vars.

## 6. Go/no-go spike (time-box 90 minutes, pass only if all five work)

1. Sign up through the hackathon link and confirm scheduled runs and Claude models are available.
2. Expose one Convex HTTP action as an MCP tool (read-only, e.g. `get_cycle_snapshot` returning fixture data with IDs, no names), add it as a custom MCP server in Creao, and have a chat call it.
3. Save that chat as an agent; trigger it with `POST /api/v1/apps/{appId}/runs` from a Convex action, with a `webhookUrl` back to a Convex HTTP action that stores the result (dedupe on `runId`).
4. Create a schedule and watch one run fire on its own.
5. Measure wall time for a small run. Over about 90 seconds rules Creao out of the live reply path (decision 3 picks the alternative).

**If any of 1 to 4 fail, drop Creao** and keep the plan as it is. Log the result in `docs/INTEGRATIONS.md` as a new row.

## 7. What to update once the decisions are made

- `specs/final.md`: section 10 (agents, model, hosting), section 11 (the Creao line now has criteria), and a new row in section 14 for each decision.
- `docs/plans/00-shared-context.md`: stack, contracts (the MCP tool list and the webhook payload), clock, cut order (add "Creao scheduled run" and "Creao for the live reply" near the top of the cut list).
- `docs/plans/B-agent-backend.md`: rewrite B-03 (adapter becomes the Creao trigger plus webhook, with a direct-Claude fallback), B-07 (Auditor), B-08 and B-09 (Messenger), B-13 and B-14 (Analyst) as Creao agents calling MCP tools; add a ticket for the MCP endpoint.
- `docs/plans/C-product-messaging-demo.md`: the Devpost README needs the agent ID and a run share link; select the CREAO track; the demo shows a Creao run (progress state in the UI); add the line "Remove the agent, and this product dies" to the pitch.
- `docs/plans/A-data-payroll.md`: probably no change; the MCP tools wrap A's engine.
- `AGENTS.md`: the new layout and the rule that `capi_` keys never leave the server.
- `docs/STATUS.md`: one line per decision.
