# Research: Photon (Spectrum) iMessage API + Browser automation tools

Researched 2026-10-24 from official docs / registries only. Each finding is labelled
**VERIFIED** (read in an official doc; URL given) or **UNVERIFIED** (could not read the
official page; source noted). Where the fetcher could not read a page (403), it is said so.

Note on Photon docs: `docs.photon.codes/...` 301-redirects to `photon.codes/docs/...`.
Photon has two doc tracks: **Stable** (`spectrum-ts` SDK + "Webhooks") and **Beta (2.0)**
(a new REST "Photon API" with `@photon-ai/api` / `photonhq-api` clients). Stable is what
"Spectrum" refers to; Photon itself says "Stable is the recommended choice for production agents".

---

## PART A — Photon / Spectrum

### A1. What Spectrum is; sending; receiving; SDK packages

**VERIFIED** — https://photon.codes/docs/spectrum-ts/getting-started
- Spectrum is "a unified messaging SDK for TypeScript" — "Write your logic once, deliver it across every platform." Providers: iMessage (cloud and local-Mac), WhatsApp Business, Telegram, terminal, voice (SIP), custom providers via `definePlatform`. SMS/RCS is not a separate provider; it is an automatic *fallback* on iMessage lines (see A2/A3).
- Core primitives: **Message** (content: text / attachments / structured), **Space** (a conversation: DM, group, terminal session), **User** (platform participant), **Platform provider**.
- Install: `npm install spectrum-ts` (TypeScript 5+). Leaner: `bun add @spectrum-ts/core @spectrum-ts/imessage`. Local-Mac iMessage: `@spectrum-ts/imessage-local` (macOS only, host signed into Messages).
- Auth: `projectId` + `projectSecret` (or env `SPECTRUM_PROJECT_ID` / `SPECTRUM_PROJECT_SECRET`), from project Settings in the dashboard (https://app.photon.codes). `webhookSecret` via `SPECTRUM_WEBHOOK_SECRET`.
- Send + receive loop (quoted):
  ```ts
  import { Spectrum } from "spectrum-ts";
  import { imessage } from "spectrum-ts/providers/imessage";
  const app = await Spectrum({ projectId, projectSecret, providers: [imessage.config()] });
  for await (const [space, message] of app.messages) {
    if (message.content.type === "text") await space.send("hello world");
  }
  ```
  Other methods: `app.send(space, ...)`, `space.responding(fn)` (typing indicator while fn runs), `message.reply(...)`, `app.stop()`.
- Receiving replies: two paths. (1) **`app.messages`** — an `AsyncIterable` of `[Space, Message]`; this is a long-lived streaming connection (Photon's blog calls it a gRPC stream) that needs **no public URL**. (2) **`app.webhook(req, handler)`** for HTTP webhook deliveries (needs a public HTTPS URL — see A5). No polling API in Stable.

**VERIFIED** — https://photon.codes/docs/spectrum-ts/webhooks.md
- "`app.webhook()` does not feed [`app.messages`] and never opens the streaming connection." Handler is "invoked fire-and-forget — it runs after the HTTP response is sent."

**VERIFIED** — https://photon.codes/docs/api-reference/introduction.md
- REST base URL `https://spectrum.photon.codes`, HTTP Basic auth (user = projectId, password = projectSecret). The Stable REST API is a **management plane** (webhooks, platforms, lines, users) — "use the `spectrum-ts` SDK or webhooks for runtime messaging." There is **no Stable REST send-message endpoint**.
- Confirmed from the OpenAPI spec (https://spectrum.photon.codes/openapi/json, title "Spectrum Cloud External API 1.0.0"): endpoints are projects, lines, users, webhooks, platform tokens, billing, voice SIP, WhatsApp templates, Slack. No `/messages` endpoint.

**VERIFIED** — Beta REST send (https://photon.codes/docs/beta/get-started/imessage): Beta SDK `photon.projects.sendMessage({ path:{id}, headers:{"idempotency-key"}, body:{ spaceId, senderId, parentMessageId, content:{type:"text",format:"plain",text} } })`; Python `photon.projects.send_message(SendMessageInput(...))`. Response: "Reply accepted for asynchronous dispatch; delivery is not confirmed." Beta inbound: `listMessages` polling in the tutorial, or Socket.IO live events (https://photon.codes/docs/beta/websocket/index: "Receive the same public event objects delivered by webhooks over a persistent Socket.IO connection"). Beta iMessage "supports only text and images"; tapbacks/polls/effects/voice notes are Stable-only.

**npm versions — VERIFIED** (registry.npmjs.org, queried 2026-10-24; npmjs.com HTML returned 403):
- `spectrum-ts` **12.14.0**, published 2026-10-22. Repo github.com/photon-hq/spectrum-ts. Description: "Bring agents to any interface — unified messaging SDK for TypeScript."
- `@spectrum-ts/core` 12.14.0, `@spectrum-ts/imessage` 12.14.0 (same date).

**Python SDK:**
- **VERIFIED** — No Python SDK for Stable Spectrum. The Stable docs index (https://photon.codes/docs/llms.txt) lists only `spectrum-ts`; PyPI `spectrum-ts` and `photon-spectrum` → 404. (PyPI `spectrum-py` is an unrelated Star Citizen library.)
- **VERIFIED** — Beta has API clients: TypeScript `npm install @photon-ai/api`, Python `pip install photonhq-api`, Rust `cargo add photonhq-api` (https://photon.codes/docs/beta/api-client/index). These are thin REST clients for Beta, not the Spectrum SDK.

### A2. Plans and limits

**VERIFIED** — https://photon.codes/pricing (quoted; note the table columns were hard to align in scraped text)
- **Free** — "Everything you need to get started. Powerful APIs, open-source tools, and zero cost." iMessage: "Unlimited daily messages with Auto Scale"; number type **Managed Shared**; **max 10 users**; RCS/SMS fallback and Telegram included. Group messaging shows "Limited" for Free/Pro (column alignment ambiguous).
- **Pro** — **$25/mo**, "Most Popular", "Up to 100 users", Managed Shared number, unlimited daily messages with Auto Scale, RCS/SMS fallback.
- **Business** — **$250 / line / mo**, "Dedicated iMessage lines", "Unlimited daily messages", "Cold outreach supported - up to 50 new contacts per day", "Full group messaging iMessage API access", unlimited users ("Auto Scale Required for unlimited users").
- **Enterprise** — Custom; "Dedicated iMessage lines - you own the numbers", "lowest throttling", 50 new contacts/day cold outreach, custom WhatsApp and Phone Call pricing.

**VERIFIED** — Beta plans page (https://photon.codes/docs/beta/plans-and-billing) differs slightly (Beta billing model): "Monthly base fee | $0 | $25 | $0", "Monthly minimum | None | None | $250", "Shared iMessage assignments | 25 | 100 | Dedicated lines", "Dedicated iMessage lines | Not available | Not available | $250 / line / month", Business standard limit 50 dedicated lines per project.

**VERIFIED** — https://photon.codes/docs/spectrum-ts/providers/imessage/connection-and-routing
- Shared (Free/Pro): "Shared pool. Each end user is routed through a number from a shared pool." Recipient sees "A normal iMessage from a number that may differ across recipients." `phone` param ignored. "Shared-pool mode does not create group chats and does not subscribe to iMessage's group-event stream." `space.create()` with multiple users throws `UnsupportedError`.
- Dedicated (Business): "All end users text the same number, which belongs to your project." Pin with `phone`; group creation and inbound group events supported. Auto-scale is opt-in on Business: when a line nears capacity, Spectrum provisions another.

**VERIFIED** — CLI billing (https://photon.codes/docs/cli/billing): `photon billing plans`, `photon billing checkout pro|business --qty N`, `photon billing manage`, `photon projects upgrade`.

### A3. Rich content, receipts, threading

**VERIFIED** — Content types (Stable, https://photon.codes/docs/llms.txt index): text, markdown, attachments, voice, contacts, rich links, app (iMessage App cards), polls, groups, replies, edits, unsend, read, typing indicators, rename, avatar, membership, custom.
- **Tap-to-reply / buttons:** No button/quick-reply content type exists. The only interactive type is **polls** (https://photon.codes/docs/spectrum-ts/content/polls): `poll(title, ...choices)`; "Outbound polls always require a nonempty title"; "Poll responses arrive as `poll_option` content" with `selected: true/false` and the nested `poll` identity (`pollMessageGuid`, `optionIdentifier`). Native iMessage polls are cloud-only (https://photon.codes/docs/spectrum-ts/providers/imessage/messaging-features/native-polls). Tapback reactions (`message.react(Emoji.laugh)`) can also serve as a lightweight yes/no channel; inbound reactions arrive as `content.type === "reaction"` with `emoji` and a slim `target` ({id, platform, timestamp, contentPreview}).
- **Links:** `richlink(url)` — Spectrum "carries only the URL" and "does not fetch Open Graph metadata"; "Each provider asks its native client to render or unfurl the URL" (https://photon.codes/docs/spectrum-ts/content/rich-links). Deliverability doc warns Apple suppresses link-clicking in a *first* message until the recipient replies.
- **iMessage provider matrix** (https://photon.codes/docs/spectrum-ts/providers/imessage): text, attachments, contacts on both cloud and local; reactions, replies, edits, unsend, read receipts, effects, streaming text, typing indicators, iMessage Apps, backgrounds = **cloud only**; group create/rename/avatar/membership = **dedicated lines only**.
- **Read receipts** (https://photon.codes/docs/spectrum-ts/content/read): send with `message.read()` / `space.send(read(message))`. Inbound: a `Message` with `content.type === "read"`, `message.sender` = reader, `message.content.target` = your outbound message (its `id` says which was read), `message.timestamp` = when marked read. iMessage receipts are chat-level ("Every unread message in the chat is marked read"); DMs reliable, groups best-effort.
- **Delivery receipts:** No delivery-receipt event. Delivery flags are exposed as native metadata on cloud iMessage messages (https://photon.codes/docs/spectrum-ts/providers/imessage/messaging-features/message-metadata): `isSent`, `isDelivered`, `isDeliveredQuietly`, `didNotifyRecipient`, `isDelayed`, `sendErrorCode` ("`sendErrorCode === 0` means Apple recorded no send error"), `dateDelivered`, `dateRead`, `dateEdited`, `dateRetracted`. Not covered: an iMessage-vs-SMS indicator on the message (the User object has an optional `service` field: `"iMessage" | "SMS" | "RCS" | "unknown"`).
- **Threading** (https://photon.codes/docs/spectrum-ts/reactions-and-replies, .../content/replies): outbound threaded reply = `message.reply("...")` or `space.send(reply(text("..."), message))`; "threaded replies work on iMessage and WhatsApp Business"; elsewhere `reply()` "resolves as a no-op". **Inbound replies: the docs do NOT document a replyTo/inReplyTo field.** The webhook Events page states explicitly: "Inbound replies arrive as plain `text`. There is no reply arm, and the thread link is not surfaced." → Implication for the hackathon: tie replies to questions by **conversation state** (one outstanding question per `space.id`, match by `message.timestamp` ordering), or use **polls** (vote carries `pollMessageGuid`) or **tapbacks** (reaction carries `target.id`) when you need a hard link.

### A4. Opt-in / contact requirements; send limits

**VERIFIED** — https://photon.codes/docs/spectrum-ts/troubleshooting/imessage
- On Free/Pro "a shared line will only message recipients you've registered as **users** of your project." Unregistered targets fail with "Target not allowed for this project." Add users in Dashboard → Users tab (phone or email), or REST `POST /projects/{projectId}/users/`. Business dedicated lines "isn't subject to the allowlist."
- Beta doc adds (https://photon.codes/docs/beta/get-started/imessage): "a shared line cannot send an unsolicited first message" — the user must start the conversation. (Beta wording; Stable troubleshooting page frames it as the users allowlist. Treat "recipient must be registered as a user, and ideally texts first" as the safe assumption on Free.)
- Free tier cap: 10 users (pricing page). Business cold outreach: 50 new contacts/line/day.

**VERIFIED** — https://photon.codes/docs/best-practices/imessage-deliverability
- Hard limit: "5,000 outbound messages per server per day". No per-hour limit stated; "Bursts of 100/min look automated because they are"; flag trigger "100+ messages from one line in a tight window"; avoid off-hours sends; cap follow-ups at "2–3 follow-ups, spaced across days, not hours."
- New-conversation cap: "50 new conversations per line per day" (first message to a never-messaged recipient; replies in existing conversations don't count).
- Apple marks a conversation trusted "After the user sends at least three messages." Outbound-first shows a "Report Junk" banner; share a contact card — "Once they save it, you're a known contact."
- Capacity guidance: 400–500 users per line (moderate), 200–400 (intensive); stop assigning at 70–80% utilization. SMS/RCS fallback traffic is subject to carrier filtering independently of iMessage health.

**VERIFIED** — API rate limit (https://photon.codes/docs/api-reference/rate-limit): "The default maximum rate limit is **5 requests per second per project**", 429 on excess, raisable on request.

### A5. Webhook payload, signature verification, public URL

**VERIFIED** — https://photon.codes/docs/webhooks/events
- Body: `{ event, space, message }`; `event` is always `"messages"`.
- `space`: `{ id (opaque, stable), platform: "iMessage", type: "dm" | "group", phone: <E.164 of dedicated line, or "shared"> }`.
- `message`: `{ id (opaque; identical across redeliveries → dedupe key), platform, direction: "inbound", timestamp (ISO 8601 UTC, when the user sent it), sender: { id (E.164 on iMessage), platform }, space: {…same…}, content: { type: "text", text } | { type: "reaction", emoji, target:{id,platform,timestamp,contentPreview} } | attachment metadata (mimeType,size,filename — no bytes) | richlink {url} | … }`.
- No `from` field (use `message.sender.id`); no `replyTo`/thread field.
- Headers: `Content-Type: application/json`, `User-Agent: spectrum-webhook/<version>`, `X-Spectrum-Event`, `X-Spectrum-Webhook-Id` (UUID of registered webhook), `X-Spectrum-Timestamp` (unix seconds), `X-Spectrum-Signature` (`v0=` + 64 hex chars).

**VERIFIED** — https://photon.codes/docs/webhooks/verifying-signatures
- HMAC-SHA256 keyed with the per-webhook signing secret over `"v0:" + timestamp + ":" + rawBody` (raw bytes, not re-serialized JSON); expected `"v0=" + lowercase hex`; reject if `|now - timestamp| > 300s`; constant-time compare (check lengths first). Node:
  ```js
  const expected = 'v0=' + createHmac('sha256', SECRET).update(`v0:${ts}:${raw}`).digest('hex');
  const ok = expected.length === sig.length && timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  ```
  Python: `hmac.new(SECRET, f"v0:{ts}:{raw}".encode(), hashlib.sha256).hexdigest()` + `hmac.compare_digest`.
- The SDK does this for you: `app.webhook(req, handler)` verifies with `webhookSecret` / `SPECTRUM_WEBHOOK_SECRET`; returns 401 bad sig, 400 missing headers, 500 if no secret configured. "Pass the raw body bytes."

**VERIFIED** — https://photon.codes/docs/webhooks/quickstart and https://photon.codes/docs/webhooks/managing-webhooks
- Register: `POST https://spectrum.photon.codes/projects/{projectId}/webhooks/` with `{"webhookUrl": "..."}` (Basic auth) → response includes `signingSecret` — "This is the only time you will ever see it." Also via Dashboard → **Webhook** tab (add/remove). No CLI command yet ("`photon webhooks` CLI is on the roadmap"). List `GET`, delete `DELETE .../webhooks/{id}/`. OpenAPI also shows `PATCH .../webhooks/{id}` and `POST .../webhooks/{id}/secret/rotate`.
- **Public URL required:** "A reachable, public HTTPS URL — ngrok works for local development." "The worker won't deliver to plain `http://` or to a private/internal address like `localhost`". Quickstart literally runs `ngrok http 3000`. No SDK tunnel. **The no-public-URL alternative is `app.messages` (streaming) in Stable, or Socket.IO events in Beta.**

**VERIFIED** — https://photon.codes/docs/webhooks/delivery
- Up to 6 attempts; delays ≈ 200ms, 1s, 5s, 10s, 10s ±50% jitter; retry on 5xx/408/429/conn errors/timeouts; 30s per-attempt timeout; then dropped ("bounded-retry contract, not zero-loss delivery"; no DLQ). At-least-once → dedupe on `X-Spectrum-Webhook-Id` + `message.id` for 24–48h. **No ordering guarantees** (even per space) — sort by `message.timestamp`. URL checks at delivery time: HTTPS only, no loopback/private/link-local, no redirects followed; a bad URL still registers but events are silently dropped.

### A6. Status / reliability

**VERIFIED** — https://status.photon.codes/ (incident.io). "We're fully operational." Uptime Jul–Oct 2026: iMessage (Free/Pro/Business) **99.88%**, Infra (Spectrum API) 99.993%, Webhook Delivery 100%, Foundation (Macrocosm – Mac Nodes) 99.85%, Dashboard 100%. No incidents listed for Oct 2026.
**UNVERIFIED (vendor blog)** — Photon claims "99.9%–99.95% uptime with sub-1-second delivery" and "10M+ iMessage API calls per day" (https://photon.codes/blog/what-is-an-imessage-api-the-complete-guide-for-developers-and-businesses). Same blog: "When iMessage is unavailable for a given recipient, Spectrum routes the message over SMS or RCS instead."
Support: help@photon.codes, Discord (footer).

### Hackathon implications (Photon)
- Use Stable `spectrum-ts@12.14.0` with `imessage.config()` and `for await (const [space, message] of app.messages)` → no ngrok needed. Add webhooks only if deploying serverless.
- Free tier: 10 registered users, shared pool number (varies per recipient), no groups, recipient must be added as a project user (Dashboard → Users). Demo testers must be pre-registered.
- Threading: no inbound reply-to field; design one-open-question-per-space state, or use polls/tapbacks for hard correlation.
- Read receipts available (chat-level); "delivered" only via native metadata flags; no explicit SMS-vs-iMessage per message.

---

## PART B — Browser automation

### B1. Playwright (Node)

- **VERIFIED** — version: `playwright` / `@playwright/test` **1.64.1**, published 2026-10-14 (registry.npmjs.org; `next` = 1.65.0-alpha-2026-10-24). Release notes page latest heading "Version 1.64" (https://playwright.dev/docs/release-notes).
- **VERIFIED** — storageState (https://playwright.dev/docs/auth): save with `await page.context().storageState({ path: authFile })`; reuse via `storageState: 'playwright/.auth/user.json'` in config or `test.use({ storageState })`; "you need to delete the stored state when it expires"; "The browser state file may contain sensitive cookies and headers" — don't commit. "Playwright does not provide API to persist session storage" (manual snippet provided). For expired auth, "authenticate by manually running the `auth.setup.ts`" in UI mode. The page does not mention 2FA or bot detection.
- **VERIFIED** — codegen (https://playwright.dev/docs/codegen): `npx playwright codegen <url>`; `--save-storage=auth.json` "to save cookies, localStorage and IndexedDB data at the end of the session"; `--load-storage=auth.json` "to consume the previously loaded storage". Headed required for `page.pause()` flows ("Make sure to run headed", `headless: false`).
- **VERIFIED** — headed/headless (https://playwright.dev/docs/browsers): "Playwright ships a regular Chromium build for headed operations and a separate chromium headless shell for headless mode"; `channel: 'chrome'` runs installed branded Google Chrome (Chrome's "New Headless… is the real Chrome browser").
- **VERIFIED** — CDP attach (https://playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp): "This method attaches Playwright to an existing browser instance using the Chrome DevTools Protocol." Chromium-only; "significantly lower fidelity" than `connect()`. `const browser = await chromium.connectOverCDP('http://localhost:9222'); const ctx = browser.contexts()[0]; const page = ctx.pages()[0];` Warning: launching the browser without Playwright's exact args can break some functionality. `launchPersistentContext(userDataDir)` — docs warn **not** to point at Chrome's main profile; "use a separate directory (for example, an empty folder) as your automation profile instead."
- **UNVERIFIED** — 2FA/bot detection: Playwright official docs have no guidance; practical approach is manual headed login once (codegen `--save-storage`) then reuse storageState. Chrome 136+ refusing `--remote-debugging-port` on the default profile is widely reported but was not read in an official doc here.

### B2. Browser Use

- **VERIFIED** — Python library `browser-use` **0.13.11** (PyPI, released 2026-10-07), Python ≥3.11 <4.0, `pip install browser-use` (docs quickstart: `uv pip install browser-use` + `uvx browser-use install`). LLM classes `ChatBrowserUse()` (recommended) or `ChatAnthropic(model='claude-sonnet-4-0')` with `ANTHROPIC_API_KEY` (https://docs.browser-use.com/open-source/quickstart.md).
- **VERIFIED** — Cloud API V4 (https://docs.browser-use.com/introduction): base `https://api.browser-use.com/api/v4`, header `X-Browser-Use-API-Key`; `POST /api/v4/runs` (agent task), `POST /api/v4/browsers` (cloud browser → `cdpUrl`), `PATCH /api/v4/browsers/{id}` `{"action":"stop"}`.
- **VERIFIED** — TypeScript SDK exists: `browser-use-sdk` **3.12.1** on npm (published 2026-10-17; "Official TypeScript SDK for the Browser Use API"); `npm install browser-use-sdk@latest playwright-core`, `import … from "browser-use-sdk/v4"`, mirrors Python (`runs.create`, `browsers.create`). Cloud-only SDK — the local agent library is Python-only.
- **VERIFIED** — Pricing (https://browser-use.com/pricing + https://docs.browser-use.com/cloud/guides/billing.md): "Pay as you go. No subscription. Credits never expire." **Free credits: $1 once** (Google/GitHub/Microsoft signup, no card). Min top-up $5. Cloud browsers $0.02/hour (1-min minimum, whole minutes); residential proxy $5/GB; direct $0.20/GB; agents = model token cost **+20%** (BYOK: 20% of published token rates as orchestration fee). **No per-step or per-task price** — billed by tokens + browser time + traffic. Listed model rates incl. fee: Claude Sonnet 5 $2.40/$12.00 per 1M in/out; Claude Opus 5 $6.00/$30.00. Concurrency: 10 sessions at $0 spend.
- **VERIFIED** — Existing session / local Chrome (https://docs.browser-use.com/open-source/customize/browser/real-browser.md and .../authentication.md): `Browser.from_system_chrome()` (auto-detects Chrome + first profile; `profile_directory='Profile 5'`), or `Browser(executable_path=..., user_data_dir='~/Library/Application Support/Google/Chrome', profile_directory='Default')`; "You may need to fully close Chrome before running these examples." storage_state: `await browser.export_storage_state('auth.json')` then `Browser(storage_state='auth.json')` (Playwright-format JSON; auto-load/auto-save). Cloud profile: `Browser(cdp_url='wss://cloud.browser-use.com/...')`. Remote CDP page: https://docs.browser-use.com/open-source/customize/browser/remote.md. 2FA: TOTP secret via `sensitive_data={'bu_2fa_code': totp_secret}` (agent generates codes); email/SMS codes via follow-up action.

### B3. Stagehand (Browserbase)

- **VERIFIED** — `@browserbasehq/stagehand` **4.3.0** on npm (published 2026-10-20; `v3-latest` 3.7.3). Install: `pnpm add @browserbasehq/stagehand 'zod@~4.4.3'`; Node 22.18+; Python 3.11+ and Go 1.26+ SDKs also exist (https://docs.stagehand.dev/v4/first-steps/installation.md). Drives Chromium over CDP "with no Playwright or Puppeteer dependency" (https://docs.stagehand.dev/).
- **VERIFIED** — primitives: `act` (natural-language action), `extract` (schema-validated structured data), `observe` (discover actions); plus bring-your-own agent loop.
- **VERIFIED** — Local without Browserbase (https://docs.stagehand.dev/v4/configuration/browser.md):
  ```ts
  import { localBrowser, Stagehand } from "@browserbasehq/stagehand";
  const browser = await localBrowser.launch({ headless: false, executablePath: "...", port: 9222, userDataDir: "./chrome-user-data" });
  const connected = await localBrowser.connect({ cdpUrl: "http://127.0.0.1:9222" }); // attach to running Chrome
  const stagehand = await Stagehand.create({ browser });
  ```
  "Local launch and CDP connect don't use Browserbase"; API key needed only for `browserbase.launch()`. Trade-off: server-side caching and the Model Gateway are "Not available" locally — so **locally you must supply your own model key**.
- **VERIFIED** — Anthropic supported (https://docs.stagehand.dev/v4/configuration/models.md): first-class provider; format `provider/model`, e.g. `model: { modelName: "anthropic/claude-sonnet-5", apiKey: process.env.ANTHROPIC_API_KEY }`; also `anthropic/claude-opus-5`, `anthropic/claude-haiku-4-5`. "bare model names are rejected." Omitting `model` uses Browserbase Model Gateway (Browserbase browsers only).
- **VERIFIED** — Browserbase pricing (https://www.browserbase.com/pricing): **Free $0/mo** — 3 concurrent browsers, 1 browser hour, 3 Agent runs, 1,000 Search + 1,000 Fetch calls, 15 min max/session, $5 model tokens, no captcha solving/stealth. **Developer $20/mo** — 25 concurrent, 100 browser hours then $0.12/hr, captcha solving, basic stealth. Startup $99/mo. Scale custom.

### B4. Spreadsheet-export fallbacks (one URL each)

- **Jobber — VERIFIED** — https://help.getjobber.com/hc/en-us/articles/115009543028-Timesheets : "From the side navigation, select **Insights** then **Reports**", choose **Timesheets** under Work reports; "To export the report click **Receive Excel Copy**." "Time here is displayed in hours with decimal places" (2h30m → 2.5). Approvals on the Approve Timesheets tab. Reports Basics (https://help.getjobber.com/hc/en-us/articles/115009784848-Reports-Basics) describes the generic **Email CSV** button (".csv file of the report which can be opened in Excel", sent to your login email; all columns or visible columns); Taxation, Waypoints, Job Follow-ups cannot be exported. Note: export is **emailed as Excel**, not a direct download — a browser agent would need mailbox access or a different report (Visits report has direct "Export to CSV").
- **QuickBooks Online — VERIFIED** — https://quickbooks.intuit.com/learn-support/global/manage-lists/export-reports-lists-and-more/00/382314 ("Export your QuickBooks Online data"): Settings (gear) → **Export data** → Reports tab → date range → toggle items → **Export to Excel** (reports + lists as Excel in one .zip; covers posting transactions: invoices, receipts, bills). Non-posting transactions (estimates, POs): Sales transactions / Expense transactions list → filter by Type + date → export icon. (US-specific URL `.../L1xleDrLp_US_en_US` returned 404; AU variant exists at `.../L1xleDrLp_AU_en_AU`.)
- **Gusto — UNVERIFIED (support.gusto.com returned 403 to the fetcher, even with a browser UA)** — https://support.gusto.com/article/101334493100000/View-and-download-reports . Search-result snippets from that article: Reports → **Payroll Journal** → set Date Range (optional Employee filter) → Generate Report → **Download** "to save as CSV or PDF"; "Most reports download as PDF, CSV, or Excel (.xlsx)"; some (pre-Gusto payroll report, bank transactions report) not downloadable as CSV; Reports menu requires reporting permissions. Alternate official URL: https://support.gusto.com/team-management/hr-tools/reports-/1013344931/Types-of-reports-you-can-download.htm (also 403).
