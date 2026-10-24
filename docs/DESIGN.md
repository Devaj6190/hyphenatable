# Payroll Input Agent: Cal Hacks 13.0 design

Primary track: Hyphenate, "The Hyphenated Enterprise". Stacks: Anthropic, Microsoft "Built for the Real World", CRS Credit, Capital One Nessie.

## 1. The sharpened idea

**Seat line (required deliverable):**
> Fills the *payroll input specialist* and *pre-run payroll auditor* seats. Before every pay run it reconciles HR, time, benefits and bank data, gets each exception fixed by the person who owns it, and hands the payroll manager a verified input file. It never approves, edits a source system, or pays anyone.

**Company:** *Bayview Health* (fictional). A 1,200-person regional hospital network with 3 sites in 2 states and biweekly pay. Hourly nurses with shift differentials, per-diem staff, and travel nurses. Hospital payroll is the messy kind: overtime, punch errors, mid-period rate changes and frequent terminations.

### Pushback on the original pitch

| Original claim | Problem | Change |
|---|---|---|
| Fills a seat Hyphenate doesn't automate | Hyphenate's own track doc lists **Payroll** as a sample workflow, so the function isn't new to them. | Novelty comes from the approach: (1) the agent gets the error **fixed in the system of record and re-syncs to confirm**, instead of patching the payroll file; (2) it reasons about which source to trust when sources conflict; (3) it catches pay-diversion fraud; (4) what it learns becomes **standing policies that a controller must approve**. |
| "My real payroll info as proof it works on messy real data" | One person's paystubs say nothing about a 1,200-person company. They also carry SSN, bank and salary data, a privacy risk on stage and on Devpost. Hyphenate asks for proof such as "planted errors with an answer key". | Proof = a seeded generator with planted errors, an answer key, and a precision/recall score on any seed, including the judges' own scenario. Your real paystubs only **calibrate the generator** (deduction lines, tax structure, formats), with fake identifiers, and never appear on screen. |
| Syncs every system by API or browser | Unbounded. Browser automation eats hackathon hours. | 4 sources: HR (API), Time (paginated API), Benefits portal (browser, Playwright), Bank (Nessie, a real sandbox API). |
| Learns patterns so it asks less | An opaque learned model is unhireable: auditors can't review it. | The pattern miner proposes an explicit rule, e.g. "ER charge-nurse OT up to 24h approved by the ER Director, 3 of 3 times." The controller approves it, it has scope and expiry, and every auto-resolve cites it. |
| Sync is complete and consistent | Vague. | Concrete checks: row counts against HR headcount, pagination totals, as-of timestamps, schema, and snapshot hashes. A partial sync is the "recovers from failure" moment. |

### The moment (the demo video opens with this)
> Run 1. Nurse **D. Okafor** was terminated in HR on Oct 15. The time system still shows 32 hours for Oct 16–20, and the **bank account was changed 2 days before termination**. Payroll would pay $2,840 to a new account.
> The agent holds that one line, not the whole run. It explains that HR is the system of record for employment status, so the timesheet hours are the anomaly. It runs a CRS identity/fraud check on the account change and asks the HR business partner (HRBP) and the unit manager. A judge then asks the agent, "Why didn't you just pay her?", and it defends the hold with cited evidence.

That one scenario hits three of Hyphenate's "moment" types:
- it catches what others missed (three systems, each fine on its own);
- it defends a decision;
- the partial-sync recovery earlier in the same run covers "recovers from a failure".

## 2. Components

| Component | Responsibility | Built with |
|---|---|---|
| **Mock source systems** | HR (Workday-like REST: employees, status, rates, org chart, effective dates). Time (Kronos-like REST, paginated, with injectable partial-page failure). Benefits portal (HTML only: login plus a deductions table). All seeded from one generator. | FastAPI routers on the same server, Faker, a seed script |
| **Bank** | Nessie sandbox: an account per employee, checking that the account on file exists. Stretch: post payouts from the approved file. | Capital One Nessie API (real) |
| **Identity / fraud** | CRS sandbox check on any bank-account change within N days of a status change, and on new hires. | CRS API (real, test identities only) |
| **Connectors** | Pull each source into a timestamped, hashed snapshot. Retry with backoff. Mark a source stale if still incomplete. | httpx, Playwright (benefits) |
| **Completeness checker** | Counts, pagination totals, as-of dates, schema, cross-source headcount. | Python |
| **Joiner** | Builds a unified `employee × pay period` record. Explicit ID map plus fuzzy name match, flagged when unsure. | Python |
| **Rules engine** | **Deterministic** checks produce exceptions `{rule_id, severity (block/warn), evidence[], sources[], trusted_source, why}`. Claude never decides pay. | Python; one function per rule |
| **Policy memory** | Controller-approved standing policies `{pattern, resolution, scope, approved_by, expires}`. Matched before routing. | SQLite table |
| **Pattern miner** | After each run, finds repeated (rule, scope, approver, resolution) groups (3 or more) and **proposes** a policy. | SQL group-by, with Claude writing the proposal text |
| **Router / agent** | Finds the exception's owner (rule type plus the HR org chart). Claude drafts the ask with evidence. Reminders and an escalation chain before the payroll cutoff. | Claude Sonnet 5.5 |
| **Reply parser** | Turns a free-text or button reply into a structured decision. Low confidence makes it ask back. | Claude Haiku 5.5 |
| **SoD guard** | Approver ≠ subject employee, approver has authority for that rule, and only the controller approves policies. Enforced in code, not by the LLM. | Python |
| **Interrogation** | "Why did you hold X?": answers only from the audit log and evidence, with citations. | Claude Opus 5.5 |
| **Audit log** | Append-only, **hash-chained**. Records every snapshot, rule hit, message, reply, approver, decision and policy use. Has a verify-chain endpoint. | SQLite |
| **Output** | Verified payroll input CSV (ADP/Workday import shape), held-lines list, exception report, and a diff against the last run. The payroll manager gives final sign-off. | Python |
| **Web app** | Run dashboard (per-source sync status), exceptions board, exception detail (sources side by side, trust reasoning, trail), **persona inbox** (HRBP / manager / benefits admin / payroll manager / controller), policies, audit log, **scenario injector**, a "+24h" simulated clock, and a score page. | Vite + React + Tailwind |

**Access model:**
- The agent service account is read-only on HR, Time, Benefits and Bank.
- It writes only to its own staging tables, outbox and audit log.
- Fixes happen at the source: the owner's "Fix" button edits the mock system of record, standing in for fixing it in Workday. The agent then re-syncs and re-verifies.
- The only things that bypass a source fix: (a) a **hold** on one line, (b) the payroll manager's documented override.

## 3. One pay run, end to end

1. **Trigger.** A schedule fires at T-3 days before the pay date; the demo uses a "Run now" button. The run opens and is logged.
2. **Sync.** Connectors pull HR, Time (paginated), Benefits (Playwright) and Bank (Nessie) into hashed snapshots.
3. **Completeness.** Time returns 487 of 512 active hourly staff. The agent retries; if still short, it marks those 25 employees stale and raises a blocking exception (recovery).
4. **Join.** Builds the unified per-employee records and flags ambiguous identity matches.
5. **Validate.** Runs the rules engine, producing exceptions with evidence and a trusted source.
6. **Policy check.** Exceptions that match an approved policy are auto-resolved and logged with the policy ID.
7. **Route.** Each remaining exception goes to its owner with Claude-drafted evidence. Higher risk triggers a CRS check first.
8. **Reply.** The approver acts: fixes the source, approves an exception, or holds. The reply parser structures the answer and the SoD guard checks the approver. No reply by the deadline escalates to the next approver; still no reply holds the line, not the run.
9. **Re-sync and re-validate** the affected employees and close the exception.
10. **Gate.** Once there are 0 open blocking exceptions, the agent builds the verified CSV, held list and report. The **payroll manager signs off.**
11. **Learn.** The pattern miner proposes policies; the controller approves or rejects them.
12. **Run 2** (next period). Fewer asks. The agent also checks that last run's promised retro pay was actually carried forward, so time matters.

## 4. Planted exceptions (answer key)

**Run 1:**
1. Terminated, still paid, hours after the termination date, and a bank change just before it. **Moment.** CRS check, then HRBP and manager. Block, hold the line.
2. Time API pagination failure leaves 25 employees missing. Recover or mark stale. Block.
3. 92 hours in one week caused by a duplicate punch import. Manager. Block.
4. Rate raise effective mid-period: HR and the payroll master disagree. HR's effective-dated record is trusted. HRBP. Block.
5. Benefits deduction is for a family plan; a life event changed it to single. Benefits admin. Warn.
6. Rehire created a second employee ID (same SSN hash). HR ops. Block.
7. Invalid ABA routing number (checksum). Employee via HR. Block.
8. Employee on leave of absence with timesheet hours. Manager. Block.
9. ER charge nurses' overtime of 20–24 hours, three separate times. ER Director approves each time, which seeds a policy proposal. Warn.

**Run 2:**
- #9 is auto-resolved by the approved policy.
- The retro pay from #4 is missing; the agent flags it.
- Plus one new planted error.

Mixed in: about 30 clean but noisy records (name variants, date formats, rounding) that must **not** be flagged. This keeps precision honest.

**Score page:** detections vs. answer key, giving precision, recall, asks per run (run 1 → run 2) and time to verified file. Any seed works; the judges' scenario = the injector plus re-run.

## 5. Tech stack (36h, ≤4 people)

- **Backend:**
  - Python 3.12, FastAPI, SQLite.
  - The mock systems are routers in the same app; one process is the whole demo.
  - Playwright for the benefits connector.
  - APScheduler for the T-3 trigger (stretch; the button is enough).
- **LLM:**
  - Anthropic Python SDK with tool use for structured output.
  - `claude-sonnet-5-5` for routing and drafting, `claude-haiku-5-5` for reply parsing, `claude-opus-5-5` for interrogation.
  - Prompts get evidence JSON only, never raw SSN or bank numbers; those are tokenized before any LLM call.
- **Frontend:** Vite, React, Tailwind. The app polls `/run/{id}` every 2s; no websockets needed.
- **Sponsor APIs:** Nessie (bank), CRS sandbox (identity/fraud).
- **Run locally for judging.** Venue Wi-Fi is the risk, so keep a recorded fallback, and cache Nessie/CRS responses with a visible "cached" badge if the network dies.

## 6. Real vs. simulated (required deliverable)

| Item | Real | Simulated | How we know |
|---|---|---|---|
| Employees, HR, Time, Benefits data | Structure calibrated from real paystubs and public Workday/ADP formats | All records and identities (Faker plus seed) | Generator is in the repo; same seed gives the same company |
| Errors | Error types are common in real payroll | Planted by the generator | Answer key plus precision/recall on the score page |
| Bank | Nessie API calls are live | Money is mock | Request log shown in the UI |
| Identity/fraud | CRS sandbox calls are live | CRS test identities | Raw response shown in exception detail |
| Browser sync | Real Playwright run against an HTML portal | Portal is our own mock | Headed browser visible in the demo |
| Approvers | Judges can act as any approver live | Otherwise Claude plays the approver (the track allows this) | Inbox shows who acted, human or model |
| Clock | n/a | "+24h" button for SLA and escalation | Timestamps in the audit log |
| Payroll calculation | n/a, out of scope by design | n/a | ADP/Workday do the math; we verify inputs |

## 7. MVP vs. stretch

**MVP (must work by Sat 10 PM):**
- Generator and answer key.
- HR + Time API connectors with the pagination failure.
- Benefits Playwright connector.
- Nessie account check.
- Rules for exceptions #1–#9.
- Persona inbox with a source "Fix" button, plus re-sync.
- SoD guard.
- Hash-chained audit log.
- Verified CSV and manager sign-off.
- Run 2 with one approved policy.
- Interrogation chat.
- Scenario injector.
- Score page.
- CRS check on exception #1.

**Stretch:**
- Slack bot for approvers.
- APScheduler cron.
- Nessie payout of the approved file.
- Escalation chain beyond one level.
- Deploy (Render).
- A Microsoft angle on Azure (Azure-hosted backend, or Entra-style role names).
- Apify actor for the portal. Skip it unless Playwright is done early; it also conflicts with Bright Data.

**Cut:**
- Real payroll calculation or tax computation.
- Voice (Cartesia: voice wouldn't be core).
- Factory, Fetch.ai, Creao (one-of conflict, and they would replace the Claude core).

## 8. Work split

| Person | Owns | Hand-off contract (agreed by Fri 9 PM) |
|---|---|---|
| **A: Company and sim** | Generator, mock HR/Time/Benefits, planted errors, answer key, injector, "+24h" clock, score page backend | `seed.json` schema; source API shapes |
| **B: Connectors** | HR/Time connectors, Playwright benefits connector, completeness checks, Nessie, CRS, snapshot hashing | `Snapshot{source, rows, as_of, hash, complete}` |
| **C: Agent core** | Joiner, rules, policy memory, pattern miner, router, reply parser, SoD, audit chain, interrogation, output CSV | `Exception{...}`, `Decision{...}`, `/run` API |
| **D: Product and story** | React app (all pages), demo script, demo video (opens with the moment), Devpost, pitch, real-vs-sim table | Consumes the `/run` API; mocks it until C lands |

**Timeline:**
- **Fri:** schemas plus a stub end-to-end by 1 AM.
- **Sat noon:** one exception (#1) fully closed in the UI.
- **Sat 10 PM:** MVP done; feature freeze.
- **Sun 1–6 AM:** demo video, Devpost draft, fallback recording.
- **9 AM:** submit.
- **10:30:** judging.

## 9. Rubric coverage

| Rubric item | Answer |
|---|---|
| **Hyphenate: is it real enough?** | Messy multi-source data, conflicting sources with trust reasoning, live sandbox APIs, answer-key score |
| **Would you hire it? (seats)** | Seat line above |
| **(limited access)** | Read-only on sources, writes only to staging, can't approve, SoD enforced in code |
| **(clean work record)** | Hash-chained audit log with a verify endpoint; every decision cites its data, rule or person |
| **(knows when to ask)** | Deterministic detection; policy match → auto; else ask the owner; ambiguous reply → ask back; deadline → escalate or hold the line |
| **Something new?** | Source-fix-and-reverify loop, pay-diversion catch, controller-approved learned policies, a hospital payroll setting |
| **The moment** | Terminated nurse with a fresh bank change (catch); partial sync (recover); interrogation (defend) |
| **Deliverable: video opens with the moment** | Person D, Sun AM |
| **Deliverable: live demo, judges' scenario** | Scenario injector plus any seed |
| **Deliverable: seat line** | §1 |
| **Deliverable: real vs. simulated proof** | §6 table plus score page |
| **General: impact** | Payroll errors cost money and trust; the fraud catch saves real dollars |
| **General: quality / complexity / creativity** | Multi-source sync, browser plus API, an agent with SoD, cross-period memory |
| **General: 2-min pitch, whole team present, live demo** | Person D owns the script; all 4 at the table 10:30–12:30 |
| **Anthropic: named community** | Payroll specialists at mid-size US hospital networks. **You must talk to one at or before the event** for the "lived or heard firsthand" criterion. |
| **Anthropic: works, one thing done well** | One pay-run loop, done end to end |
| **Anthropic: thoughtful Claude use, where it can fail** | Claude never computes pay or approves; it gets tokenized PII only; ambiguous replies trigger a confirmation; interrogation answers only from the log |
| **Microsoft** | Customer = payroll manager; measurable = exceptions caught, asks per run ↓, time to verified file; path to production = swap mock routers for Workday/ADP/Kronos APIs; responsible = SoD, audit, PII tokenization; end-to-end = run → file |
| **CRS** | Live sandbox fraud check on the moment's bank change (Best Identity/Fraud Innovation). Confirm the right endpoint at the CRS booth. |
| **Nessie** | Bank-of-record account checks (payouts are a stretch goal) |
