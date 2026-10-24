# Role C: Product, Messaging and Demo (PayrollPilot, Cal Hacks 13.0)

Binding context: `docs/plans/00-shared-context.md` (wins on any conflict), `specs/final.md` (sections 6, 9, 12), `docs/plan-research.md` (sections 3, 9a, 13). Written Sat 2026-10-24 about 1:30 AM PDT. All clock times are PDT. Anything not confirmed is marked **UNVERIFIED**. Every name in this file is fictional.

---

## 1. Role summary

**Mission.** Make PayrollPilot something an owner would actually hire: a dashboard that shows only what needs a human now, texts that reach a real phone and come back, and a demo, video and Devpost page that put the evidence up front.

**Two phases.**
- **Product (Sat 01:45 to Sun 02:00):** the courier (Photon worker), the message templates and reply schema, the Next.js dashboard (owner home, problem detail, manager inbox, onboarding, rules, workbook and readiness, audit log, demo panel), demo mode and the simulated-manager persona.
- **Demo (Sun 02:00 to 09:00):** video cut, `docs/DEMO.md`, Devpost text and image, README, rehearsals, submission at 08:40.

**What judges must see (C's checklist), mapped to the rubric.**

| Judge question | What C puts on screen or in the submission |
|---|---|
| Hyphenate 1: Is it real enough? | Every screen labels data **synthetic** or **real, anonymized**. The readiness report shows measured numbers with "measured on Company A, cycle N, time". A real text reaches a real phone during the live demo. |
| Hyphenate 2: Would you hire it? | The seats line in the header. Approve, edit, deny on every message, correction and rule. Manager views never show pay. Audit log traces every number. "Never submits" stated next to the Gusto draft status. |
| Hyphenate 3: Did we see something new? | The pitch line: payroll inputs, not payroll math. Cycle 1 vs cycle 2 question counts. The sync-gap list (salaried, contractors, commission). |
| Hyphenate 4: The moment | Video opens on the double-booked hours catch. Live: the text goes out, the reply lands, the correction is approved, the draft fills. |
| Cal Hacks Application | A named owner, a named problem, the one-line seats statement. |
| Cal Hacks Intentionality | One primary action per screen; "what we need from you" first; details one click away. |
| Cal Hacks Functionality | Live demo with cached fallbacks; video on Devpost for asynchronous sponsors. |
| Cal Hacks Creativity | Learning rules from history and grading them against the owner's own runbook. |
| Cal Hacks Technical Complexity | Three systems synced with completeness checks, deterministic engine plus three agents, live updates, lesson loop with backtests. |

---

## 2. Role onboarding (15 minutes)

1. **Accounts.** GitHub repo. Convex project (B invites you; you need the dashboard to read function logs). Vercel project `payrollpilot` (Shanin invites you). Photon dashboard (Shanin's project; he adds you or shares the project id and secret through the team vault message, never chat history). Devpost: join the team project page now, not Sunday.
2. **Photon setup (read `docs/plan-research.md` section 9a first).** Free plan: shared pool number, max 10 registered users, no group messaging, recipients must be pre-registered or sends fail with "Target not allowed for this project". Register in Dashboard → Users: the owner's phone (Shanin) and the "manager" phone (whoever plays the manager; in the demo the owner stands in). Confirm the account has a phone set (the Oct 20 blocker was `account_phone_missing`). SMS is an automatic fallback on iMessage lines, so Android phones still work.
3. **Tools.** Bun 1.4+, Node 22, Git, GitHub CLI. Playwright browsers for the e2e smoke test (`bunx playwright install chromium`). A phone with iMessage registered with Photon. Screen-recording tool (QuickTime on Mac is enough) and a video editor (iMovie, CapCut or Descript).
4. **Repo.** `git clone`, `bun install`, `cp .env.example .env`, fill from the vault message. Terminal 1: `cd apps/web && bunx convex dev`. Terminal 2: `bun dev`. Terminal 3 (after C-02): `bun run apps/courier/src/index.ts`. Branch names `c/<feature>`. Every PR targets `main`.
5. **Where things live.**

| Path | Contents | Owner |
|---|---|---|
| `apps/web/app/**` | routes and pages | C |
| `apps/web/components/**` | UI components | C |
| `apps/web/convex/demo.ts` | demo mode: timers, reset, simulated reply | C (B reviews) |
| `apps/web/convex/messaging/contract.ts` | courier contract (function names and arg shapes) | B writes, C acknowledges |
| `apps/courier/**` | Bun worker for Photon | C |
| `apps/courier/contacts.json` | `contactRef → phone` map for the registered demo phones; **gitignored** | C |
| `packages/engine/src/messages/**` | templates, reply Interpretation schema, tests | C (B co-signs the schema) |
| `e2e/smoke.spec.ts` | Playwright smoke test | C |
| `docs/DEMO.md`, `docs/PROOF.md` (with A), `README.md` | demo kit, proof statement, README | C |

---

## 3. Interfaces

### 3.1 What C consumes from B (binding names, shared context section 6)

| Convex function | Used by | Shape (args → result) |
|---|---|---|
| `cycles.list`, `cycles.get` | owner home, stage tracker | `{companyId}` → `Cycle[]`; `{cycleId}` → `Cycle` |
| `flags.list`, `flags.get` | owner home, problem detail, manager inbox | `{cycleId, status?, routeTo?}` → `Flag[]` joined with `Question`, `Correction` |
| `questions.approve`, `questions.deny`, `questions.edit` | approval sheet | `{questionId, userId, text?}` → `Question` |
| `corrections.approve`, `corrections.reject` | problem detail | `{correctionId, userId}` → `Correction` |
| `rules.list`, `rules.approve`, `rules.toggle`, `rules.stateInPlainWords` | rules screen, onboarding | `{companyId}`; `{ruleId, userId}`; `{ruleId, on}`; `{companyId, text}` → `RuleRestatement` |
| `onboarding.run`, `onboarding.questions` | onboarding screen | `{companyId}` → proposed `Rule[]`; → `Question[]` for the owner |
| `drafts.get`, `drafts.approveGate`, `drafts.fillGusto` | workbook and readiness | `{cycleId, stage}` → `Draft`; `{draftId, userId}`; `{draftId}` → `Draft` with `status: "calculated"` |
| `audit.list` | audit log | `{companyId, cycleId?, type?, limit}` → `AuditEvent[]` |
| `eval.summary` | readiness report | `{companyId}` → `{m1, m3, m5, m6, measuredAt}` |
| `messages.pendingOutbound`, `messages.markSent`, `messages.inbound` | **courier only** | see section 7, ticket C-02 |
| `demo.reset`, `demo.simulatedReply` | demo panel | `{companyId, toCycle: 1|2}`; `{questionId, persona: "manager"|"owner", scenario?}` |

C reads Convex through `useQuery` / `useMutation` from `convex/react`; the dashboard never computes pay, never calls a model, never talks to Photon.

**Contract notes to confirm with B at G0 (Sat 03:00).**
- `flags.list` returns the joined `Question` and `Correction` so the owner home needs one query per screen.
- `Flag.confidence` is `"certain"` or a number 0 to 1; `Flag.precedent.note` is `"no precedent"` when there is none. C renders both verbatim.
- `AuditEvent.actor.agent` is `"analyst" | "auditor" | "messenger" | null`; the audit log colours hand-offs by it.
- `messages.pendingOutbound` returns rows with `conversationKey`, `text`, `kind`, `options`, `messageId`; **phone numbers never appear in Convex**.
- `demo.simulatedReply` writes a `Message` with `kind: "text"` and `data.simulated = true` and an `AuditEvent` of type `demo.simulated_reply`. The UI shows a **Simulated** badge on both.

### 3.2 What C produces, for whom, by when

| For | Artifact | Path | Handoff |
|---|---|---|---|
| B | Courier contract acknowledged; courier running against B's dev deployment | `apps/courier/` | **Sat 03:00 (G0)** hello round trip; **Sat 13:00 (G1)** real phone round trip |
| B | Message templates and the `Interpretation` zod schema | `packages/engine/src/messages/` | Sat 04:00 (schema), Sat 11:00 (templates final) |
| B | Demo mode spec: timers, reset, simulated reply | `apps/web/convex/demo.ts` | Sat 15:00 |
| A | Owner feedback loop: Shanin reviews owner home at G1 and G2 | screen share | Sat 13:00, 18:00 |
| Everyone | `docs/DEMO.md` v1 (script, shot list, run order) | `docs/DEMO.md` | Sat 23:00 (G3) |
| Everyone | Devpost draft submitted | Devpost | Sat 23:00 |
| Everyone | README outline with "what's real, what's simulated" | `README.md` | Sun 01:00, final Sun 06:00 |
| Everyone | Video final, rehearsal 1 | file + phone | Sun 06:30 |
| Everyone | Submission | Devpost | **Sun 08:40** |

---

## 4. Design system (binding; short on purpose)

**Personality.** Calm, plain, trustworthy. One strong number per screen. The owner wanted "super simple" on Oct 20: the owner home is what needs them now, counts, and one-tap actions; everything else is one click away. No debugging screens for the owner.

**Stack.** Tailwind 4 + shadcn (default style, CSS variables, lucide icons). No other UI library. Mobile works (the owner approves from a phone), desktop is the demo surface (1280 px laptop).

### 4.1 Tokens (`apps/web/app/globals.css`)
| Token | Value | Use |
|---|---|---|
| `--background` | `#FAFAF7` | page (warm off-white) |
| `--foreground` | `#141A1F` | text |
| `--card` | `#FFFFFF` | cards |
| `--muted` | `#F1F2EE` | surfaces, table header |
| `--muted-foreground` | `#5F6B73` | secondary text |
| `--border` | `#E4E6E1` | hairlines |
| `--primary` | `#0F5C4A` | deep green: primary buttons, links, approve |
| `--primary-foreground` | `#FFFFFF` | |
| `--destructive` | `#B3261E` | deny, blocking |
| `--hold` | `#9A6700` | held items (amber text) |
| `--hold-soft` | `#FFF4D6` | held chip background |
| `--ask` | `#1D4ED8` | "asked" state, question chips |
| `--ask-soft` | `#E8EEFF` | |
| `--ok-soft` | `#DDF4E7` | clean / fixed chip (text `#0F5C4A`) |
| `--radius` | `12px` | |

### 4.2 Type
- One font: **Inter** (variable), via `next/font`. Numbers `tabular-nums`.
- h1 `text-2xl font-semibold`, h2 `text-lg font-semibold`, body `text-base`, small `text-sm text-muted-foreground`.
- Money: `<Money cents />` renders `$1,284.50`; never shown in manager or employee views.

### 4.3 Badges that carry the rubric
| Badge | When | Rendering |
|---|---|---|
| **Confidence** | every flag card | `"rule: certain"` for deterministic hits (slate chip); `"72%"` only for fuzzy results (amber chip below 0.85, green at or above). Exactly Hyphenate's style: the number only where there is real uncertainty. |
| **Precedent** | every flag card | `"no precedent"` (outlined chip) or `"precedent: rule R-14, Sep 20"` (linked). |
| **Data label** | every page header and every card from Company R | `synthetic` (grey) or `real, anonymized` (green outline). Never missing. |
| **Agent hand-off** | audit log rows and the problem timeline | `Analyst`, `Auditor`, `Messenger` chips in three hues; `Controller` in grey; `You`/`Owner`/`Manager` in black. |
| **Simulated** | any message or reply produced by `demo.simulatedReply` | red outline chip, always, also in the video. |
| **Never submits** | next to Gusto draft status | static text: "Draft only. PayrollPilot never submits payroll." |

### 4.4 Copy rules
- Second person, plain words, sentences under 20 words. Ids become fake display names only in the UI (`Worker.displayName`).
- Say "doesn't match", "no job on this entry", "needs an answer". Never "fraud", "stole", "cheated".
- Every number shows where it came from: a source chip (`Jobber`, `QuickBooks`, `Gusto`, `Workbook`) with the record id in a tooltip.
- Primary CTAs: `Approve`, `Approve and send`, `Edit`, `Deny`, `Mark fixed in Jobber`, `Approve Gate 1`, `Fill Gusto draft`.
- Manager and employee surfaces: worker, date, job, hours. **No pay amounts, ever.** Enforced by not passing `effectPayCents` to those components.

### 4.5 Components (`apps/web/components/`)
| Component | Purpose |
|---|---|
| `StageTracker` | the cycle stages as a horizontal track: Collecting → Checking → Asking → Gate 1 → Draft filled → Reconciling → Gate 2 → Done |
| `NeedsYouList` | "What we need from you": cards with one primary action each |
| `FlagCard` | seen sentence, source chips, confidence badge, precedent badge, route, affects, action |
| `ApprovalSheet` | exact text to be sent, recipient role, options preview, Approve / Edit / Deny |
| `CorrectionDiff` | before → after, effect on pay (owner only) and on job profit |
| `RuleCard` | rule in plain words, provenance (who answered, who approved, when), backtest `agree/disagree over N cycles`, on/off, undo |
| `Counts` | clean / fixed / open / held with sources |
| `LiveFeed` | questions out and replies in, updating live (Convex subscription) |
| `AuditRow` | time, actor chip, summary, refs |
| `DataLabel` | synthetic / real, anonymized |
| `Money` | cents to dollars |
| `DemoPanel` | reset to cycle 1 or 2, simulated reply, judge scenario entry |

---

## 5. Screens (routes in `apps/web/app/`)

| Route | Screen | Primary query | Contents |
|---|---|---|---|
| `/` | redirect to `/c/[companyId]` (Company A by default; a company switcher in the header for A, B, R) | `cycles.list` | |
| `/c/[companyId]` | **Owner home** | `cycles.get`, `flags.list({status: open|asked|held})`, `eval.summary` | header with seats line and `DataLabel`; `StageTracker`; `NeedsYouList` (approvals pending: messages to managers, corrections, rules, gates); `Counts`; `LiveFeed`; "Questions this cycle: 9 (last cycle: 17)" when cycle ≥ 2 |
| `/c/[companyId]/flags/[flagId]` | **Problem detail** | `flags.get` | `FlagCard` expanded; where (links to Jobber/QuickBooks records by id); the proposed question or `CorrectionDiff`; timeline of events for this flag (agent hand-offs visible); `ApprovalSheet`; `Mark fixed in Jobber` → shows the re-sync result on the next run |
| `/c/[companyId]/manager` | **Manager inbox** | `flags.list({routeTo: "manager"})` | their crew's problems; each employee message to approve or edit; replies as they arrive; **no pay amounts**; in demo mode a role switch in the header (Owner / Manager) stands in for login (login is cut-order item 5) |
| `/c/[companyId]/onboarding` | **Onboarding** | `onboarding.run`, `rules.list({status: "proposed"})`, `onboarding.questions` | proposed rules with evidence ("seen in 4 of 4 cycles", record ids), Accept / Edit / Reject; "What did we miss?" questions with answer boxes; owner-entered rule box → `rules.stateInPlainWords` → restatement to confirm, labelled "stated by owner, not seen in history" |
| `/c/[companyId]/rules` | **Rules** | `rules.list` | `RuleCard` list grouped by type; filters active / proposed / off; undo |
| `/c/[companyId]/workbook` | **Workbook and readiness** | `drafts.get({stage: 1})`, `drafts.get({stage: 2})`, `eval.summary` | Stage 1 lines per worker (hours, OT, rate, gross; held flags listed), Venmo list, Stage 2 lines (commission, tips, manager split) and the reconciliation report (job profit table, low-profit reasons); readiness: clean / fixed / open / held, dollars changed, questions this cycle vs last, Gusto draft status with "Draft only. PayrollPilot never submits payroll."; `Approve Gate 1` → `Fill Gusto draft`; download CSV |
| `/c/[companyId]/audit` | **Audit log** | `audit.list` | searchable table; filter by type and actor; each row links to its refs |
| `/c/[companyId]/demo` | **Demo panel** (hidden unless `DEMO_MODE=1`) | `demo.*` | Reset to cycle 1 / cycle 2; simulated reply for an open question (persona manager/owner, labelled); judge scenario entry (free text → stored as a Flag with `checkId: "CHK-22"` or an Auditor "unknown case" → shows the escalation); timer status |

Layout: left nav (Home, Manager, Onboarding, Rules, Workbook, Audit, Demo) at `lg:`; bottom tabs on mobile. Content `max-w-6xl`. Every page header: company name (fake), cycle period, `DataLabel`, the seats line in small text.

---

## 6. Timeline and gates (PDT)

| Time | C work | Gate checklist |
|---|---|---|
| 01:45 to 03:00 | C-01 Next.js skeleton + Convex provider; C-02 courier hello (H4); C-03 Interpretation schema + templates draft | **G0 03:00**: [ ] `bun dev` shows a page reading `cycles.list` from B's dev deployment; [ ] one Photon message sent from the courier and one reply received without a tunnel, logged in `docs/INTEGRATIONS.md`; [ ] `packages/engine/src/messages/schema.ts` merged |
| 03:00 to 05:00 | C-04 owner home on fixture data; C-02 courier wired to `messages.*` | [ ] owner home renders `data/fixtures/a/flags.json` through Convex |
| 05:00 to 09:00 | Sleep | |
| 09:00 to 13:00 | C-05 FlagCard with confidence and precedent; C-06 problem detail + ApprovalSheet; C-07 manager inbox; courier on the real phone | **G1 13:00**: [ ] flags from B's checks appear live on the owner home; [ ] approve a question on the dashboard → text lands on the real phone → reply appears in `LiveFeed`; [ ] Shanin's 5-minute owner review done, notes in `docs/STATUS.md` |
| 13:00 to 18:00 | C-08 CorrectionDiff + corrections; C-09 workbook and readiness with Gate 1 and Fill Gusto draft; C-10 audit log; C-11 demo mode (`demo.ts`, timers, reset, simulated reply) | **G2 18:00**: [ ] full loop once from the UI: approve → text → reply → correction approved → workbook updates → `Fill Gusto draft` → status `calculated`; [ ] audit log shows every step with agent chips |
| 18:00 to 23:00 | C-12 onboarding screen; C-13 rules screen; C-14 e2e smoke; `docs/DEMO.md` v1; Devpost draft | **G3 23:00**: [ ] cycle 2 counts on the owner home; [ ] rules screen shows provenance and backtest; [ ] judge scenario via the demo panel escalates with "no precedent"; [ ] Devpost draft submitted; [ ] video script locked |
| 23:00 to 02:00 | Polish, dark corners fixed, record raw video takes (C-15) | [ ] raw takes of every demo step on disk; [ ] cached snapshot at cycle 2 verified |
| **02:00 UI freeze for C** | Hand any unfinished UI ticket to Shanin or cut it | |
| 02:00 to 04:00 | Sleep (C sleeps first shift; B keeps main green) | |
| 04:00 to 06:30 | Video cut; README final; rehearsal 1 (timed) | [ ] video under 3 min, opens on the moment, labels on screen; [ ] rehearsal 1 at 06:00 |
| **06:30 Freeze** | Fixes only; tag `demo` | [ ] fallbacks verified (section 9) |
| 06:30 to 08:00 | Travel | |
| 08:00 to 08:40 | Devpost final; video link opened on a phone; rehearsal 2 | **08:40 Submit** (C), confirmed on a second device |
| 10:30 to 12:30 | Judging: C drives the laptop, Shanin narrates, Devaj handles the judge scenario on the demo panel | |

---

## 7. Tickets (one PR each; every PR targets `main`)

Each ticket: branch, goal, priority and rubric line, files, dependencies, safe-to-start, steps, acceptance test, verification, time, fallback.

### C-01 Next.js skeleton and Convex provider
- **Branch:** `c/skeleton`
- **Goal:** `apps/web` runs, reads Convex, has the layout shell and tokens.
- **Priority:** P0. Serves every screen.
- **Files:** `apps/web/app/layout.tsx`, `apps/web/app/globals.css`, `apps/web/app/providers.tsx`, `apps/web/components/ui/*` (shadcn), `apps/web/components/DataLabel.tsx`, `apps/web/components/Money.tsx`, `apps/web/app/page.tsx`.
- **Depends on:** B-01 scaffold (the `apps/web` folder exists with `convex/`). Safe to start before: tokens and components in a scratch Next app, copied in after B-01 lands.
- **Steps:** add `ConvexProvider` with `NEXT_PUBLIC_CONVEX_URL`; shadcn init (`bunx shadcn@latest init`, then `add button card badge sheet dialog tabs table input textarea tooltip separator`); tokens from section 4.1; `next/font` Inter; left nav + bottom tabs shell; `/` redirects to `/c/a` (Company A fixture id until B's ids exist).
- **Acceptance:** `bun dev` renders the shell; a `useQuery(api.cycles.list)` call returns B's fixture rows (or an empty array before B-02).
- **Verify:** `bun dev`; open http://localhost:3000.
- **Time:** 60 min. **Fallback:** plain Tailwind without shadcn.

### C-02 Courier: Photon worker bound to Convex
- **Branch:** `c/courier`
- **Goal:** The only process that touches phones. Sends pending outbound messages, relays inbound ones, never leaks a phone number into Convex.
- **Priority:** P0. Serves Hyphenate "Escalates" and "the moment"; Cal Hacks Functionality.
- **Files:** `apps/courier/src/index.ts`, `apps/courier/src/convex.ts`, `apps/courier/src/contacts.ts`, `apps/courier/src/polls.ts`, `apps/courier/contacts.json` (gitignored), `apps/courier/contacts.example.json`, `apps/courier/README.md`, `.gitignore` entry, `docs/INTEGRATIONS.md` (H4 row).
- **Depends on:** B-02 (`messages.pendingOutbound`, `messages.markSent`, `messages.inbound` and `COURIER_KEY` validation in `apps/web/convex/messaging/contract.ts`). Safe to start before: the Photon half (send and receive with a hardcoded recipient) and the hello round trip for H4; swap in Convex calls when B-02 lands.
- **Steps:**
  1. `bun create spectrum-project@latest courier --providers imessage`, move into `apps/courier`, add `convex` as a dependency (the Convex client for Node: `ConvexClient` from `convex/browser` works in Bun; **UNVERIFIED in Bun specifically, verify in H4**; fallback `ConvexHttpClient` with a 2 s poll).
  2. `contacts.ts`: load `contacts.json` `{ "owner": "+1…", "manager": "+1…" }`; `conversationKey(phone) = sha256(phone)`; `phoneFor(contactRef)`; refuse any `contactRef` not in the file (log and mark the message failed with reason `unregistered_contact`).
  3. Outbound: `client.onUpdate(api.messages.pendingOutbound, { courierKey }, rows => …)`; for each row not yet in the in-flight set: `kind === "poll"` → `polls.send(space, text, options)` (Spectrum poll API; **UNVERIFIED exact call**, fall back to numbered text); else `space.send(text)`; then `markSent({ courierKey, messageId, providerId })`. Create the space with `imessage(app).space.create(phone)` once per contact and cache it.
  4. Inbound: `for await (const [space, message] of app.messages)`: skip `direction === "outbound"`; dedupe on `message.id`; map `space.id`/sender phone → `conversationKey`; `kind` = `poll_vote` when `content.type === "poll_option"` (carry `pollMessageGuid` as `pollTarget`), `reaction` when a tapback (carry `target.id`), else `text`; call `inbound({ courierKey, conversationKey, providerId, text, kind, pollTarget })`. Pass `STOP` through unchanged (code in Convex handles it before any model).
  5. Mask phones in every log line (`+1••••1234`). Retry Convex calls 3 times with backoff; never resend a message that already has a `providerId`.
  6. Log H4 result in `docs/INTEGRATIONS.md`: time, SDK version, "no tunnel", provider ids.
- **Acceptance:** with the courier running and a `Message` row approved in Convex, the text arrives on the registered phone within 5 s and `providerId` is set; a reply from that phone appears as a `Message` with `direction: "in"` within 5 s; an unregistered `contactRef` is refused and logged; the word "sha256" appears in the Convex row and no digit string longer than 6 does (`grep` on a Convex export).
- **Verify:** `bun run apps/courier/src/index.ts` with `DEMO_MODE=1`; then in the Convex dashboard run `messages.pendingOutbound`.
- **Time:** 90 min (30 for H4, 60 for the Convex binding). **Fallback:** Telegram provider on the same SDK (still a real phone, labelled "Telegram"); last resort an in-app inbox labelled **simulated** fed by `demo.simulatedReply`.

### C-03 Message templates and the reply Interpretation schema
- **Branch:** `c/messages`
- **Goal:** Short, one-question texts with numbered or poll options; a zod schema B's Messenger fills.
- **Priority:** P0. Serves "Escalates" and the Oct 20 lesson (texts were too long).
- **Files:** `packages/engine/src/messages/templates.ts`, `packages/engine/src/messages/schema.ts`, `packages/engine/src/messages/templates.test.ts`.
- **Depends on:** B-02 for the `Question` and `Interpretation` shapes (shared context section 6). Safe to start now.
- **Templates (binding; ≤ 240 characters; never a dollar amount; placeholders in braces):**

```ts
// packages/engine/src/messages/templates.ts
export const templates = {
  managerPage:   "PayrollPilot: {n} items need you before {day}'s payroll. Open: {link}",
  ownerPage:     "PayrollPilot: {n} decisions are waiting for you before {day}'s payroll. Open: {link}",
  entryNoJob:    "{who}, on {date} your {hours}h entry has no job. Which job was it? 1 {jobA} 2 {jobB} 3 something else",
  overlap:       "{who}, on {date} two entries overlap ({a} and {b}). Which one is right? 1 {a} 2 {b} 3 both, different jobs 4 neither",
  openTimer:     "{who}, your timer from {date} {start} is still running. When did you stop? Reply the time, e.g. 4:30pm",
  longShift:     "{who}, {date} shows a {hours}h shift. Is that right? 1 yes 2 no, it ended earlier 3 forgot to clock out",
  expenseNoJob:  "{who}, a {vendor} purchase on {date} has no job. Which job? 1 {jobA} 2 {jobB} 3 overhead 4 not sure",
  venmoRate:     "Which rate should PayrollPilot use for {who}? Reply the hourly rate as a number.",   // owner only; still no amount sent out
  followUp:      "Thanks. To confirm: {restatement}. Reply 1 yes, 2 no",
  held:          "Got it. That item stays on hold until {day}; the rest of {who}'s hours go through.",
  stopAck:       "You won't get texts from PayrollPilot. Questions will go to your manager.",
} as const;
export const MAX_LEN = 240;
export function render(key: keyof typeof templates, vars: Record<string, string>): string  // throws if > MAX_LEN or if a "$" survives
```

- **Interpretation schema (agreed with B; mirrors shared context section 6):**

```ts
// packages/engine/src/messages/schema.ts
import { z } from "zod";
export const InterpretationResult = z.object({
  kind: z.enum(["confirm", "change", "fixed_in_source", "escalate", "ambiguous", "stop"]),
  optionIndex: z.number().int().min(1).max(4).nullable(),
  values: z.record(z.union([z.string(), z.number()])),   // e.g. { jobId: "job_02" }, { endAt: "16:30" }
  restatement: z.string().max(160),                        // used by templates.followUp
});
export const Interpretation = z.object({
  questionId: z.string(), messageId: z.string(),
  result: InterpretationResult,
  confidence: z.number().min(0).max(1),
  model: z.string(),
  needsFollowUp: z.boolean(),
});
```
  Rules: `STOP` (case-insensitive, alone) is `kind: "stop"` decided by code, no model; `confidence < 0.8` or `kind: "ambiguous"` → `needsFollowUp: true` → one `followUp` message, then the item is held.
- **Acceptance:** every template renders under 240 chars with realistic fake values; `render` throws on a `$`; schema round-trips 6 fixtures (one per `kind`).
- **Verify:** `bun test packages/engine/src/messages`.
- **Time:** 45 min. **Fallback:** none needed.

### C-04 Owner home
- **Branch:** `c/owner-home`
- **Goal:** The screen the owner lives on: stage, what needs them, counts, live feed.
- **Priority:** P0. Serves Intentionality and "would you hire it".
- **Files:** `apps/web/app/c/[companyId]/page.tsx`, `apps/web/components/StageTracker.tsx`, `NeedsYouList.tsx`, `Counts.tsx`, `LiveFeed.tsx`, `apps/web/app/c/[companyId]/layout.tsx` (header with seats line, company switcher, role switch in demo mode).
- **Depends on:** B-02 shapes; A-02 fixtures (`data/fixtures/a/*.json`) loaded by B into the dev deployment. Safe to start: render from the fixture JSON imported directly behind a `USE_FIXTURES` flag.
- **Steps:** `cycles.get` for the current cycle → `StageTracker`; `flags.list` filtered: `NeedsYouList` shows questions `draft` (approve to send), corrections `proposed`, rules `proposed`, and gates (`gate1_ready`, `gate2_ready`) each as a card with one primary button; `Counts` from flag statuses (clean = checks run minus flags; fixed = corrected; open; held); `LiveFeed` from `audit.list({type: "message.*"})`; when `cycle.number >= 2`, a line "Questions this cycle: {n} (last cycle: {m})".
- **Acceptance:** with fixtures, the home shows 4 stage states correctly, ≥ 3 needs-you cards with working buttons (calling B's mutations), counts that add up, and the feed updates within 1 s when a `Message` row is inserted from the Convex dashboard.
- **Verify:** `bun dev`; insert a row in the Convex dashboard; watch the feed.
- **Time:** 2 h. **Fallback:** drop `LiveFeed` to a static list.

### C-05 FlagCard with confidence and precedent
- **Branch:** `c/flag-card`
- **Goal:** Hyphenate's exception card: seen sentence, sources, `rule: certain` or `72%`, `no precedent` or the rule link, route, affects.
- **Priority:** P0. Serves Hyphenate 2 and 4.
- **Files:** `apps/web/components/FlagCard.tsx`, `ConfidenceBadge.tsx`, `PrecedentBadge.tsx`, `SourceChip.tsx`.
- **Depends on:** B-02. Safe to start: fixture flags.
- **Steps:** map `checkId` to a plain title (table in `apps/web/lib/checks.ts`, copied from shared context section 9 names); `confidence === "certain"` → slate chip "rule: certain"; number → percent chip, amber under 0.85; `precedent` null or note "no precedent" → outlined chip; else link to `/rules#R-id`; `affects.dollarsCents` shown only when `viewerRole === "owner"`.
- **Acceptance:** three fixture flags render the three badge variants; the manager role never renders a dollar figure (unit test on the component with `viewerRole: "manager"`).
- **Verify:** `bun test apps/web` (Vitest + React Testing Library) and visual check.
- **Time:** 60 min. **Fallback:** text instead of chips.

### C-06 Problem detail and ApprovalSheet
- **Branch:** `c/flag-detail`
- **Goal:** One flag, fully explained, with the exact text to be sent and approve / edit / deny.
- **Priority:** P0. Serves "knowing when to ask", "clean record of its work".
- **Files:** `apps/web/app/c/[companyId]/flags/[flagId]/page.tsx`, `apps/web/components/ApprovalSheet.tsx`, `FlagTimeline.tsx`.
- **Depends on:** B-02; `questions.approve/edit/deny`. Safe to start: fixtures.
- **Steps:** `flags.get` → expanded `FlagCard`; where-list with record ids and deep links (Jobber `https://secure.getjobber.com/...` only if B stores `url`; else id text); `FlagTimeline` from `audit.list({refs.flagId})` with agent chips; `ApprovalSheet` shows the `Question.text`, options, recipient role, `kind` (poll or text), an Edit textarea (≤ 240 chars, counter, `$` blocked), Approve and send / Deny; after approve the sheet shows `sent` then the reply and `Interpretation.result` in plain words; `Mark fixed in Jobber` sets a flag note and shows "will re-check on next sync".
- **Acceptance:** approving from the sheet produces a `Question.status = "approved"` and (with the courier running) a text on the phone; editing to 241 chars is blocked; denying stores `denied` with the user id.
- **Verify:** `bun dev` end to end with C-02 running.
- **Time:** 2 h. **Fallback:** approve only, no edit.

### C-07 Manager inbox
- **Branch:** `c/manager-inbox`
- **Goal:** The manager sees their crew's problems and approves each employee message. No pay.
- **Priority:** P0 (login itself is P1 and cut-order item 5; the role switch stands in).
- **Files:** `apps/web/app/c/[companyId]/manager/page.tsx`, `apps/web/components/RoleSwitch.tsx`.
- **Depends on:** B-02 `flags.list({routeTo: "manager"})`. Safe to start: fixtures.
- **Steps:** role switch in the header (Owner / Manager) stored in a cookie; manager view filters flags by `routeTo: "manager"` and, if `Worker.managerId` is present, by crew; cards use `viewerRole="manager"`; `ApprovalSheet` approves employee messages; replies show in a per-worker thread.
- **Acceptance:** no dollar amount anywhere in the DOM in manager mode (Playwright assertion: no `/\$\d/` text); approving a message works.
- **Verify:** `bunx playwright test e2e/smoke -g manager`.
- **Time:** 75 min. **Fallback:** a filter on the owner home.

### C-08 CorrectionDiff and corrections flow
- **Branch:** `c/corrections`
- **Goal:** Before → after → effect, approve or reject; the workbook is the only thing that changes.
- **Priority:** P0. Serves "fixed in the workbook, never the source" and Hyphenate 5 (explainable).
- **Files:** `apps/web/components/CorrectionDiff.tsx`, changes to the problem detail page.
- **Depends on:** B-02 `corrections.approve/reject`. Safe to start: fixtures.
- **Steps:** render `target` (table, field) in words ("Time entry te_0014 → job"), `before`, `after`, `effectPayCents` (owner only), `effectProfitCents`; `source` chip (reply / owner / rule); Approve → `corrections.approve`; after approval show "applied to workbook v{n}" from `Draft.workbookVersion`.
- **Acceptance:** approving a fixture correction increments the workbook version shown on `/workbook` within 1 s.
- **Verify:** `bun dev`.
- **Time:** 60 min. **Fallback:** none.

### C-09 Workbook, readiness and the Gusto draft button
- **Branch:** `c/workbook`
- **Goal:** Stage 1 and Stage 2 workbooks to the cent, readiness report with measured numbers, Gate 1 approval, Fill Gusto draft, download.
- **Priority:** P0 (Stage 2 rows P0 as a report; off-cycle fill button P1).
- **Files:** `apps/web/app/c/[companyId]/workbook/page.tsx`, `apps/web/components/WorkbookTable.tsx`, `ReadinessReport.tsx`, `GateButton.tsx`, `apps/web/app/api/workbook.csv/route.ts`.
- **Depends on:** B-02 `drafts.*`, `eval.summary`; A's `Draft.lines` (A-10). Safe to start: fixture draft.
- **Steps:** tabs Stage 1 / Stage 2 / Reconciliation; per-worker rows (hours, OT, rate, gross; `heldFlagIds` as amber chips; Venmo list separate; `excluded` rows greyed); readiness: `Counts`, dollars changed (sum of approved `effectPayCents`), "Questions this cycle vs last", Gusto draft status (`computed` → `approved` → `filled` → `calculated`) with the static line "Draft only. PayrollPilot never submits payroll."; `Approve Gate 1` (owner, confirmation dialog) → `drafts.approveGate` → `Fill Gusto draft` → `drafts.fillGusto` → spinner → status `calculated` and Gusto totals; every metric line says "measured on Company A, cycle N, {time}" from `eval.summary.measuredAt`; CSV download of the lines.
- **Acceptance:** Gate 1 then Fill produces `status: "calculated"` against the Gusto demo (or the labelled mock); totals shown equal the sum of lines; CSV opens in Numbers/Excel.
- **Verify:** `bun dev`; `curl localhost:3000/api/workbook.csv?cycleId=…`.
- **Time:** 2.5 h. **Fallback:** hide Stage 2 tab; CSV cut.

### C-10 Audit log
- **Branch:** `c/audit`
- **Goal:** Every number traces back; agent hand-offs visible.
- **Priority:** P0. Serves Hyphenate "clean record of its work".
- **Files:** `apps/web/app/c/[companyId]/audit/page.tsx`, `apps/web/components/AuditRow.tsx`.
- **Depends on:** B-02 `audit.list`. Safe to start: fixtures.
- **Steps:** table with time, actor chip (`analyst` / `auditor` / `messenger` / `controller` / user), type, summary, refs as links; filters by type prefix (`sync.`, `check.`, `message.`, `correction.`, `rule.`, `draft.`, `demo.`) and by cycle; search box over summary; "Simulated" badge when `data.simulated`.
- **Acceptance:** after the G2 loop, the log shows sync → check → question → approve → sent → inbound → interpreted → correction → approved → workbook → draft in order with actors.
- **Verify:** `bun dev`.
- **Time:** 60 min. **Fallback:** unfiltered list.

### C-11 Demo mode: timers, reset, simulated manager
- **Branch:** `c/demo-mode`
- **Goal:** Two-minute reminders, a 10-second reset to cycle 1 or 2, and a labelled Claude persona that plays the manager when no human is on the phone.
- **Priority:** P0. Serves the judge scenario and the fallbacks.
- **Files:** `apps/web/convex/demo.ts`, `apps/web/app/c/[companyId]/demo/page.tsx`, `apps/web/components/DemoPanel.tsx`.
- **Depends on:** B's controller (B-11) for `reset` semantics and the Messenger prompt location; B reviews the PR. Safe to start: the panel UI and the `DEMO_MODE` plumbing.
- **Steps:** `demo.reset({companyId, toCycle})`: B-provided snapshot restore (B stores snapshots `data/fixtures/a/snapshot-cycle1.json`, `snapshot-cycle2.json`; the mutation deletes the company's rows and reinserts them; must finish in < 10 s on Company A's size); `demo.simulatedReply({questionId, persona, scenario?})`: a `"use node"` action that calls Haiku 5.5 with the question text and a short persona prompt ("You are the crew manager. Answer with one of the numbered options or one short sentence; if the scenario says you don't know, say so."), writes an inbound `Message` with `data.simulated = true` and the audit event `demo.simulated_reply`, then hands off to B's normal interpretation path; judge scenario entry: free text ("A worker's gross doubled this cycle; every entry has a job") → `demo.scenario` creates the needed fixture rows (B supplies three canned scenario builders: gross jump → CHK-22; unknown expense category → CHK-17 "no precedent"; two sources disagree on a rate → CHK-10) and runs `checks.run`; timers: `DEMO_MODE=1` makes `remindAt = sentAt + 2 min`.
- **Acceptance:** reset to cycle 1 then to cycle 2 each under 10 s with the owner home correct after each; a simulated reply shows the Simulated badge in the feed, the problem timeline and the audit log; each of the three scenarios produces its flag with "no precedent" where applicable within 15 s.
- **Verify:** `bun dev` with `DEMO_MODE=1`; stopwatch.
- **Time:** 2 h (1 h C, 1 h B pairing). **Fallback:** reset = re-run the seed loader; scenarios = pre-built flags toggled visible.

### C-12 Onboarding screen
- **Branch:** `c/onboarding`
- **Goal:** Proposed rules with evidence; accept / edit / reject; "What did we miss?"; owner-entered rules with restatement.
- **Priority:** P0 (cut-order item 8 reduces it to a report card on the owner home).
- **Files:** `apps/web/app/c/[companyId]/onboarding/page.tsx`, `apps/web/components/ProposedRuleCard.tsx`, `PlainWordsRuleBox.tsx`.
- **Depends on:** B-13 Analyst (`onboarding.run`, `rules.stateInPlainWords`). Safe to start: fixture proposed rules.
- **Steps:** "Run onboarding" button (owner) → progress from `audit.list({type: "onboarding.*"})`; each proposed rule: plain words, type chip, evidence list ("seen in 4 of 4 cycles", record ids), backtest, Accept / Edit (params form by type) / Reject; "What did we miss?" list from `onboarding.questions` with an answer box → `rules.stateInPlainWords`; owner-entered rule box: text → restatement card labelled "stated by owner, not seen in history" with backtest → Confirm.
- **Acceptance:** on Company A fixtures, ≥ 5 proposed rules render with evidence; accepting one moves it to `/rules` as active with `approvedBy` set; the plain-words flow round-trips once.
- **Verify:** `bun dev`.
- **Time:** 2 h. **Fallback:** report card only.

### C-13 Rules screen
- **Branch:** `c/rules`
- **Goal:** Every rule, its provenance, backtest, on/off, undo.
- **Priority:** P0. Serves "Improves" and separation of duties on screen.
- **Files:** `apps/web/app/c/[companyId]/rules/page.tsx`, `apps/web/components/RuleCard.tsx`.
- **Depends on:** B-14 lessons and rules. Safe to start: fixtures.
- **Steps:** grouped by `type`; `RuleCard`: words, status chip, source chip (history / owner stated / answer), provenance line "answered by {role} on {date}; approved by {role} on {date}" (roles, not names, in the demo), backtest "agrees in 7 of 8 cycles", toggle on/off, Undo (reverts to the previous version: B exposes `rules.toggle` and keeps history in audit events); a "Conflicts" section listing lessons with `status: "conflict"` and a link to the flag that escalated it.
- **Acceptance:** toggling writes an audit event; a conflict lesson appears when B's classifier produces one from a fixture.
- **Verify:** `bun dev`.
- **Time:** 75 min. **Fallback:** list without grouping.

### C-14 E2E smoke test
- **Branch:** `c/e2e`
- **Goal:** Catch a broken demo before judging.
- **Priority:** P1 (P0 after G2).
- **Files:** `e2e/smoke.spec.ts`, `playwright.config.ts`, CI job (B owns `ci.yml`; C adds the step by PR).
- **Depends on:** C-04 to C-10.
- **Steps:** desktop 1280×800: owner home renders a stage tracker and ≥ 1 needs-you card; open a flag; approval sheet shows text under 240 chars; manager page has no `/\$\d/`; workbook shows "never submits"; audit page lists ≥ 10 rows.
- **Acceptance:** green locally against the dev deployment at cycle 1.
- **Verify:** `bunx playwright test e2e/smoke`.
- **Time:** 45 min. **Fallback:** manual checklist in `docs/DEMO.md`.

### C-15 Video takes and cut
- **Branch:** `c/video` (only `docs/DEMO.md` and `docs/video/` notes; the video file is uploaded, not committed)
- **Goal:** A video under 3 minutes that opens on the moment.
- **Priority:** P0.
- **Depends on:** G3; the moment decided by Sun 00:00 (real run or labelled fallback).
- **Steps:** section 8.1 shot list; record raw takes 23:00 to 02:00; cut 04:00 to 06:30; export 1080p; upload to YouTube (unlisted) and keep an MP4 on a phone and the laptop.
- **Acceptance:** plays from the Devpost link on a phone; labels visible; under 3:00.
- **Time:** 4 h total. **Fallback:** screen recording with voice-over, no cuts.

### C-16 Devpost, README, image, submission
- **Branch:** `c/submission`
- **Goal:** Everything the judges read before they see us.
- **Priority:** P0.
- **Files:** `README.md`, `docs/PROOF.md` (with A), `docs/DEMO.md`, `docs/devpost.md` (the text, kept in the repo).
- **Steps:** section 8.4 skeleton; draft submitted Sat 23:00; final text Sun 08:00 to 08:40; image (section 8.5); teammates added; MLH opt-ins ticked; Commit Fellowship supplemental form.
- **Acceptance:** submission confirmed on two devices by 08:40.
- **Time:** 2 h spread.

**If behind:** cut in this order: C-14 → C-12 (to a report card) → polls in C-02 (numbered text) → C-07 (filter on home) → C-13 grouping. Never cut C-02, C-04, C-06, C-09, C-11, C-15, C-16.

---

## 8. Demo kit

### 8.1 Video (under 3:00; opens on the moment)

Recording: C records the screen (QuickTime, 1280×800 browser window, 2× scale) with Shanin's voice-over recorded separately on a phone in a quiet corner; the phone receiving the text is filmed with a second phone or shown via QuickTime iPhone mirroring. Cut in iMovie or CapCut. Captions burned in for the labels.

| Time | Shot | Voice (Shanin) | On-screen label |
|---|---|---|---|
| 0:00 to 0:20 | **The moment.** Owner home, Company R (or A fallback). A FlagCard: "Two entries overlap on Thu: 7:30 to 15:30 on Job 118 and 12:00 to 16:00 on Job 121. rule: certain. precedent: cycle 2, same worker." The text goes out; the phone lights up; the reply "1" lands; the correction appears: before 12.5 h, after 8 h; held hours released. | "Last Friday this was in my payroll. PayrollPilot caught it before the Gusto draft, asked my manager one question, and fixed the workbook, not Jobber." | `real, anonymized` (or `synthetic` fallback) |
| 0:20 to 0:35 | Title card + seats line. | "PayrollPilot takes the seat of the person who checks payroll inputs before anyone hits submit. Payroll software does the math right; it assumes the inputs are right. In service businesses they aren't." | |
| 0:35 to 1:00 | **Learns.** Onboarding screen: rules proposed from four past cycles with evidence; "What did we miss?" with two questions; the owner types a Venmo rate rule in plain words, PayrollPilot restates it. | "It reads my past cycles in Jobber, QuickBooks and Gusto and proposes my rules with the records behind them. What it can't work out, it asks." | `Learns` |
| 1:00 to 1:30 | **Runs.** Stage tracker moving: syncing with completeness checks (pulled 58 of 58), checking, flags appear live: hours with no job, open timer, QuickBooks purchase with no job, rate mismatch; counts. | "Every cycle it syncs all three systems, proves the pull is complete, runs the checks, and holds only the items it can't settle." | `Runs`, `synthetic` |
| 1:30 to 2:05 | **Escalates.** Approval sheet with the exact text; approve; phone receives the poll; manager taps 2; interpretation in plain words; correction diff; approve; workbook version ticks; Gate 1; Fill Gusto draft → `calculated`; "Draft only. PayrollPilot never submits." | "It asks the right person one question, by text, with a confidence and a precedent. A human approves every message and every correction. Then it fills the Gusto draft. I submit." | `Escalates` |
| 2:05 to 2:35 | **Improves.** Rules screen: the manager's answer became a lesson, backtested over 4 cycles, approved by the owner, now a rule. Owner home at cycle 2: "Questions this cycle: 6 (last cycle: 14)". | "Every answer becomes a lesson. It's compared with what it already knows, backtested, and only becomes a rule when I approve it. Cycle two asked less than half the questions." | `Improves` |
| 2:35 to 2:55 | **Proof.** Readiness report: precision 100% on 22 planted errors, recall N%; learned rules vs the owner's runbook: N of M; backtest to the cent on the real company's past cycle; audit log scrolling. | "Planted errors with an answer key. Learned rules graded against my own payroll runbook, which it never saw. And the real company's past cycle, matched to the cent." | `measured …` |
| 2:55 to 3:00 | End card: name, seats line, repo. | "PayrollPilot." | |

Fallback moment: if the real-company live run is not ready by Sun 00:00, shoot 0:00 to 0:20 on Company A's planted overlap with the label `synthetic, planted error #4`; the voice-over changes to "This is the error that was in my real payroll last week, planted here with an answer key."

### 8.2 Live demo (3 minutes + 2 minutes of questions)

Setup before the judge arrives: Company A at cycle 2 restored (`demo.reset`), one approved-but-unsent question ready, courier running, phone unlocked on the table, video open in a tab as backup, `DEMO_MODE=1`.

| Time | Driver | Action | Line |
|---|---|---|---|
| 0:00 | Shanin | one line | "I run a 15-person landscaping company. PayrollPilot fills the seat of the person who checks payroll inputs before submit. Everything you'll see is a real sandbox, labelled synthetic or real." |
| 0:15 | C | owner home, stage tracker, counts | "Cycle two. Six items need a human; the rest went through." |
| 0:35 | C | open a flag; show confidence and precedent; approval sheet | "Rule: certain. Precedent: cycle one, same pattern. Here's the exact text. I approve." |
| 0:50 | Shanin | phone | the text arrives; Shanin replies with the poll option; the feed updates |
| 1:10 | C | correction diff; approve; workbook version; Gate 1; Fill Gusto draft | "Before, after, effect on pay. Approved. The Gusto draft fills. It never submits." |
| 1:40 | C | rules screen | "The answer became a lesson, backtested over four cycles, and I approved it. That's why cycle two asked six questions instead of fourteen." |
| 2:00 | Devaj | demo panel: judge scenario | "Give us a situation." Enter it; the flag appears with "no precedent" and escalates to the owner, or CHK-22 fires. "It doesn't guess. It asks." |
| 2:35 | C | readiness report numbers; audit log | "Precision 100% on the planted errors; N of M rules match my runbook; the real past cycle matches to the cent." |
| 2:55 | Shanin | close | "Same engine, more rules, more people to ask. We'd hire it." |

Likely questions and who answers: "What's real?" (Shanin: the three sandboxes are real products; Company A is synthetic with an answer key; Company R is my real data anonymized). "What if the manager lies?" (Devaj: the owner approves every correction; the 25% catch-all; contradictions between a reply and history escalate). "Why not let it submit?" (Shanin: segregation of duties; the owner is accountable). "How does it learn?" (Devaj: lesson, classifier, backtest, owner approval; low-risk changes auto-apply and are logged). "Cost?" (Devaj: token cost per cycle from the audit log).

### 8.3 Judge-scenario script

1. Ask the judge for a situation in one sentence. Repeat it back.
2. Devaj types it into the demo panel scenario box and picks the nearest builder: gross jump (CHK-22), unknown expense category (CHK-17), rate disagreement between systems (CHK-10), or "free text" (Auditor classifies it as unknown → flag with `no precedent`, `routeTo: owner`).
3. Show the flag card: confidence, "no precedent", route to owner, held item only.
4. If the judge wants to see the ask: approve the question; the text goes to the phone; if the room has no signal, `demo.simulatedReply` with the Simulated badge, said out loud: "That reply is simulated; the model is playing the manager, which Hyphenate's brief allows."
5. Show the audit log row for everything that just happened.

### 8.4 Devpost text skeleton (`docs/devpost.md`)

- **Title:** PayrollPilot. **Tagline:** It checks the pay before the paycheck.
- **Seats:** "PayrollPilot fills the seat of the person who prepares and checks payroll before it is submitted, and the half-seat of the job manager who answers 'whose hours are these?' every other Friday."
- **Inspiration:** Shanin's company; the problem register of 125 real problems over three pay periods (counts only, no rows); the Gusto–Jobber sync gap (quote the help-center line).
- **What it does:** the four pillars in Hyphenate's words: Learns, Runs, Escalates, Improves, one paragraph each.
- **How we built it:** Convex + Next.js + a Bun courier; Jobber GraphQL, QuickBooks sandbox API, Gusto demo API; deterministic engine with 22 checks; three Claude agents (Analyst, Auditor, Messenger) returning validated schemas; lessons table with vector search and a classifier; Photon for texts.
- **What's real, what's simulated, how we know (`docs/PROOF.md`):** real: the three sandboxes, the texts, the real company's anonymized past cycles. Simulated: Company A and B's people and jobs (synthetic, seeded, answer key); any reply marked Simulated. How we know: M1 to M6 with the numbers and the time measured.
- **Challenges:** inbound replies carry no thread id; completeness checks; separation of duties in a 33-hour build.
- **What we learned / what's next:** real Gusto production approval; manager login; a second real company.
- **Microsoft paragraph (path to production):** who the customer is (owners and bookkeepers of 10 to 500-worker service companies), measurable usefulness (questions per cycle, dollars changed, hours of checking replaced, measured), prototype to production (OAuth per company, Gusto partner approval, SOC 2 scope: read-only sources, draft-only writes, audit log, retention), responsible design (no PII beyond ids, segregation of duties, precision over recall, STOP), end-to-end functionality (the live loop).
- **Anthropic paragraph (where Claude could go wrong):** community: owners of small service companies who run their own payroll. Where Claude could go wrong for them: misreading a terse reply ("03") as an answer → we require a schema, a confidence and a follow-up; proposing a rule from a coincidence → backtests and owner approval; following instructions inside data → data is never instructions, enforced in code; leaking pay → ids only, no amounts in texts. Claude does what matters: rule extraction from history, fuzzy matching, question drafting, reply interpretation; code does the money.
- **MLH:** opt in to Best Use of Gen AI and Commit Fellowship (fill the supplemental form); Backboard only if B-18's mirror shipped.
- **Convex:** one paragraph on scheduler, live queries, vector search, HTTP actions in this build.
- **Links:** repo, video, live URL.

### 8.5 Project image
1280×720 PNG: the owner home at cycle 2 with one FlagCard showing "rule: certain" and "precedent", the phone with the text overlaid bottom-right, the label chips visible, the title "PayrollPilot" top-left. Fake names only. Export from the real UI, not a mockup.

### 8.6 README outline
Title and seats line → 60-second demo video link → What's real, what's simulated, how we know (link `docs/PROOF.md`) → The four pillars → Architecture diagram (one image) → Checks catalogue (link) → Safety and privacy (the rules list) → Running it locally → Sponsor notes (Convex, Anthropic, Photon; Backboard/Apify if present) → Team.

### 8.7 Rehearsals
- Rehearsal 0 (Sat 23:30): walk the live script on the real build once; note every stall.
- Rehearsal 1 (Sun 06:00): timed, full script, with the phone; fix timing in `docs/DEMO.md`.
- Rehearsal 2 (Sun 08:20): at the venue, on venue Wi-Fi and phone signal; decide live vs simulated reply for the room.

### 8.8 Submission checklist (C owns)
- [ ] Devpost draft submitted Sat 23:00 with placeholder video.
- [ ] Teammates added on Devpost.
- [ ] Image uploaded (8.5).
- [ ] Repo link public or judges granted access per the organizers' instructions; `data/private/` absent; no `.env`.
- [ ] Video link opens on a phone (tested on cellular).
- [ ] MLH categories opted in; Commit Fellowship form submitted.
- [ ] Hyphenate track selected; the four-pillar text present.
- [ ] Final text pasted from `docs/devpost.md` by 08:30.
- [ ] Submit by **08:40**; confirmation screen photographed; checked on a second device.

---

## 9. Risks and fallbacks

| Risk | Signal | Fallback |
|---|---|---|
| Phone network fails at judging | text not delivered in 10 s | `demo.simulatedReply` with the Simulated badge, said out loud; the video shows the real round trip |
| Photon rejects the recipient | "Target not allowed for this project" | register the phone in Dashboard → Users (2 min); meanwhile simulated |
| Gusto demo API down or not activated | `drafts.fillGusto` errors | B's mock returns the documented shapes; UI shows `Gusto: simulated` chip; say so |
| Convex dev deployment slow or down | queries hang | Plan B is too late by Sunday; instead run `bunx convex dev` locally (local deployment) and point `NEXT_PUBLIC_CONVEX_URL` at it (**UNVERIFIED**: confirm Convex local deployments during H5) |
| Reset breaks state mid-demo | owner home empty | second laptop with the same build at cycle 2 (Devaj's), courier moved there |
| Judge scenario doesn't map to a builder | free text | Auditor "unknown case" path always yields a `no precedent` flag; if the model call fails, a pre-built unknown flag is toggled visible and labelled |
| Video upload fails | YouTube processing | MP4 on the laptop and a phone; Devpost allows a file upload (**UNVERIFIED** size limit) |
| Real-company run not ready | Sun 00:00 | fallback moment (8.1), labelled synthetic |
| Private data on screen | any real name | the anonymizer is upstream (A); C adds a Playwright check that no string from `data/private/denylist.txt` appears (file never committed; the check is skipped when absent) |
