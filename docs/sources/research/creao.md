# Creao AI research (2026-10-24, 13:40 PDT)

Legend: **VERIFIED** = read in an official page or doc (URL given). **UNVERIFIED** = inferred or not found.

Sources:
- Hackathon page (rules, tracks, rubric, limits): https://community.creao.ai/CalHacks2026?utm_source=calhacks13-2026&utm_medium=hackathon&utm_campaign=hackathons-oct-2026 (a JS page; plain fetchers get only the title, read in a browser).
- Full docs as one file: https://docs.creao.ai/llms-full.txt (all doc pages concatenated). Product: https://agent.creao.ai. Developer API: https://developer.creao.ai.
- The criteria Google Doc linked from the prize page is still access-restricted; the hackathon page above carries the same rules and rubric, so we no longer need it.

## 1. The hackathon offer and the one rule (VERIFIED, hackathon page)

- **Sign up through the hackathon link** for an upgraded account: "Pro-level features, paid models, scheduled runs, and extra credits for the weekend." The privacy page says hackathon signups get one month of Pro Plus. Out of credits: ask in their Discord or at the booth; "We top up hackers on request."
- **The rule, quoted:** "At least one CREAO agent does the core work of your project."
  1. Build that agent on agent.creao.ai (more than one is fine).
  2. In the Devpost README, include **a share link to one of the agent's runs and the agent ID** (shown on its page).
  3. **Show the agent running in the demo.**
- On Devpost, **select the CREAO track**: "Projects that don't select the track won't be judged for it."

## 2. Tracks (VERIFIED, hackathon page)

| Track | Prize | Their question | "Win if" | "Build with" |
|---|---|---|---|---|
| Best AI-First Disruptor | $2,500 | "Remove the agent, and the product stops working." | "your app runs on the agent's output, end to end." | API Trigger + webhooks, connectors, Browser Use, your own tools |
| Best One-Person Company | $1,500 | "One human operating like a funded startup." | "you show an org chart of agents that hand work to each other." | one saved agent per role, coordinated by a scheduled /workflow or an orchestrator via API Trigger |
| Best Team Empowerment | $1,000 | "Agents as the connective tissue between people." | "your agents make a team work better together without replacing anyone." | Slack, Teams or Notion connectors, scheduled runs, webhook handoffs |

Winners also get CREAO Launchpad (1 year of Pro Max, mentorship, demo and launch support, interviews).

## 3. Rubric (VERIFIED, hackathon page)

| Weight | Criterion | Their words |
|---|---|---|
| 30% | AI as foundation | "Remove the agent. Does the product stop working?" |
| 25% | Depth on CREAO | "Did you extend it with your own tools, APIs, or agents, or call it from your product? We check the links in your README." |
| 20% | Originality and ambition | "Is this a new kind of product, or a chatbot wrapper?" |
| 15% | Track fit | "Does it clearly answer the track's question?" |
| 10% | Demo and storytelling | "The live demo works, and the pitch names what CREAO is doing." |

Their pitch tip: say out loud "Remove the agent, and this product dies," then prove it.

## 4. Limits they state (VERIFIED, hackathon page)

- "Runs take minutes. Design for async work: show progress in your UI, and don't hold a request open waiting for a run. There's no live token streaming on the API Trigger."
- Every run spends credits; an orchestrator that starts many agents spends many runs; "don't let an agent start itself."
- `capi_` keys stay on the server, never in browser or repo code.
- Sandboxes are per conversation; save packages with Create Agent or Update Environment. "Saving is done in the agent.creao.ai interface; the API only runs agents."
- Writes in connected apps follow the agent's write setting; set it to auto for unattended writes.
- Tip: role agents coordinated through the API Trigger, keys in Secrets, continuity via `threadId`.

## 5. Platform facts that matter to us (VERIFIED, docs.creao.ai)

- **Agents:** a saved chat session with a structured input form, version history, reference files (scripts up to 10 MB each, 50 per agent) mounted into the sandbox on every run, form inputs passed to scripts as env vars. A default model per agent; Claude Opus 5.5 and Sonnet 5.5 are on the list.
- **Sandbox:** a Linux sandbox per thread (Python, Node, packages persist in the thread; pauses after 30 min idle, resumes in about a second). Agent runs start from the agent's saved environment snapshot; packages installed during a run are not saved back.
- **API Trigger (app-scoped):** `POST https://agent.creao.ai/api/v1/apps/{appId}/runs` with `Authorization: Bearer capi_…` and `{"inputs": {...}, "webhookUrl": "..."}`. Returns a run id; poll `GET …/runs/{runId}`. The webhook POSTs `runId`, `status`, `threadId`, `result.text`, `result.artifacts`; at least once (dedupe on `X-Creao-Delivery-Id` or `runId`), up to three attempts, 10 s timeout, no redirects, must be a public URL (a Convex HTTP action qualifies). No error details in the webhook; poll for `errorCode`. Runs that fail before starting (for example no credits) send no webhook, so keep polling as the fallback.
- **CREAO CLI API:** `developer.creao.ai/v1/*` with a `cr_sk_` account key: async runs, realtime streaming, webhooks, agent create and edit, usage.
- **Scheduled runs:** cron or interval, at least 5 minutes apart; Pro Plus or higher; optional email summary; skipped (not failed) when out of credits, auto-paused after 2 skips.
- **Approvals ("Ask first"):** gate writes and destructive actions on Creao's built-in connectors only. **Runs started by API, CLI or Slack cannot pause for approval;** an "Ask first" agent just refuses those writes. Our approvals therefore have to live in our app.
- **Connectors:** built-in MCP connectors include QuickBooks (reports, invoices, customers), Gmail, Slack, Sheets, Notion. No Jobber, Gusto or iMessage. **Custom MCP servers** are supported over HTTPS with an API key, bearer token or no auth; tool schemas are fetched from the endpoint. Secrets are injected into every sandbox as env vars.
- **Memory:** account-wide `save_memory` / `memory_search` (preferences, facts, decisions, entities), injected into new chats; **playbooks** generated automatically from past conversations (statuses Active, Current, Pending, Archived). Not scoped per company, not backtested, not approved by an owner.
- **Dynamic workflows:** `/workflow <goal>` proposes a multi-step plan as a graph; runs after approval; can be saved as a workflow agent and scheduled.
- **Dashboards:** agents can render fixed-layout widget dashboards in Creao; our UI stays in Next.js.

## 6. Privacy (VERIFIED unless marked, docs.creao.ai Privacy, AI & Model Usage, Data Retention)

- Data passes through Creao (AWS) and the chosen model provider. Secrets and files are encrypted at rest. "Most CREAO model-provider API paths do not use your data to train AI models"; the exceptions are named per model in the docs.
- Conversation data, run inputs and results are stored; deletion is per account or per item.
- **Browser Use's provider may use page content to train its models, with no opt-out.** Never use Browser Use on payroll or company pages.
- **UNVERIFIED:** any finance-specific privacy guarantee. Nothing in the docs goes beyond the above, so "Creao keeps finances private" is not a claim we can make in the pitch. We keep our own rule: IDs instead of names before data reaches any model, and texts never carry pay amounts.
