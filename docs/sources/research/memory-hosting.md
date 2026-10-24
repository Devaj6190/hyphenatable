# Research: Memory systems + hosting/backend for the payroll-checking agent

Researched 2026-10-24 from official docs/registries only. Each finding is tagged
**VERIFIED** (read in an official doc; URL given) or **UNVERIFIED** (inference, or not found in official docs).
Context: agent must store "lessons" from human answers, compare new info with known info, detect
contradictions, recall by similarity; confirmed pay rules must ALSO live in our own relational DB.
Team of 3, 33 hours, TS or Python.

---

## PART A — Memory systems

### Headline comparison (for the plan)

| | Backboard | Mem0 Platform | Mem0 OSS | Letta | Zep | Cognee |
|---|---|---|---|---|---|---|
| Form | Hosted API | Hosted API | Self-hosted lib (needs OpenAI key + vector store) | Hosted (Letta Cloud) or self-host; agent runtime, not just memory | Hosted API (graph) | Self-hosted Python lib; Cognee Cloud |
| Py / JS pkg | `backboard-sdk` 1.5.19 (both PyPI & npm) | `mem0ai` (PyPI 2.2.1 / npm 3.3.1) | same pkg, `mem0ai/oss` entry | `letta-client` 1.12.1 / `@letta-ai/letta-client` 1.12.1 | `zep-cloud` 4.0.1 / `@getzep/zep-cloud` 4.0.1 | `cognee` 1.6.5 / `@cognee/cognee-ts` 0.2.0 |
| Per-company namespace | per `assistant_id` | `user_id`/`agent_id`/`app_id`/`run_id` + metadata filters | same | per agent / shared blocks; archival tags | per user graph or per standalone graph (`graph.create`) | datasets / workspaces |
| Auto contradiction handling | NOT documented (manual PUT/DELETE only) | **NO — docs now say add() is "ADD-only; memories accumulate"** | same | No (agent edits blocks itself; archival is append) | **YES — temporal facts; new data "attempts to invalidate" old facts (valid_at/invalid_at/expired_at)** | Not documented (`improve` re-weights) |
| Free tier | $5 credits, 30 days, no card | Hobby: 10k add req/mo, 1k retrieval req/mo, 1 project | free (your own OpenAI spend) | Free plan: 3 agents; API Plan $20/mo | 10,000 credits/mo, 2 projects | Cloud free: 1 workspace, 1M tokens; OSS free |
| Hello-world time | ~5 min (docs claim "under 5 minutes") | ~5 min (docs claim) | ~10 min (pip + OPENAI key) | 15–30 min (agents+blocks model to learn) | ~15 min (user→thread→episode; async processing) | 20–40 min (async pipeline, LLM key, graph build) |

**Bottom-line for our use case (contradiction detection + per-company rules):** none of the hosted
"auto" memory layers will reliably do our domain-specific contradiction logic ("Venmo rate $22 vs $25")
for us; Zep is the only one that documents automatic fact invalidation. For money-driving rules we must own
the canonical store anyway (A2). Recommended shape: our Postgres (or Convex) table of `lessons` with an
embedding column; on each new lesson, kNN-search the top ~5 similar lessons scoped to the company, then one
Claude call decides ADD / UPDATE(supersede) / CONTRADICT (ask human). Optional: mirror lessons into Backboard
via `add_memory` for the MLH prize, using `memory="Readonly"` or the manual CRUD so our DB stays canonical.

---

### 1. Backboard (backboard.io)

- **What it is** — VERIFIED: hosted REST API; base URL `https://app.backboard.io/api`, auth header `X-API-Key`.
  "Send a message with `POST /threads/messages` — no setup needed. Thread and assistant are auto-created";
  "Pass `thread_id` to continue, `assistant_id` to share memory and documents across threads".
  https://docs.backboard.io (Introduction). Marketing home page now describes Backboard as an "AI compute
  efficiency lab" with an inference engine; the memory product is the "Stateful API". https://backboard.io
- **SDKs** — VERIFIED: `pip install backboard-sdk` (PyPI 1.5.19, Python >=3.8); `npm install backboard-sdk`
  (npm 1.5.19, "JavaScript SDK for the Backboard API"). Python client is async (`BackboardClient`).
  https://docs.backboard.io/quickstart , https://docs.backboard.io/faq , https://pypi.org/pypi/backboard-sdk/json ,
  https://registry.npmjs.org/backboard-sdk/latest . A Jan-2026 changelog mentions `@backboard/sdk` but that
  npm name returns 404 today — UNVERIFIED/stale; use `backboard-sdk`.
- **Memory API shape** — VERIFIED (https://docs.backboard.io/sdk/memory , https://docs.backboard.io/concepts/memory):
  - Per-turn parameter on send_message: `memory="Auto"` (save+retrieve, "Memory Lite — recommended default"),
    `"Readonly"` (retrieve only), `"off"` (default). `memory_pro="Auto"|"Readonly"` = higher accuracy, higher cost;
    "`memory` and `memory_pro` cannot be used together in the same message."
  - Manual CRUD: `add_memory(assistant_id, content=..., metadata={...})`, `search_memories(assistant_id, query=, limit=)`
    (semantic, ranked), `get_memories` (paginated, page_size 1–100), `get_memory`, `update_memory`, `delete_memory`,
    `reset_memories` (irreversible). Memory ops "can be asynchronous": response has `memory_operation_id`;
    `get_memory_operation_status` → COMPLETED / IN_PROGRESS / ERROR.
  - Python: `await client.send_message("My name is Sarah...", assistant_id=assistant_id, memory="Auto")`;
    TS: `await client.sendMessage({ content, assistantId, memory: 'Auto' })`; `client.addMemory(assistantId, { content, metadata })`;
    `client.searchMemories(assistantId, 'UI preferences', 5)`.
- **Namespacing** — VERIFIED: "Memories are stored at the assistant level, not the thread level"; "Stored per assistant,
  recalled across threads". "If you omit `assistant_id`, each call creates a new assistant with its own empty memory."
  → one assistant per company = our namespace. Metadata dict accepted on `add_memory` (e.g. `{"source":"manual","confidence":"high"}`);
  no documented metadata *filtering* in search. https://docs.backboard.io/concepts/architecture
- **Contradiction detection** — UNVERIFIED/NOT DOCUMENTED: docs say Auto "automatically extracts relevant facts and
  preferences" and "Updates memory in real-time with new information", but no page describes how a new fact that
  contradicts an old one is resolved; the memory concepts page says changes are manual (PUT/DELETE). Treat as: no
  guaranteed contradiction handling.
- **Pricing** — VERIFIED: Free = "$5 in credits, no credit card required" (FAQ: "valid for 30 days"); Pro = $9/month;
  Enterprise custom. Memory/RAG/state "included with plans"; LLM routing billed at provider rates; web search $0.005/query.
  https://backboard.io/pricing , https://docs.backboard.io/faq
- **API key** — VERIFIED: "Navigate to Settings → API Keys to create your API key"; "You can start building immediately
  without entering payment information" → instant. Default LLM if unspecified: `openai` / `gpt-4o`; example uses
  `llm_provider="openrouter"`, `model_name="moonshotai/kimi-k2.6"` (so Claude via OpenRouter is possible — UNVERIFIED for Anthropic-direct).
- **Hello-world speed** — VERIFIED claim: quickstart titled "Get started with Backboard API in under 5 minutes".
- **MLH / Cal Hacks** — VERIFIED: MLH partner page "The Memory Layer for your AI Hacks!" — sign up via
  https://mlh.link/backboard-signup ("Hackathon Access Registration" unlocks free resources), docs https://mlh.link/backboard-docs ,
  quickstart video https://mlh.link/backboard-quickstart , Discord #support https://mlh.link/backboard-discord .
  https://www.mlh.com/partners/backboard . MLH announcement (2026-04-09): category "Best Use of Backboard.io" across
  50 hackathons; it "challenges participants to move beyond 'stateless' prototypes" and asks them to "build
  production-ready applications that remember user context and maintain state across the entire development lifecycle";
  hackers get "free credits to access Backboard.io's premium AI memory features" and are "eligible for specialized swag
  and high-value prizes". https://blog.mlh.com/major-league-hacking-mlh-partners-with-backboard-io-to-bring-ai-memory-and-persistent-state-to-global-student-developers-04-09-2026
  **Formal judging rubric: NOT PUBLISHED** anywhere I could read (UNVERIFIED). Cal Hacks 13.0 Devpost
  (https://cal-hacks-13-0.devpost.com/) returned HTTP 403 to fetch; search snippets show a "Best use of Convex" prize
  listed there but no Backboard prize surfaced in snippets — check the Devpost prizes tab and the MLH table at the venue.
  Practical reading of the MLH blurb: demo persistent state across sessions/threads (same assistant_id), show recall in a
  later run, and show memory surviving a redeploy.

### 2. Cognee (cognee.ai)

- **What it is** — VERIFIED: open-source Python library building "AI memory as a knowledge graph"; `remember`/`recall`
  (legacy `add`/`cognify`/`search`, plus `improve`, `forget`). Runs "on your own machine with embedded databases".
  Cognee Cloud = "The same engine, managed: a web UI, preconfigured storage, pipeline execution, and dataset-level
  permissions"; sign up at platform.cognee.ai. https://docs.cognee.ai , https://docs.cognee.ai/cognee-cloud/overview.md
- **SDKs** — VERIFIED: PyPI `cognee` 1.6.5 (Python >=3.10,<3.15); npm `@cognee/cognee-ts` 0.2.0 ("Node.js bindings for the
  cognee AI-memory SDK", native bindings over `cognee-rs`, "built with Neon"). TS example:
  `const memory = new Cognee({ llmModel: "gpt-5-mini", llmApiKey: ... }); await memory.warm(); await memory.remember({type:"text", text}, "science-notes"); const answer = await memory.recall("...")`.
  https://docs.cognee.ai/typescript/getting-started.md , https://pypi.org/pypi/cognee/json , https://registry.npmjs.org/@cognee/cognee-ts/latest
- **API shape** — VERIFIED: Python `await cognee.remember(text)` ("runs ingestion, chunking, entity extraction, graph
  building, and a follow-up improve() run"), `await cognee.recall(query_text=...)` ("auto-routes the query to the best
  retrieval strategy"); requires `LLM_API_KEY`; everything async. `cognee-cli demo` runs with no LLM key.
  https://docs.cognee.ai/getting-started/quickstart.md
- **Namespaces** — VERIFIED (partial): datasets (second arg of remember; `forget --dataset`), "dataset-level permissions
  for a team", "everything owned by the current user". Metadata filtering in recall: UNVERIFIED.
- **Contradictions** — UNVERIFIED/NOT DOCUMENTED: `.improve` "enriches an existing graph" with "feedback-based weighting";
  "bi-temporal memory" is an Enterprise feature on the pricing page. No documented invalidation.
- **Pricing** — VERIFIED: Free $0: 1 workspace, 1M tokens, no card; Standard $1.00 per 1M tokens processed + $5/mo per extra
  workspace; Enterprise BYOC custom (bi-temporal memory, per-user/agent personalization). https://www.cognee.ai/pricing
- **API key** — UNVERIFIED whether instant (docs say sign up at platform.cognee.ai; no waitlist language seen).
- **Hello-world** — estimate 20–40 min (async pipeline + LLM key + graph build latency). Heaviest to learn of the five;
  graph model is overkill for flat "lessons".

### 3. Mem0 (mem0.ai) — Platform and OSS

- **What it is** — VERIFIED: Platform = hosted API `https://api.mem0.ai/v3/memories/add/` and `/search/`; OSS = library
  (`from mem0 import Memory` / `import { Memory } from "mem0ai/oss"`). https://docs.mem0.ai/platform/quickstart ,
  https://docs.mem0.ai/open-source/quickstart , https://docs.mem0.ai/open-source/node-quickstart
- **SDKs** — VERIFIED: `pip install mem0ai` (PyPI 2.2.1, Python >=3.10,<4.0); `npm install mem0ai` (npm 3.3.1).
  Prereqs: "Python 3.10+, Node.js 18+". https://pypi.org/pypi/mem0ai/json , https://registry.npmjs.org/mem0ai/latest
- **API shape** — VERIFIED: Python `client.add(messages, user_id="user123")`; JS `await client.add(messages, { userId: "user123" })`;
  `client.search("What are my dietary restrictions?", filters={"user_id": "user123"})`. Response `results[]` with `id`,
  `memory`, `event` (example `"ADD"`), `score`, `categories`, `metadata`, `created_at`, `expiration_date`.
  OSS Node: `await memory.add(messages, { userId: "alice", metadata: { category: "movie_recommendations" } })`;
  `memory.search("...", { filters: { user_id: "alice" } })`.
- **Scoping/filters** — VERIFIED: `user_id`, `agent_id`, `app_id`, `run_id` ("At least one is required"); `metadata` key/values;
  search `filters` = "JSON logic (AND/OR, comparison operators)", e.g. `{"OR":[{"user_id":"alice"},{"agent_id":{"in":[...]}}]}`,
  `{"created_at":{"gte":"2024-07-01"}}`; Platform metadata filters support bare value / `eq` / `contains` / `ne` on top-level
  keys only (`in`/`gt`/`lt` on metadata raise FilterValidationError); `keywords` filter inside search() returns 500 (MEM-5746).
  `top_k`, `threshold`, `rerank=True` (+150–200 ms). → use `app_id`/`agent_id` = company id for per-company namespace.
  https://docs.mem0.ai/core-concepts/memory-operations/search , https://docs.mem0.ai/platform/features/platform-overview (filters page)
- **Contradiction / UPDATE-DELETE inference** — VERIFIED, and IMPORTANT: current docs state add() is additive only.
  Memory-operations page: "New memories are added without overwriting or deleting existing memories"; comparison table
  "Add behavior — Platform: ADD-only; memories accumulate — OSS: ADD-only; you control storage". Add-memories API reference:
  "the endpoint is ADD-only with no UPDATE or DELETE" and `event` documents only `ADD`. `infer=True` (default) extracts
  structured memories; `infer=False` stores raw text ("Raw inserts skip inference, so a later infer=True call with the same
  content can create a second memory"). `immutable=true` "Excludes stored memories from future update or consolidation"
  (hints at a separate consolidation feature — "Dream (memory consolidation)" is Pro-plan only on the pricing page).
  Explicit `update(memory_id, text)` and delete exist. Platform add returns `status: "PENDING"` + `event_id` to poll.
  https://docs.mem0.ai/core-concepts/memory-operations , https://docs.mem0.ai/core-concepts/memory-operations/add ,
  https://docs.mem0.ai/api-reference/memory/add-memories , https://docs.mem0.ai/core-concepts/memory-operations/update
  → The historical ADD/UPDATE/DELETE/NOOP inference the task mentioned is NOT what the 2026 docs describe. Don't plan on it.
- **OSS defaults** — VERIFIED: LLM OpenAI `gpt-5-mini` (needs `OPENAI_API_KEY`), embeddings `text-embedding-3-small`,
  vector store local Qdrant at `/tmp/qdrant` (Python) / in-memory (Node), history SQLite `~/.mem0/history.db`; self-hosted
  server uses Postgres+pgvector. Configure via `Memory.from_config` / `new Memory(config)`. https://docs.mem0.ai/open-source/quickstart
- **Pricing** — VERIFIED: Hobby Free: 10,000 add requests/mo, 1,000 retrieval requests/mo, 1 project, community support;
  Starter $19/mo: 50k adds / 5k retrievals; Pro $249/mo: 500k / 50k, graph memory, Dream consolidation; Enterprise custom.
  https://mem0.ai/pricing  (NB: 1,000 retrievals/month on free is tight for a demo-heavy weekend if every check searches.)
- **API key** — VERIFIED (quickstart): "In about five minutes you will get an API key, store your first memory, and search it back."
- **Hello-world** — Platform ~5 min; OSS ~10 min.

### 4. Letta (letta.com)

- **What it is** — VERIFIED: agent runtime ("stateful agents") with memory, not a bare memory store. Letta Cloud REST API at
  `https://api.letta.com`; API keys at platform.letta.com/api-keys; Bearer auth. Self-host: Docker image `letta/letta:latest`
  is "no longer actively maintained or supported" — recommended path is the Letta App Server. Docker run needs `OPENAI_API_KEY`
  etc., port 8283, bundled Postgres (own PG needs pgvector). https://docs.letta.com/api-reference/overview ,
  https://docs.letta.com/guides/selfhosting
- **SDKs** — VERIFIED: `letta-client` PyPI 1.12.1 (Python >=3.9); `@letta-ai/letta-client` npm 1.12.1.
- **Memory model** — VERIFIED: memory blocks (`label`, `description`, `value`, `limit` chars) pinned to the system prompt;
  agents edit them via memory tools; developers can `client.blocks.create(label=, description=, value=, limit=4000)` and
  `client.agents.blocks.attach(agent_id, block_id)`; "If multiple agents are attached to a block, they will all have the block
  data in their context windows" (shared blocks); "Setting value completely replaces the entire block content"; last write wins;
  blocks can be read-only. Archival memory = "a general-purpose vector DB in the Letta API": agent tools
  `archival_memory_insert` / `archival_memory_search`; developer API `client.agents.passages.*` insert/search with optional
  tags + paging. https://docs.letta.com/guides/agents/memory-blocks , https://docs.letta.com/guides/agents/archival-memory ,
  https://docs.letta.com/guides/agents/memory
- **Namespacing** — VERIFIED: per agent + shared blocks; archival tags. Per-company = one agent (or one shared block) per company.
- **Contradictions** — UNVERIFIED/NOT DOCUMENTED: no automatic invalidation; the agent itself rewrites blocks.
- **Pricing** — VERIFIED: Free $0 ("limited to 3 stateful agents", 5 MiB storage per memory repository, BYO API keys);
  Pro $20/mo (20 agents, 50 MiB); Teams Pro $20/seat; Developer "API Plan: $20/month" unlimited agents, $0.10 per active agent/mo,
  $0.00015 per second of tool execution, pay-as-you-go LLM tokens. https://docs.letta.com/letta-code/pricing
- **API key** — VERIFIED location (platform.letta.com/api-keys); instant: UNVERIFIED (no approval language seen).
- **Hello-world** — estimate 15–30 min; you must learn agent/blocks model. Poor fit: we want a memory store under *our*
  agent loop, not a second agent runtime.

### 5. Zep (getzep.com)

- **What it is** — VERIFIED: hosted "context layer"; temporal knowledge graph per user or per standalone graph.
  SDKs: `pip install zep-cloud` (PyPI 4.0.1, Python >=3.10) ; `npm install @getzep/zep-cloud` (npm 4.0.1); Go v4.
  https://help.getzep.com/quickstart
- **API shape** — VERIFIED:
  - Users/threads: `client.user.create(email=, first_name=, last_name=)` → uuid; `client.thread.create(user_uuid=)`;
    `client.thread.add_messages(thread_uuid, messages=[...])`; `client.thread.get_context(thread_uuid)` returns a Context Block.
  - Business data: `client.graph.episode.add(graph_uuid_or_user_uuid, type="text"|"json"|"message", data=..., metadata={...}, reference_time=RFC3339)`;
    each episode ≤ 10,000 chars; up to 10 metadata keys/episode; returns a task to poll (async).
  - Standalone shared graphs ("Enterprise context graphs"): `graph.create(name, description)` → `graph_uuid`; "combines related
    data into shared context that authorized agents and applications can retrieve"; use cases "One graph per project or customer
    account". → one graph per company = our namespace, independent of users/threads.
  - Search: `client.graph.search_edges(graph_uuid, query=, reranker="rrf"|"mmr"|"cross_encoder"|"node_distance"|"episode_mentions", page_size≤50, filters={edge_types, node_labels, property_filters, date_filters, metadata_filters})`;
    also `search_nodes`, `search_episodes`, `search_observations`, `search_thread_summaries`, `graph.get_context` (max_characters default 2500, max 50000).
    TS: `client.graph.searchEdges(graphUuid, { query, reranker: "mmr", mmrLambda: 0.5, pageSize: 10 })`.
  https://help.getzep.com/adding-data-to-the-graph , https://help.getzep.com/searching-the-graph , https://help.getzep.com/enterprise-context-graphs , https://help.getzep.com/users
- **Contradiction detection** — VERIFIED (the only one): facts live on edges with `created_at`, `valid_at`, `invalid_at`,
  `expired_at`; "When new data arrives, Zep checks for existing nodes and edges and either adds new ones or updates existing
  ones"; example: Zep "attempts to invalidate the fact that Kendra loves Adidas shoes" when she switches to Puma.
  Caveat (quoted): `valid_at`/`invalid_at` "don't establish that the source content or the fact is true". https://help.getzep.com/facts
  → Contradictions are resolved silently (old fact invalidated), not surfaced as a "conflict" event we can route to a human;
  we'd have to search edges before ingesting and compare ourselves.
- **Shared across threads** — VERIFIED: "The knowledge graph does not separate the data from different threads."
- **Pricing** — VERIFIED: Free: 10,000 credits/mo (no rollover), 2 projects, 1 Context MCP seat, 5 custom entity/edge types,
  variable rate limits, lower-priority processing. Flex $125/mo (50k credits, 600 rpm); Flex Plus $375/mo. Credits: 1 credit
  per episode up to 350 bytes (+1 per extra 350 bytes); retrieval, storage, users, threads = 0 credits. https://www.getzep.com/pricing
- **API key** — UNVERIFIED whether instant (quickstart assumes "a Zep account and API key").
- **Hello-world** — ~15 min; ingestion is async graph processing (seconds+), so demo must tolerate eventual consistency.
  Security note in docs: pass Context Blocks as untrusted data, not in system messages.

### A2. Own database + embeddings

**Effort estimate (honest): 2–4 hours for one engineer** for table + embedding call + kNN query + one LLM "ADD/UPDATE/CONTRADICT"
classifier; vs 1–2 h to wire a hosted memory API that *still* won't do domain contradiction logic for us. Owning it also means
the canonical pay-rule table and the lesson table are the same database (no sync problem).

- **Anthropic embeddings** — VERIFIED: "Anthropic does not offer its own embedding model. One embeddings provider with a wide
  variety of models and capabilities is Voyage AI by MongoDB." Recommended: `voyage-4-large` (best), `voyage-4` (balanced),
  `voyage-4-lite` (cheapest); `voyage-finance-2` exists for finance text. Keys are now created in MongoDB Atlas ("AI Model APIs →
  Create model API key"); endpoint `https://ai.mongodb.com/v1/embeddings`; `pip install -U voyageai` (>=0.3.7 for Atlas keys);
  TS client exists (set `environment` to `https://ai.mongodb.com/v1`). Use `input_type="document"` vs `"query"`. Embeddings are
  unit-normalized → dot product == cosine. https://platform.claude.com/docs/en/build-with-claude/embeddings
- **Voyage pricing** — VERIFIED: `voyage-4-large` $0.12/M, `voyage-4` $0.06/M, `voyage-4-lite` $0.02/M tokens; "first 200M tokens
  are free" for voyage-4 family (voyage-3.x older models: no free tokens). Rate limits Tier 1: 2000 RPM, 8M–16M TPM, but "Tier 1
  requires you add a payment method". https://docs.voyageai.com/docs/pricing , https://docs.voyageai.com/docs/rate-limits
  UNVERIFIED: whether the Atlas key path requires a card before the free 200M tokens apply (docs imply yes for Tier-1 limits).
- **OpenAI embeddings** — VERIFIED: `text-embedding-3-small` $0.02/M, `text-embedding-3-large` $0.13/M, `ada-002` $0.10/M.
  https://developers.openai.com/api/docs/pricing  (Simplest if the team already has an OpenAI key; 1536 dims for -small.)
- **pgvector on Neon** — VERIFIED: `CREATE EXTENSION IF NOT EXISTS vector;` per database; `embedding VECTOR(1024)`; operators
  `<->` L2, `<#>` neg. inner product, `<=>` cosine, `<+>` L1; `CREATE INDEX ON items USING hnsw (embedding vector_l2_ops);`
  (use `vector_cosine_ops` for cosine). https://neon.com/docs/extensions/pgvector
  Neon Free: 1 GB storage/project (20 GB total), 100 CU-hours/project, 100 projects, 10 branches/project, 5 GB egress,
  autosuspend after 5 min (always on; cold start on first query — matters for demo). Launch plan pay-as-you-go
  $0.106/CU-hr, $0.35/GB-mo. https://neon.com/pricing
- **pgvector on Supabase** — VERIFIED: enable `vector` extension from dashboard or SQL; `match_documents` RPC pattern
  (PostgREST can't express `<=>`, so wrap in a SQL function and call `rpc()`); order by the distance expression so indexes are used.
  https://supabase.com/docs/guides/ai/vector-columns . Free: 500 MB DB, 2 active projects, pause after 1 week inactivity,
  50k MAU, 1 GB file storage, 5 GB egress, 500k edge-function invocations; Pro from $25/mo. https://supabase.com/pricing
- **sqlite-vec** — VERIFIED: `pip install sqlite-vec` (PyPI 0.1.9) / `npm install sqlite-vec`; `CREATE VIRTUAL TABLE v USING vec0(embedding float[1024])`;
  KNN: `WHERE embedding MATCH ? ORDER BY distance LIMIT k`; metadata/auxiliary/partition-key columns supported; "pre-v1 …
  expect breaking changes!". https://github.com/asg017/sqlite-vec . Good for a laptop-hosted worker; not for Vercel/Convex.
- **Convex built-in vector search** (if we pick Convex) — VERIFIED: `.vectorIndex("by_embedding", { vectorField, dimensions, filterFields })`
  in schema; `ctx.vectorSearch(table, index, { vector, limit, filter })` **only inside actions**; returns `_id` + `_score` (-1..1),
  then load docs via a query. Limits: dims 2–4096, ≤16 filterFields/index, ≤64 filter expressions/query, ≤256 results (default 10),
  4 vector indexes/table. https://docs.convex.dev/search/vector-search  → `filterFields: ["companyId"]` gives per-company scoping for free.

---

## PART B — Hosting and backend

### B1. Vercel

- **Function duration** — VERIFIED (Fluid compute, Node/Bun/Python): Hobby 300 s default and maximum; Pro/Enterprise 300 s default,
  800 s maximum (GA), 1800 s "extended maximum Beta" (function-level config, specific runtimes). Timeout → 504 `FUNCTION_INVOCATION_TIMEOUT`.
  Memory: Hobby 2 GB/1 vCPU max; Pro 4 GB/2 vCPU. Payload 4.5 MB. "For workloads that require unlimited execution time, use Vercel
  Workflows, which allow your code to pause, resume, and maintain state for minutes to months without duration limits."
  https://vercel.com/docs/functions/limitations
- **Cron** — VERIFIED: 100 cron jobs/project on every plan; Hobby minimum interval "Once per day", precision "Per-hour (±59 min)"
  ("Hobby accounts are limited to daily cron jobs. This cron expression would run more than once per day." fails deploy);
  Pro once per minute, per-minute precision. https://vercel.com/docs/cron-jobs/usage-and-pricing
- **Background work** — VERIFIED: Next.js ≥15.1 → `import { after } from 'next/server'`; "after() does not block the response. The
  callback runs once rendering or the response is finished"; extend with `maxDuration`. Otherwise `waitUntil()` from `@vercel/functions`;
  "Promises passed to waitUntil() will have the same timeout as the function itself. If the function times out, the promises will be
  cancelled." `getDeadline()` returns the invocation deadline so a loop can stop early and return `resumePage`.
  https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package
- **Pricing** — VERIFIED: Pro "$20 / month" per developer seat with "$20 included credit"; Hobby: "for personal, non-commercial use",
  4 hours Fluid Active CPU/month, cannot purchase extra usage; Active CPU on Pro from $0.128/hr. https://vercel.com/pricing
- **Fit for long-running agent loops** — assessment (VERIFIED facts above): a 5-minute hard cap on Hobby, once-a-day cron with ±59 min
  jitter, and no process persistence make Vercel a poor home for the *agent worker*. Fine for the Next.js UI + webhooks (<300 s). Run
  the loop elsewhere (Convex actions, a Railway/Fly container, or a laptop + tunnel).

### B2. Convex (convex.dev)

- **Free tier** — VERIFIED: Free & Starter $0 (pay-as-you-go beyond on Starter): 0.5 GB DB storage, 1 GB file storage, 1 GB bandwidth,
  1 GB DB I/O, 1,000,000 function calls/mo, 20 GB-hours action compute, 0.5 GB search storage, 3,000 query-GBs search, 40 deployments,
  1–6 developers/team. Professional $25/developer/mo (50 GB, 25M calls, 250 GB-hr). https://docs.convex.dev/production/state/limits , https://www.convex.dev/pricing
- **Execution limits** — VERIFIED: queries/mutations 1 s of user code; actions: "Convex runtime actions: 30 minutes. Node runtime actions:
  10 minutes" (the actions guide page states "Actions time out after 10 minutes", 1,000 concurrent ops; Convex runtime 64 MB,
  `"use node"` 512 MB). Actions "are not automatically retried". https://docs.convex.dev/functions/actions
- **Scheduling** — VERIFIED: `ctx.scheduler.runAfter(ms, fn, args)` / `runAt(ts, ...)`; persisted in DB (survive restarts); from a
  mutation scheduling is atomic; mutations run exactly once, actions at most once; one function can schedule up to 1000 functions
  (8 MB args); up to 1,000,000 outstanding; results kept 7 days; `ctx.scheduler.cancel(id)`. https://docs.convex.dev/scheduling/scheduled-functions
  Crons in `convex/crons.ts`: `crons.interval("refresh", { seconds: 30 }, internal.x.y)`, `crons.cron("...", "23 3 * * *", ...)`,
  `crons.daily({ hourUTC: 9 })`; seconds-level granularity; "At most one run of each cron job can be executing at any moment."
  https://docs.convex.dev/scheduling/cron-jobs → the agent loop = action that does one step, writes state via mutation, and
  `runAfter(0, ...)` the next step: unlimited total runtime, each hop ≤10 min.
- **HTTP actions (webhooks)** — VERIFIED: `httpRouter()` + `httpAction(async (ctx, request) => ...)` in `convex/http.ts`; exposed at
  `https://<deployment>.convex.site/...` (not `.convex.cloud`); response ≤100 MiB, 64 MiB memory, multipart ≤20 MiB; no auto-retry.
  https://docs.convex.dev/functions/http-actions
- **Real-time** — VERIFIED (Next.js quickstart/agents page): `useQuery(api.tasks.get)` subscriptions; agents docs: "users receive
  progress updates through Convex's reactive subscriptions". https://docs.convex.dev/quickstart/nextjs
- **Agent component** — VERIFIED: `npm install @convex-dev/agent @convex-dev/ai-sdk-provider ai convex`; `convex/convex.config.ts`
  `app.use(agent)`; `new Agent(components.agent, { name, languageModel, instructions, tools, stopWhen, embeddingModel, contextOptions, storageOptions, usageHandler })`;
  `createThread(ctx, components.agent)` then `agent.generateText(ctx, { threadId }, { prompt })`, `continueThread`. Threads persist and
  "can be shared by multiple users and agents"; "built-in hybrid vector and text search over messages";
  `contextOptions: { recentMessages: 100, searchOptions: { limit: 10, textSearch, vectorSearch, messageRange: { before: 2, after: 1 } }, searchOtherThreads: false }`
  — `searchOtherThreads: true` "searches across all threads for the given userId". Also workflows (durable), RAG component, playground,
  usage tracking, rate limiting. npm `@convex-dev/agent` 0.7.8 (peer deps `ai ^7.0.0`, `convex ^1.46.0`); `convex` 1.48.0.
  https://docs.convex.dev/agents , https://docs.convex.dev/agents/getting-started , https://docs.convex.dev/agents/context , https://registry.npmjs.org/@convex-dev/agent/latest
  **Caveat (VERIFIED):** the `convexGateway("openai/gpt-5-mini")` default needs a paid plan — on Free you get `AiGatewayDisabled`; "On the
  Free plan, use an AI SDK provider with your own API key stored in an environment variable" (e.g. `@ai-sdk/anthropic`). https://docs.convex.dev/ai-gateway/overview
- **Cal Hacks 13.0 Convex prize** — PARTIALLY VERIFIED: Devpost snippet lists "[Convex] Best use of Convex" among 13.0 prizes; the
  Devpost page itself returned 403 so criteria text is UNVERIFIED. At another 2026 event Convex's rule was simply "your project must use
  Convex as your backend" (UNVERIFIED for Cal Hacks). https://cal-hacks-13-0.devpost.com/
- **Next.js quickstart** — VERIFIED: `npx create-next-app@latest my-app`, `npm install convex`, `npx convex dev` (logs in, creates project,
  syncs functions), wrap root layout in a client `ConvexProvider` with `ConvexReactClient`, use `useQuery`. App Router (Pages Router variant
  exists). https://docs.convex.dev/quickstart/nextjs

### B3. Long-running worker alternatives

- **Railway** — VERIFIED: Trial = one-time $5 credit, expires after 30 days, "No credit card required", 2 vCPU/1 GB per service;
  Hobby $5/mo incl. $5 usage; CPU ~$20/vCPU-mo, RAM ~$10/GB-mo, egress $0.05/GB. https://railway.com/pricing
  → cheapest "just run a Node/Python process 24/7 with a public URL" option; a 0.5 GB worker for a weekend costs cents.
- **Fly.io** — VERIFIED: "New organizations don't have a free tier"; trial "up to 2 hours of Machine runtime or 7 days, whichever comes
  first" with no card; after that "All organizations … require a credit card on file"; smallest always-on app $2.19/30 days; stopped
  machines $0.15/GB-mo rootfs. https://docs.fly.io/about/pricing → 2-hour trial makes it unusable for 33 h without a card.
- **Render** — VERIFIED: Free web services spin down after 15 min without inbound traffic, "about one minute" cold start, 750 instance
  hours/mo/workspace; "Other service types don't support Free instances" (no free background workers/cron); free Postgres 1 GB, one per
  workspace, "expire 30 days after creation". https://render.com/docs/free → only OK if the worker is an HTTP service you keep pinging.
- **ngrok** — VERIFIED: Free $0 + one-time $5 usage credit: 3 online endpoints, 1 GB transfer out, 20k HTTP/S requests/mo, one
  development domain per account (stable; "custom domains aren't available on Free"), interstitial page on HTTP endpoints (breaks some
  webhook senders unless `ngrok-skip-browser-warning` header — UNVERIFIED), 3 agents, 4k req/min. Hobbyist $10/mo removes interstitial.
  https://ngrok.com/pricing
- **cloudflared Quick Tunnels** — VERIFIED: `cloudflared tunnel --url http://localhost:8080`; "You do not need a Cloudflare account or
  domain"; "no uptime guarantee"; "up to 200 in-flight requests"; "The hostname changes each time you create a Quick Tunnel"; "do not
  support Server-Sent Events (SSE)". https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/
  → fine for a laptop worker receiving webhooks; re-register the webhook URL every restart (or use ngrok's stable dev domain).

### B4. Databases (one line each)

- **Neon Postgres Free** — VERIFIED: 1 GB/project (20 GB total), 100 CU-hr/project, 100 projects, 10 branches, 5 GB egress, 5-min
  autosuspend, pgvector included. https://neon.com/pricing
- **Supabase Free** — VERIFIED: 500 MB DB, 2 active projects, pauses after 1 week inactivity, 50k MAU, 1 GB storage, 5 GB egress,
  pgvector available; Pro $25/mo. https://supabase.com/pricing
- **Turso (libSQL/SQLite) Free** — VERIFIED: 100 databases, 5 GB storage, 500M row reads/mo, 10M row writes/mo, 3 GB syncs, 1-day PITR;
  Developer $4.99/mo. https://turso.tech/pricing (native vector search exists in libSQL — UNVERIFIED here.)
- **Convex built-in DB** — VERIFIED: document DB with schema, indexes, full-text + vector search; Free 0.5 GB, 1M function calls/mo, 1 GB
  I/O; transactional mutations; reactive queries. https://docs.convex.dev/production/state/limits
  Note: Convex is a document store, not relational SQL; "confirmed pay rules in a relational DB" is satisfiable there as a typed table
  with indexes, but if the spec literally requires SQL/Postgres, pair Convex (agent/UI) with Neon (pay rules + lessons+pgvector).

### B5. Frontend

- **Next.js** — VERIFIED: npm `next@latest` = **16.4.3** (major 16). https://registry.npmjs.org/next/latest
- **Next.js + Convex + Vercel** — VERIFIED as the documented path: Convex's Next.js quickstart (App Router) at
  https://docs.convex.dev/quickstart/nextjs ; `@convex-dev/agent` peer-depends on React 18.3/19. Deploy the Next app to Vercel Hobby, Convex
  hosts functions/DB/crons; Vercel's duration/cron limits then don't matter for the agent.

---

## Recommendation for the plan (opinion, grounded in the VERIFIED facts above)

1. **Backend/agent loop:** Convex (free tier is ample: 1M calls, 20 GB-hr actions). Agent step = action (≤10 min) → mutation →
   `scheduler.runAfter`; webhooks via `.convex.site` HTTP actions; UI gets live progress via `useQuery`. Use `@ai-sdk/anthropic` with our
   own key (gateway is paid-plan only).
2. **Lessons memory:** our own `lessons` table in Convex with `vectorIndex` (`filterFields: ["companyId"]`) + Voyage `voyage-4-lite`
   (or OpenAI `text-embedding-3-small`) embeddings; on insert, kNN top-5 within company → one Claude call → `ADD` / `SUPERSEDE old` /
   `CONFLICT → ask human`. Confirmed pay rules in a separate `payRules` table (or Neon Postgres if SQL is mandated). ~3 h.
3. **Backboard for the MLH prize (optional, ~1 h):** mirror each confirmed lesson with `add_memory(assistant_id=company, content, metadata)`
   and run the chat/explanations through `send_message(..., assistant_id, memory="Auto")` so cross-thread recall is demoable; keep our DB canonical.
   Register via https://mlh.link/backboard-signup for hackathon credits.
4. Avoid: Letta (second agent runtime), Cognee (graph pipeline overhead), Fly (2-h trial), Render free (no workers), Vercel for the loop.
