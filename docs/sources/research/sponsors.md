# Cal Hacks 13.0 sponsor / prize research (2026-10-24)

Legend: **VERIFIED** = read in an official page/doc (URL given). **UNVERIFIED** = inferred, secondary, or not found.

## How the prize data was obtained

- https://hive.hackberkeley.org/prizes is a Next.js page that renders "Loading prizes…" and then fetches **`https://hive.hackberkeley.org/api/live/prizes`** (JSON). JSON metadata: `updatedAt 2026-10-24T04:55:19Z`. All "prize page" quotes below are VERIFIED from that endpoint.
- Devpost `https://calhacks-13.devpost.com/` returns 403 to fetchers (UNVERIFIED whether it exists; it was not needed).
- Google Docs linked from the page: Atlassian and Figma docs exported fine via `/export?format=txt` (curl). **Creao doc is access-restricted** (401 anonymously; "Can't access item" even when signed in as the user's Google account). The Hyphenate track doc has no URL on the prize page but was found in the user's Google Drive (shared with them 2026-10-24) and read via the Drive connector.

---

## 1. Full prize list (VERIFIED, https://hive.hackberkeley.org/api/live/prizes)

### Cal Hacks organizer prizes (no criteria text on page)
First Overall: MacBook Air 13" M5 · Second Overall: Nintendo Switch 2 · Third Overall: Google Intelligent Eyewear · Most Creative Hack: Instax camera + film · Most Technically Complex Hack: NuPhy Air60 HE · Best People-First Hack: Apple Watch SE 3 · Best Planet-First Hack: America the Beautiful Parks Pass · Best Hardware Hack: Bambu Lab A1 Mini · Best Beginner Hack: AirPods 4 · Best Solo Hack: AirPods Pro 3 · Hacker's Choice: Logitech MX Master 4.

### Sponsor prizes (title | prize | criteria as written)

- **Best Use of Notability** | 1 yr Notability Pro + merch | Process / Detail / Feature Usage / Relevance of notes taken in Notability.
- **Meta: Bringing People Closer Together with AI** | invite to Round 2 hackathon at Menlo Park (travel provided) + swag | "judged on how meaningfully they strengthen human connection, how essential and well-integrated AI is, originality, and the strength of the working demo."
- **Best Use of Nessie (Capital One)** | $300 Giftogram per person | "Completeness, Creativity, Complexity".
- **Best Use of the Factory Droid SDK (Factory)** | $2000 cash, Factory credits, swag | full text in §2.
- **Best Use of Fetch.ai** | page says 1st $1500 / 2nd $1000 / 3rd $500; Fetch's own page says $1,250 / $750 / $500 + 2×$250 special recognition (discrepancy) | link https://www.fetch.ai/events/calhacks-13-0 ; hackpack https://www.fetch.ai/events/hackathons/calhacks-13-0/hackpack. Mandatory: register ≥1 agent on Agentverse, implement Agent Chat Protocol, discoverable/usable through ASI:One, primary workflow completed inside an ASI:One conversation, public GitHub repo, 3–5 min video, register via ASI:One Submission Agent. Judging: functionality 25%, use of Fetch tech 20%, innovation 20%, impact 20%, UX/presentation 15%. (VERIFIED from hackpack.)
- **Best Security Hack, sponsored by Armadin** | Apple headphones | "Coming soon!"
- **Best Use of x402 by Coinbase** | $500 USDC + recruiter call per team member per track, two tracks (up to $4000 total) | PDF https://drive.google.com/file/d/12TnPLguduV3gh1zY_TJ176XmVDz2RGW9/view (VERIFIED, read). Tracks: **Payment Agents** ("Give an agent a way to pay for things, earn money, or both. Use the Coinbase MCP for Agents and x402"; example: "manages the budget for a small business") and **Trading Agents**. Judging: Usefulness, Technical design, Ease of reuse, Product feedback. "Real-money transactions are not required. Label simulated actions clearly." Eligibility: 18+, US/Canada (not Quebec) resident, verified Coinbase account. Submit: project summary, working example, architecture, builder feedback. Docs: https://docs.cdp.coinbase.com/ai-agents/overview, https://docs.cdp.coinbase.com/x402/welcome, keys at portal.cdp.coinbase.com.
- **Creao AI — Best AI-First Disruptor ($2500) / Best One-Person Company ($1500) / Best Team Empowerment ($1000 total across tracks)**; each winner joins "CREAO Launchpad: 1 year of CREAO Pro Max ($1,440 value), product/technical/founder mentorship, CREAO meet-and-greet, demo opportunities, launch support and amplification, and career/interview opportunities" | criteria doc https://docs.google.com/document/d/1N1imAn1aBrA1JPoz5X_sjyOsQggUfPvJW2UIIFmdHf4/edit — **NOT READABLE (restricted; request access or ask at the Creao booth). Criteria UNVERIFIED.** What CREAO is (VERIFIED https://creao.ai/): "CREAO builds AI agents that run your work" — describe a recurring task, it builds an agent that runs on a schedule inside your tools; plans Free/Pro $20/Pro Plus $50/Max $150/Ultra $1000.
- **CRS Financial Intelligence Challenge (CRS Credit API)** | Best Overall $1,000; Best Financial AI Agent $500; Best Identity/Fraud Innovation and Most Unexpected Use: FDE interview | "The only rule: make meaningful use of the CRS sandbox and show it working live in your demo." Criteria: "Use of CRS: how central CRS data is to the product, not a bolt-on"; working demo live against sandbox; usefulness; creativity. "Best Financial AI Agent ($500): an AI agent that does real work with CRS data, using our API or MCP server." Sandbox/keys: https://calhacks.crscreditapi.com (VERIFIED: credit reports, FICO/Vantage, IDV/KBA, prefill, business credit, OFAC; MCP server npm `@crscreditapi/crs-calhacks-mcp-server`; base URL api-sandbox.stitchcredit.com; email invite to get keys). "Use the provided test identities only."
- **The Hyphenated Enterprise: Autonomous Systems for Finance (Hyphenate)** | $8000 / $5000 / $3000 top 3; expedited interview for top 5 | full text in §9.
- **Best Use of Cartesia** | Meta glasses (TBD) | voice core to product; 25% each: problem/originality, use of Cartesia, execution, impact & responsibility; submit demo, 2-min demo-first presentation, README, source. Docs https://docs.cartesia.ai.
- **Best Use of Bitdeer AI Model Studio** | $500 credits + mice / $200 credits + LEGO | Innovation 30%, Technical 30%, Use of Model Studio 20%, Impact/Presentation 20%.
- **Figma (title "TBD")** | Amazon gift cards + recruiter session; doc says Best Design $500, Most Creative $500, Best Figma Workflow $2000, Best Stage Log $2000 | doc https://docs.google.com/document/d/1HjzThDGveSLiilIdEPEHq12ZVLZ5eS0T8CQC5_m_-rg (VERIFIED, read). "Idea To Demo": submit 3-min demo video, a stage log (≤200 words/stage across Ideation/Prototyping/Handoff/Code generation: which Figma tool, minutes spent, 1–5 rating, how output reached the project), Figma Slides (required), embedded Figma Make/prototype files + repo link, Edu-verified, files viewable by "Anyone". Judging: Workflow Design, Adoptability, Output Quality, Presentation, Innovation. "we're not judging on scope or technical difficulty."
- **Best Use of Moss** | AirPods Max/Pro | looking for: Voice AI agents; "Personal Agent: Agent that remembers you, works across your apps, and autonomously handles everyday tasks"; Social post engagement.
- **Make it Legendary with SpaceXAI** | Cursor mechanical keyboard | must be built with Cursor; must use Grok Imagine or Voice API; bonus for Grok Bot.
- **Best use of Convex** | $5,000 cash | see §3.
- **Microsoft Grand Prize: Built for the Real World** + **Microsoft Customer Impact Award** | see §4.
- **Best use of Apify** ($5,000: $2000/$1000/$800/$400/$400) + **Best Actor** ($400) | see §7.
- **Elastic** | Quest 3S / Bose | "Coming soon!"
- **Visa: Reimagining Shopping** | $5,000 | Innovation 25, UX 25, Technical 20, Commerce impact 15, Trust 15.
- **AfterQuery, Annapurna Labs** | "Coming soon!"
- **Anthropic** | prize "Coming soon!" | criteria in §5.
- **Atlassian: Best Agent / Best Security Solution for Agents** | AirPods Max | see §1b.
- **Bright Data: Best Agent/App Using Public Web Data** | $1500 credits + $500 Amazon / $1000 + $350 / $500 + $250 | "Bright Data is essential to the core experience; if live public web data were removed, the product would no longer work." Disqualified if scraping behind login/paywall, non-public personal data, mocked data in demo.
- **Mana.space** | $5000 cash | see §8.
- **Spacetime** | $2048/$1024/$512 (+ Scrabblebot tourney) | Spacetime as core real-time backend; mentions "trading / financial-style apps", "shared ops dashboard".
- **MLH** prizes (page text + https://www.mlh.com/events/prizes): see §6. Also listed: SpaceXSI A-Team (Cursor + Grok Bot), ElevenLabs, Gemini API, Solana, Tiger Data (mentions "financial prediction engines"), Presage, Vultr, DigitalOcean, Snowflake API, Auth0 ("secure your AI applications with Auth0 for AI Agents"), MongoDB Atlas.

### 1b. Atlassian doc — "The Atlassian Agentic Workforce Challenge" (VERIFIED, https://docs.google.com/document/d/12Y2Vamxbm9W_l2Eo4AM530R7HfNAYCXI-UI6F6Xnggw)
- Goal: "Build a **Forge app** for one or more Atlassian products that automates collaborative workflows for a team and/or establishes safety and governance controls for agents." Recommends Jira or Confluence.
- Track 1 "Agents that do the work" (examples: automated issue triage; documentation maintenance routed to page owner for sign-off). Track 2 "Security for agents that act on behalf of the user" (examples: prompt-injection defense on a public Jira project; "Audit and Reversion: ... Record every action with the inputs and reasoning behind it, so an admin can ... roll back only the changes that were wrong").
- Setup: Node 22/24, `npm install -g @forge/cli@latest`, API token with Forge scopes, `forge login`, `forge site provision` (demo site), `forge register`, `forge deploy`, `forge install --demo-site --product jira|confluence`. Starter: https://github.com/atlassian-labs/forge-inspired. Add an AI model via external fetch permission in manifest.yml + encrypted variables, or Forge LLMs.
- Submission: "Include a 3-minute max demo video ... in your Devpost submission! Also ensure to link your code repository." Judged on: Creativity & Quality of Idea; Usefulness & Impact; Technical Implementation ("effective use of Forge/Atlassian APIs"). "The strongest submissions leave the team with less work to do, not more."
- Prize: AirPods Max per winner. Help: @Vanya Rohatgi in #spons-atlassian.
- **Fit note:** requires an actual Forge app deployed to a Jira/Confluence demo site — a significant add-on for a payroll agent. Only pursue if a Jira-side approval/audit surface is cheap.

---

## 2. Factory Droid SDK

**Prize text (VERIFIED, prize page):** "Eligibility: The project must use the Droid SDK (TypeScript or Python) in a meaningful way. Droid should do real work in the running product, not just help you write code. The repo README should explain where and how Droid is used. What scores well — Droid runs on a trigger you designed, like an event, a schedule, a user action, or another agent. — Thoughtful control over what Droid can touch, with safety built in. — Making Droid's work visible: plans, steps, diffs, and results. What scores poorly — A chatbot wrapper with Droid added on. — Demos that only work in slides. — Projects where we can't tell what the agent did." Prize: $2000 cash + Factory credits + swag.

**What it is / how to integrate (VERIFIED, https://docs.factory.com/sdk/typescript.md — docs.factory.ai 308-redirects to docs.factory.com):**
- `npm install @factory/droid-sdk` (Node ≥18; import from `@factory/droid-sdk/node`; Zod 3 for structured output / SDK MCP tools). Python SDK exists at https://docs.factory.com/sdk/python.md (`run`, `Session`, `Session.resume`, `list_sessions`) — UNVERIFIED detail beyond search snippet.
- The SDK **spawns the `droid` CLI binary found on PATH as a subprocess** (or `execPath`), or connects to an existing Droid daemon. So the CLI must be installed where the product runs: `curl -fsSL https://app.factory.ai/cli | sh`, `brew install --cask droid`, or `npm install -g droid` (VERIFIED https://docs.factory.com/droid-cli/quickstart.md).
- API: `run(prompt, opts)` one-shot; `createSession({cwd, modelId, autonomy, permissionHandler, askUserHandler, disabledToolIds, includePartialMessages})` then `for await (const msg of session.stream(prompt))`; `resumeSession(id)`, `listSessions()`, `listTools()`, `listModels()`; `session.interrupt()`, `abortSignal`. Stream message types: `assistant`, `user`, `tool_call`, `tool_result`, `hook`, `error`, terminal `result` (`result.text`, `result.success`, `tokenUsage` incl. `factoryCredits`). Partial events give text deltas, thinking, tool progress.
- Safety controls: `cwd`; autonomy levels `Off` / `Low` (file edits + read-only cmds) / `Medium` (reversible cmds) / `High`; `permissionHandler` returning `ProceedOnce|ProceedAlways|Cancel`; `disabledToolIds` (no allowlist in SDK; `droid exec` CLI has `--only-tools`); hooks via `.factory/hooks.json` (`PreToolUse` etc.) surface as `hook` messages; `modelId` or `"auto"` (Factory Router). These map directly to the prize's "thoughtful control over what Droid can touch" and "making Droid's work visible: plans, steps, diffs, results" (stream `tool_call`/`tool_result` into the UI).
- Headless alternative (VERIFIED https://docs.factory.com/droid-exec/overview.md): `droid exec` with `--auto low|medium|high`, `-o json|stream-json`, `--cwd`, `--only-tools/--add-tools/--remove-tools`; auth via `FACTORY_API_KEY`; "You create keys on the Factory Settings page under API keys".
- Auth: `FACTORY_API_KEY` env var or `apiKey` option (VERIFIED SDK page). Keys page: Factory Settings → API keys (VERIFIED droid-exec page; URL app.factory.ai/settings/api-keys UNVERIFIED).
- **Pricing (VERIFIED https://docs.factory.com/pricing/individuals.md):** Pro $20/mo, Plus $100, Max $200; "Droid SDK" listed under Pro. **No free tier or trial is listed**; "Droid Core" free open-weight pool only kicks in after Standard Usage is exhausted on a paid plan; BYOK free up to an allowance. Rate limits: rolling 5h/7d/30d windows. UNVERIFIED: whether Factory issues hackathon credits — prize mentions "Factory credits" as a prize; ask at the booth whether weekend credits/keys are available.

---

## 3. Convex

- **Prize page (VERIFIED):** "Best use of Convex — $5,000 cash to the winning team. The reactive backend platform that keeps up with you and your agents. Database, functions, workflow, sync, search, file storage, and more. All TypeScript, zero glue." No further criteria, no link.
- No Cal Hacks-specific Convex page found (convex.dev/hackathons/calhacks 404; convex.dev/hackathons 404; web search found nothing). **Criteria beyond the blurb: UNVERIFIED.** Reasonable inference (UNVERIFIED): judged on depth of Convex use (reactive queries, workflows/agents, file storage).

## 4. Microsoft "Built for the Real World"

- **VERIFIED (prize page):** "Grand Prize: Built for the Real World — Track Challenge: Build a production-minded AI agent that solves a meaningful problem in **finance**, productivity, healthcare, or another high-impact domain. Judging Criteria: Customer understanding / Measurable usefulness / Path from prototype to production / responsible design / end to end functionality." Prize: Surface laptop per member; remote tech talk to Microsoft Delta/Frontier Co. FDE team; 1:1 senior FDE mentorship. **Microsoft Customer Impact Award**: "Same as above!" (talk + mentorship, no laptop).
- **Azure/Microsoft tech requirement: none stated on the prize page** (VERIFIED absence). No linked doc. UNVERIFIED whether judges favor Azure/Foundry; the text is domain- and production-readiness-focused, and explicitly names finance. Strong fit for the payroll agent.

## 5. Anthropic

- **VERIFIED: listed on the live prize page**, sponsor "Anthropic", prize "Coming soon!", criteria text: "1. A named community. "Students" is too broad. "Transfer students at Berkeley trying to find housing" is the right register. 2. A real problem. You have lived it, or you talked to someone who has. 3. It works. One thing done well and usable on Monday beats a broad demo. 4. Thoughtful use of Claude. Claude does something that matters to the solution, and you know where it could go wrong for the people using it."
- Fit: name the community precisely (e.g., "office managers at 10–50-person HVAC/plumbing companies who run biweekly payroll from Jobber + QuickBooks into Gusto"), and show where Claude can be wrong (misclassified hours, wrong rate) and how the product guards it.

## 6. MLH prizes (VERIFIED, prize page text; https://www.mlh.com/events/prizes has only short blurbs + links)

- **Best Use of Gen AI** — "Assorted Prizes". "utilize publicly available Generative AI APIs (like those from OpenAI, Anthropic, Hugging Face, Llama, IBM Watson, or Google Gemini) to develop a unique and functional application ... Intelligent assistants and automation: ... a system that automates complex tasks using natural language processing." Link mlh.link/gemini.
- **Best Use of Backboard** — Tile Essentials Pack per member. "a single, unified API ... long-term memory, RAG, embeddings, tool calls, model routing across 17,000+ LLMs, and persistent context". MLH page: "Promo code claim is required", link https://mlh.link/backboard. Backboard docs (VERIFIED https://docs.backboard.io/ and /faq): base URL `https://app.backboard.io/api`, header `X-API-Key`, `POST /threads/messages` (auto-creates thread + assistant; `assistant_id` shares memory across threads; `memory="Auto"`), SDKs `npm install backboard-sdk` / `pip install backboard-sdk`, "New accounts start with $5 in free credits (valid for 30 days)", keys at app.backboard.io Settings → API Keys. Fit: store learned payroll rules/preferences as assistant memory — cheap add-on.
- **Best .Tech Domain Name** — desktop mic + free .Tech domain up to 10 years; "Promo code claim is required"; get.tech/mlh. Just register a .tech domain for the project.
- **Best Domain Name from GoDaddy Registry** — digital gift card; register a domain with GoDaddy Registry; "Promo code claim is required"; mlh.link/GoDaddyRegistry.
- **Commit Fellowship Prize Category** — interview for 3-week zero-to-founder sprint + The Lean Startup. "Qualify by building a working prototype with a team, demonstrate a real problem worth solving, opt into the Commit Fellowship Prize Category when you submit your project, and complete our supplemental form" (mlh.link/commit-fellowship-form). Winner selected post-event.
- General MLH mechanics (opt-in on Devpost, judged by MLH) — UNVERIFIED; not on the pages fetched.

## 7. Apify

- **Prize (VERIFIED, prize page):** "Best use of Apify — $5,000 total: 1st $2,000; 2nd $1,000; 3rd $800; 4th $400; 5th $400. Top 5 projects using Apify, we also have a best actor award for building an actor for this event. Project must be using Apify in a meaningful way. We will judge the quality of the project as well as other criteria." **Best Actor sponsored by Apify — $400, "Same as above".**
- **What an Actor is (VERIFIED https://docs.apify.com/platform/actors):** "a serverless cloud program that takes structured JSON input, performs a task such as web scraping or browser automation, and can optionally return structured output." Components: Dockerfile, README, input/output schemas, built-in storage (datasets/KV), metadata; runnable via Console/API/CLI/schedule; can call other Actors; private or public in Apify Store.
- **Free tier (VERIFIED https://apify.com/pricing):** Free plan $0/mo includes **$5 of platform usage per month**; compute $0.2/CU (1 GB-RAM-hour); max 16 GB RAM, 5 concurrent runs; 5 datacenter proxy IPs; blocked until next cycle when exceeded. Starter $19/mo.
- **Playwright Actor in minutes (VERIFIED):** CLI flow (https://docs.apify.com/cli/docs/quick-start, /cli/docs/reference): `apify create my-actor -t <template>` (or interactive; `-l ts -u browser-automation`), `cd`, `apify run`, `apify login`, `apify push` (builds in cloud, prints Console link); `apify call` runs remotely. Template IDs (VERIFIED, https://raw.githubusercontent.com/apify/actor-templates/master/templates/manifest.json): **`ts-crawlee-playwright-chrome`** (Crawlee + Playwright + Chrome, TypeScript), `ts-crawlee-playwright-camoufox`, **`ts-playwright-test-runner`** ("Automated browser test runner using Playwright"), `ts-empty`, `ts-standby` (always-on HTTP Actor), `python-playwright`, `js-crawlee-playwright-chrome`. A plain Playwright script can be dropped into `ts-crawlee-playwright-chrome` or `ts-empty` (add `playwright` dep; the Playwright templates' Docker image ships Chrome). Call it from the app via `apify-client` (`npm i apify-client`; `client.actor('user/name').call(input)`) — client usage UNVERIFIED here but standard.
- Fit idea: an Actor that logs into/scrapes a Jobber or Gusto UI the way a human would (if no API), or pulls public data (e.g., state minimum-wage/overtime tables, holiday calendars) used by the rules engine — note Bright Data forbids login scraping but Apify's prize text has no such clause (VERIFIED absence).

## 8. Mana

- **What it is (VERIFIED, https://mana.space/a/calhacks → www.mana.space/home/.../calhacks, "Cal Hacks Starter Pack", read via browser):** "Mana is a computer you talk to. Describe an app and it builds it, runs it and remembers it." Features: builds interface + data + AI wiring and runs it; persistent apps/files/data; drives a real browser ("searches, compares, clicks and fills forms"); scheduled jobs ("every minute or every morning"); one-link sharing, live multiplayer editing; built-in "AI, no API keys" (top models, image gen, speech, search), voice. "TWO WAYS IN": build inside Mana, or "Bring your own stack — Join, then open Profile → Integrations. Connect GitHub and pick your repo. Ask Mana to read it and take on a task. Review its pull request." **Invite code `CALHACKS`: "Skip the waitlist. Free credits for the weekend."** Support on Slack.
- **Criteria (VERIFIED, prize page):** $5000 cash. "Use Mana meaningfully while building your project. In your submission, say where Mana helped and link one or two Mana pages or chats you used ... Make each link public ... In your demo, show one moment where Mana changed what you built or how fast you built it. Meaningful use of Mana (30%) / Usefulness (25%) / Originality (25%) / Execution (20%) / Bonus (up to +10): Your project lives inside Mana as an app or agent a judge can open and use." Note the Mana page itself weights Usefulness 30 / Originality 25 / Execution 25 / Mana use 20, +10 bonus (discrepancy; both VERIFIED as published).
- Cheapest path: connect the GitHub repo via Integrations, have Mana do one real task (e.g., write tests or a module) and link that chat publicly; or build a small companion (approver inbox) inside Mana for the +10.

## 9. Hyphenate track (VERIFIED — "CalHacks_Hyphenate_Track" Google Doc, https://docs.google.com/document/d/1u4iN8R97ILY3kfHTPKC82zdutHrGx4ze5eCAP-J92w4/edit; the prize page names it but has no link)

- "$8,000 · $5,000 · $3,000 FOR 1ST, 2ND AND 3RD". "Build the system a finance team would bring on board. No finance background needed." "Pick a company and one corner of its finance team: a few seats that work closely together ... Then build the autonomous system you'd hire to fill them, and the company it works in: the software it uses, the people it answers to, and the mistakes hiding in its data."
- "What makes it hard": Sources that disagree ("The bank, the ledger and the contract each tell a slightly different story. Acting well means knowing which one to trust, and saying why."); Time ("What happened in March should change what the system does in June."); Working with others ("The system has to ask at the right moment and handle the answer."); Limits ("Whoever requests a payment can't be the one who approves it."); Explainable and accountable ("every call should trace back to the data, rule or person behind it").
- Sample workflows include **"Payroll. Payroll runs and stock grants turned into the right entries every period, by department and entity."** (also AR, AP, Cash, Accruals, Close, FP&A, Reporting).
- Judging (same as prize page): "Is it real enough? Realistic data, a messy problem, and proof that it works." / "Would you hire it? For which seats, and would it earn them: limited access, a clean record of its work, and knowing when to ask?" / "Did we see something new?" / "The moment. When it catches what others missed, recovers from something going wrong, or defends a decision when questioned."
- Submit: "A demo video that opens with your moment", "A live demo at judging, running for real. We may ask you to try a scenario of our own.", "One line on the seats your system would fill", "Proof it works: what's real, what's simulated, and how you know, whether that's a test set, planted errors with an answer key, or a benchmark score."
- Workshop: "Beyond Agentic Harnesses: Engineering the Autonomous Enterprise" in person Oct 23 7 pm. Resources: sandboxes (Stripe, Increase, Lago, Odoo, ERPNext), ledgers (Formance, Blnk, TigerBeetle, Beancount/Fava), mocks (Mockoon, Prism, stripe-mock), benchmarks (AccountingBench, APEX-Accounting, Finance Agent Benchmark, DABstep, BenchRec, Invoice Sandbox Benchmark). "People. A model can play the approver, the colleague or the auditor." "Models and frameworks. Use whatever you like." Key concepts list includes segregation of duties, audit trail, materiality, controller.

## 10. Other prizes that fit a finance/payroll agent (beyond the list asked)

- **CRS Credit API — Best Financial AI Agent ($500)** and Best Overall ($1,000): finance-adjacent but requires CRS credit/identity data at the core; a payroll agent could use IDV for new-hire identity verification, but it would be a bolt-on — judges explicitly penalize bolt-ons. Marginal.
- **Coinbase x402 — Payment Agents ($500 USDC per member)**: example explicitly includes an agent that "manages the budget for a small business"; simulated transactions allowed. Could pay contractors via x402 — but requires verified Coinbase account per member and is crypto-rail; marginal unless a contractor-payout step is natural.
- **Microsoft Built for the Real World** names finance explicitly — strongest secondary fit (see §4).
- **Spacetime** mentions "trading / financial-style apps", "shared ops dashboard" — requires Spacetime as core backend; conflicts with Convex. Pick one backend sponsor.
- **Tiger Data (MLH)** mentions "financial prediction engines" — Postgres-based; conflicts with Convex.
- **Auth0 (MLH)** — "secure your AI applications with Auth0 for AI Agents"; cheap add-on for approver login.
- **Atlassian Track 2** (audit/reversion of agent actions) matches the audit-trail theme but needs a Forge app on Jira/Confluence.
- **Best People-First Hack / Most Technically Complex / Hacker's Choice** (organizer awards) — no criteria text.
- **Meta "Bringing People Closer Together"** — poor fit.

## Quick fit ranking for the payroll agent (my judgment, not official)
1. Hyphenate ($8k/$5k/$3k) — payroll is a named workflow; criteria map 1:1 to the product (planted errors + answer key, approvals, audit trail, "the moment").
2. Microsoft Built for the Real World — finance named; production-mindedness.
3. Anthropic — name the community; show Claude failure modes.
4. Factory Droid SDK ($2k) — trigger-driven Droid doing real work (e.g., Droid writes/updates the learned rule as code + test and shows the diff) — but **paid plan likely needed (no free tier found)**; confirm credits at booth.
5. Convex ($5k) — if chosen as backend; criteria thin.
6. Apify ($5k pool + $400 Best Actor) — a Playwright Actor for a login-less data pull; free $5/mo credit suffices.
7. Mana ($5k) — invite code CALHACKS, free weekend credits; cheap to satisfy via GitHub integration + public chat link.
8. MLH: Gen AI, Backboard ($5 free credits; memory for learned rules), .Tech, GoDaddy, Commit Fellowship (form) — all cheap opt-ins.
