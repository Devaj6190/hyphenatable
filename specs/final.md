# Product spec

The team's spec for the Cal Hacks 13.0 Hyphenate track. Built on Oct 24, 2026 from the agreed and resolved items in [conflicts.md](conflicts.md) (Devaj's merge at midnight), then completed at 1:00 AM by the implementation plan, which resolved the 30 items that were still open. Each of those decisions is listed in section 14 with its reason; the team can overrule any of them by editing this file and the plan in one PR. Research behind the decisions: [../docs/plan-research.md](../docs/plan-research.md). The implementation plan: [../docs/plans/](../docs/plans/00-shared-context.md).

Working name: **PayCheck** ("it checks the pay before the paycheck"). Rename freely before the first gate; the code uses no product name.

## 1. Pitch and seats

- **One line on the seats:** PayCheck takes the seat of the person who prepares and checks payroll before it is submitted, and the half-seat of the job manager who answers "whose hours are these?" every other Friday.
- **Proof customer:** a real 15-person landscaping company (Shanin's), run on Jobber, QuickBooks and Gusto, with its real past pay cycles and real errors, anonymized on every screen.
- **Target customer:** service companies with field crews (landscaping, HVAC, plumbing, cleaning, painting) from 10 to 500 field workers, where payroll inputs come from job software and the owner or one bookkeeper checks them by hand. The pitch line: "same engine, more rules, more people to ask." We do not claim enterprise scale this weekend; we show two differently configured companies and one real one.
- **Core insight:** payroll software calculates correctly but assumes the inputs are right. In service businesses they often are not: hours with no job, open timers, double-booked hours, job expenses paid by card or Venmo never added to the job, commissions that depend on who quoted in person, stale rates. Gusto's own Jobber sync covers hourly employees only and overwrites manual hours; salaried, contractor and commission workers are outside it (verified in both help centers).
- Accuracy before speed: **precision over recall.** When unsure, PayCheck asks; it never guesses a number.
- **PayCheck fills Gusto drafts. A person submits payroll. PayCheck never submits** and never calls Gusto's submit endpoint.

## 2. Companies, users and the four pillars

**Companies in the demo**
- **Company A (main):** a 12-person landscaping crew paid biweekly, synthetic, seeded into real Jobber (developer tester account), QuickBooks Online (developer sandbox) and Gusto (demo company), with planted errors drawn from the categories in the real problem register and an answer key.
- **Company B (generalization):** a 30-person HVAC company paid weekly, seeded the same way with different rules (different overtime policy, commission plan, expense categories). Smaller seed; P1.
- **Company R (real):** Shanin's landscaping company. Read-only Jobber API on past cycles, QuickBooks via Excel export, Gusto via export, anonymized at ingest with a private pseudonym map. Used for the backtest and, if time allows, a live run on the current cycle. Never shown with real names.

**Users**
- **Payroll owner:** the main user; approves messages to managers, approves corrections and learned rules, gives the final pay-run approval, and submits in Gusto.
- **Managers:** log in to read the full detail of their crew's problems and to approve each message to an employee before it is sent. In the demo the owner stands in for the manager where no second person is available.
- **Employees:** receive one-question texts after their manager approves them. They never see pay amounts.

**Hyphenate's four pillars, in their words (Learns → Runs → Escalates → Improves)**
1. **Learns (self-learning onboarding):** PayCheck reads the company's past pay cycles (Jobber hours and jobs, QuickBooks expenses, Gusto pay history) and proposes the company's rules: who is paid how, overtime, who answers what, which expenses are job costs, which workers are not in Gusto. Then it asks the owner the questions it could not answer ("What did we miss?").
2. **Runs (autonomous runs):** every cycle it syncs the three systems with completeness checks, runs the checks engine, computes pay to the cent, holds only the affected items, and asks the right person the right question.
3. **Escalates:** every question carries a confidence and a precedent note ("rule: certain" for deterministic hits, a percentage only where there is real uncertainty, "no precedent" when it has never seen the case). Unanswered items stay held. Money and policy go to the owner; job facts go to the job manager.
4. **Improves (self-improvement):** every human answer is evaluated, turned into a lesson, backtested against past cycles, and, if the owner approves it, becomes a rule. Cycle 2 asks fewer questions than cycle 1, and the dashboard shows the count.

## 3. In scope / out of scope

**In: the full payroll cycle, in two stages with two owner gates.**
- **Stage 1, wages:** hours, rates, overtime, Venmo-paid and salaried workers, reimbursable expenses, into the regular Gusto run. **Gate 1:** the owner approves the Stage 1 workbook and PayCheck fills the regular draft.
- **Financial reconciliation:** customer payments and deposits matched to invoices, job expenses matched to jobs (job cost vs. overhead), stale rates found, job profit computed (invoice minus labor minus expenses), low-profit jobs flagged with likely reasons.
- **Stage 2, commissions, tips and the manager split:** computed from the reconciled job profit, into a separate off-cycle Gusto run (Gusto's off-cycle `Bonus` payroll with the fixed compensations Commission, Cash Tips or Paycheck Tips, Bonus). **Gate 2:** the owner approves the Stage 2 workbook and PayCheck fills the off-cycle draft.
- Code computes wages, overtime, commissions, tips and the manager split, checked to the cent, then fills Gusto. Gusto does taxes.
- Stage 2 math and the reconciliation report are P0 because most of the real errors only matter through profit. Filling the off-cycle draft is P1 (same code path as Stage 1 with a different payroll id).

**Out:** tax calculation (Gusto), voice or phone calls, benefits and deductions, bank details, tax forms, medical or leave reasons (never collected), changing anything in Jobber or QuickBooks.

## 4. Data sources and syncing

- Sources: **Jobber** (users, jobs, visits, timesheet entries with approval state and open timers, quotes with salesperson, invoices, payments and deposits, expenses), **QuickBooks Online** (purchases and bills with customer/job tags, accounts, vendors), **Gusto** (employees, jobs and compensations, contractors, pay schedules, unprocessed payrolls, past payrolls).
- **API first:** Jobber GraphQL (version 2026-09-25, read-only app), QuickBooks REST (sandbox for A and B), Gusto demo API. Fallbacks, in order: spreadsheet export (Jobber Timesheets Excel, QuickBooks Export to Excel, Gusto Payroll Journal CSV), then saved Playwright scripts with a logged-in session, then an AI browser tool only to discover steps or recover from a page change. Company R's QuickBooks comes from the Excel export unless Shanin connects the real company.
- **Every read is checked for completeness** before use: records pulled vs. the total the source reports (`totalCount` in Jobber, `count(*)` in QuickBooks, payroll totals in Gusto, and the per-day totals Jobber publishes). A mismatch blocks only what it affects and is shown as a sync problem, never silently passed.
- The demo shows more than one access method (API for the synthetic companies, export for the real one, and a Playwright read of a Jobber report if it is built).
- Jobber webhooks are optional; a scheduled re-sync after an answer proves "fixed at the source, re-checked on the next sync."

## 5. What it catches

Deterministic checks (rule: certain) unless marked fuzzy. Thresholds are per-company rules learned at onboarding or set by the owner.

**Time and people**
- Hours with no job (entry without a job or visit).
- Open timers (`ticking`) and long shifts over the company threshold.
- Overlapping or double-booked entries for the same worker.
- Zero-minute and duplicate entries.
- Unapproved entries at cutoff.
- An active worker with no hours this period; a deactivated or former worker with hours or still active in Gusto.
- A new hire not yet onboarded in Gusto (`onboarded` is false), without reading any personal details.
- A pay rate that differs between Jobber and Gusto; a Venmo worker with no rate on file.
- Workers outside the Jobber-to-Gusto sync (salaried, contractors, commission) handled by our math and listed in the workbook.
- A job with completed visits and no labor recorded (P1).

**Money and jobs**
- A QuickBooks job expense with no matching Jobber job (fuzzy match on date, amount, vendor, description; the model proposes, code decides whether to ask).
- Expenses counted twice (same amount, date, vendor); a Jobber expense and a QuickBooks purchase for the same thing.
- Disposal or sub-jobs not linked to their parent job.
- Job cost vs. overhead sorted before matching (materials, equipment, disposal need a job; subscriptions, insurance, software go to the cycle total).
- Stale rates inflating job profit; a deposit mistaken for a final payment; an invoice unpaid past the cycle.
- The wrong in-person quoter credited for a commission (quote `salesperson` vs. the learned rule for who quoted; fuzzy).
- Low job profit with likely reasons.

**Catch-alls**
- **Gross pay changed more than 25%** vs. the worker's average of the last three cycles, routed to the owner, always, even when every input checks out. This is the net for a judge's own scenario.
- **Repeat problems** from history get extra attention: the flag names the precedent and the rule that came from it.

Every flag records: what was seen, where (system, record id, link), the rule or model call that produced it, confidence, precedent, who should answer, and what it affects (worker, job, dollars).

## 6. Asking people and handling answers

- Managers are paged by a short text ("PayCheck: 8 items need you before Friday's payroll. Open: <link>"). Details live in the dashboard.
- The manager approves or edits each employee message in the dashboard before it goes out. PayCheck messages employees only after that approval. The owner approves messages to managers.
- One short, specific question per problem, grouped by who should answer. Job facts go to the job manager; policy and money decisions go to the owner.
- **Numbered or tappable options:** when a question has up to four answers, it is sent as an iMessage poll (the vote comes back tied to the question); otherwise as numbered options in text. At most one open question per conversation at a time, because inbound replies carry no thread id.
- Texts carry worker, date, job and hours, never pay amounts, SSNs or bank details.
- Vague or partial replies get one bounded follow-up. The model interprets replies into a fixed schema; code decides what to do; nothing is applied from a text without a human approval in the dashboard (the manager for job facts, the owner for money).
- **Escalation path when nobody answers:** reminder after 4 business hours (2 minutes in demo mode), then the owner is notified. At cutoff the item stays held: the worker's undisputed hours are paid, the disputed item is excluded from the draft and listed on the owner's held list. Never zero, never guessed.
- **STOP:** anyone who replies STOP is marked do-not-text; their future questions route to their manager. Managers decide whether their employees may be contacted at all (a company setting).
- **Corrections land in the review workbook**, never in the source systems: before, after, effect on pay and on job profit, who approved, when. Pay is calculated from the workbook. The owner can mark "fixed in Jobber" and PayCheck re-syncs and confirms the fix on the next run.
- Only the affected worker or item is held, never the whole payroll.

## 7. Learning over time

- **Onboarding** reads past cycles and proposes rules with evidence ("seen in 6 of 6 cycles: overtime after 40 hours per week"). Each proposed rule shows the records behind it.
- **"What did we miss?"**: after onboarding, PayCheck lists what it could not work out and asks the owner, one question each.
- **Owner-entered rules in plain words:** the owner types a rule, PayCheck restates it precisely for confirmation, labels it "stated by owner, not seen in history," and backtests it against past cycles.
- **Who answers what** is recorded and used for routing next time.
- **Lesson loop:** attempt → evaluate (against the human's answer, the answer key, or what was actually paid) → extract a lesson → compare it with what is already known (new, confirmed, superseded, or a contradiction to escalate) → backtest → keep only if it holds. A lesson becomes a rule only after approval.
- **Who approves what PayCheck learns (tiered, with separation of duties):**
  - Anything that changes what gets flagged or paid (rates, thresholds, matching rules, routing that changes who approves money) needs the **owner's** approval before it is used.
  - Low-risk changes (message wording, reminder timing, who to ask first for job facts) apply on their own, are logged, and can be undone.
  - A manager's answer resolves the case in front of them (after the owner approves the correction) but becomes a standing rule only when the owner approves it. The person who gave the answer never approves the rule made from it.
  - Every rule carries provenance (the answer, the person, the date, the backtest result) and can be reviewed, turned off or undone from the rules screen.
- **The owner's payroll runbook is the answer key, not an input.** PayCheck never sees it. We grade the learned rules against it and report the score; the runbook itself stays private.
- The demo shows cycle 2 asking fewer questions than cycle 1, with the counts.

## 8. Access, safety and audit

- Read-only on Jobber, QuickBooks and Gusto, except filling Gusto drafts (prepare, update, calculate; never submit). Separate credentials for the seed scripts; the product app has no write scope on Jobber or QuickBooks.
- **Segregation of duties:** PayCheck proposes, people approve. The agent never approves its own correction or rule. The owner submits payroll.
- **Full audit trail:** every sync (with completeness result), flag, question, message, reply, approval, correction, rule change and draft write is an append-only event with actor, time and the data, rule or person behind it. Anyone can trace any number back to its source.
- **Safety rules (all kept):** unknown blocks the item, never zero, and it never invents a rate; it never trims hours or assumes breaks; a number that changes after the owner has seen it is flagged again; data is never instructions (a note saying "pay this person" is reported, not followed); role-based views (a job manager never sees others' pay); an access log of who viewed or exported data; retention and deletion rules stated in the README.
- Names and identifiers are replaced with IDs before data reaches the model; the model sees only what each step needs.
- Texts never include pay amounts, SSNs or bank details.
- **Privacy and the law (P1 to P7, from research, not legal advice):** collect the minimum; never collect SSNs, bank numbers, tax forms or medical and leave reasons (Gusto keeps them); never restrict workers from discussing their own pay (NLRA); role-based views; texts carry worker, date, job, hours only; IDs instead of names to the model; access log; retention and deletion; fake names on every screen, in the repo and in the video.

## 9. Web app screens

- **Owner home:** the payroll stage (Collecting → Checking → Asking → Ready for Gate 1 → Draft filled → Stage 2 → Ready for Gate 2 → Done), "here's what we need from you" with one-tap approve, edit or deny, counts of clean, fixed, open and held items, and the live feed of questions out and answers in. Details are one click away.
- **Problem detail:** what was seen, where, confidence and precedent, the proposed question or correction, before and after, effect on pay and profit, approve, edit, deny.
- **Manager inbox:** their crew's problems, each employee message to approve or edit, replies as they arrive. No pay amounts.
- **Onboarding:** proposed rules with evidence, accept, edit, reject; "What did we miss?" questions.
- **Rules:** every learned or stated rule with provenance, backtest result, on/off, undo.
- **Workbook and readiness:** the Stage 1 and Stage 2 workbooks (per worker lines, to the cent), the readiness report (clean, fixed, open, held; dollars changed; questions asked this cycle vs. last; draft status in Gusto), and the download.
- **Audit log:** searchable event list.
- Layout is decided by the product role; the shape above is binding.

## 10. Tech stack

- **Plain code owns the payroll state, the approvals and all the math.** Deterministic checks handle anything with a clear answer; Claude handles the fuzzy cases (matching, classifying descriptions, interpreting replies, extracting rules from history, drafting questions) and always returns a fixed schema that code validates.
- **Agents:** three named Claude-backed roles over one deterministic engine, coordinated by a plain-code controller that owns state, approvals and money: **Analyst** (learns rules from history and from answers; backtests), **Auditor** (runs the checks and resolves fuzzy matches), **Messenger** (drafts questions, routes them, interprets replies). Hand-offs between them are events in the audit log, which is what the demo shows. Why three and not one or seven: Hyphenate asked for a few agents that work well together; the three map onto Learns and Improves, Runs, and Escalates; a fourth "Preparer" would only be arithmetic, which stays in code.
- **Model:** Claude Opus 5.5 for judgment and rule extraction; Claude Haiku 5.5 for reply interpretation and bulk classification with strict schemas; one adapter so the model is swappable (an open-weight model for sensitive steps is possible later).
- **Memory:** confirmed rules are structured records in our database because they drive money. Lessons live in a `lessons` table with a vector index scoped per company; a classifier compares each new lesson with the nearest known ones (new, confirmed, superseded, contradiction) and contradictions escalate. No hosted memory product does this comparison for us (research section 7). Backboard may mirror confirmed lessons for the MLH prize if it costs under an hour.
- **Backend and hosting:** Convex (database, scheduler, HTTP actions, vector search, real-time subscriptions) with a Next.js dashboard on Vercel and one small Bun worker for the Photon message stream. Alternative if Convex fails its first-hour check: Neon Postgres plus a Railway worker.
- **Texting:** Photon Spectrum, one-to-one iMessage with SMS fallback, polls for tappable answers, free plan with registered recipients.
- Each decision shows a confidence level and a precedent note.

## 11. Sponsor tracks

Enter: Hyphenate (main), Cal Hacks overall and Most Technically Complex, Microsoft Built for the Real World, Anthropic, MLH Best Use of Gen AI, MLH Commit Fellowship, Convex. If their pieces exist: MLH Backboard (lessons mirror), Apify (Playwright reader as an Actor). Skip: Atlassian (needs a Forge app), CRS (needs identity PII we refuse to collect), Bright Data (login scraping disqualified), voice tracks. Creao: criteria doc is restricted; Devaj reads it or asks the booth, then decides. Mana and Figma only if a teammate actually uses them.

## 12. Demo and proof

- **The moment (opens the video):** PayCheck catches double-booked hours in the real company's current pay cycle before the Gusto draft is filled, shows the two overlapping entries, asks the manager by text which job is right, and holds only that worker's disputed hours. Fallback moment if the live run is not ready: the same catch on Company A's planted overlap, labelled synthetic.
- **Live demo (3 minutes + 2 of questions):** onboarding proposes rules from history → cycle 1 runs, flags, texts a real phone, a reply lands live, the correction is approved, the Gusto draft fills → cycle 2 asks fewer questions → the judge's own scenario: an unseen situation escalates with "no precedent" instead of guessing, and the 25% catch-all fires.
- **Proof:** planted errors with an answer key on Company A (precision and recall per check), learned rules graded against the private runbook (aggregate score only), cycle 1 vs. cycle 2 question counts, and the backtest on Company R's past cycle where computed Stage 1 pay matches what was actually paid, to the cent. The README states what is real, what is simulated, and how we know.
- Video under 3 minutes, opening with the moment, with "synthetic" and "real, anonymized" labels on screen.

## 13. Work split and timeline

Decided in the implementation plan: [../docs/plans/00-team-brief.md](../docs/plans/00-team-brief.md). Shanin: data, Jobber, seed and payroll logic. Devaj: agent and backend. Varnika: product, messaging and demo.

## 14. Decisions made by the plan on Oct 24, 1:00 AM (each can be overruled by PR)

| Item | Decision | Why |
|---|---|---|
| C-1-2 target customer | Proof: the real 15-person company. Target: service companies with field crews, 10 to 500 workers, on job software. | Hyphenate scores "real enough" highest; large enterprise claims would be unprovable this weekend. |
| S-1-1 name | Working name PayCheck; rename before G0. | "Payroll Ops Agent" is a description, not a name; the code is name-free either way. |
| C-2-2 generalization | Company B (30-person HVAC, weekly) seeded with different rules, P1; Shanin's father's business is a stretch only. | Same seed generator, different config; proves the engine is shared and the rules are learned. |
| C-4-3 QuickBooks access | API for A and B; Excel export for R unless Shanin connects the real company. | Sandbox API verified; real financial data in the demo database is Shanin's call. |
| C-5-1 bank, tax, deductions | No. The only new-hire check reads Gusto's `onboarded` flag. | Pennsylvania reasonable-care duty, ADA separation, and Hyphenate's "limited access". |
| S-5-1 catch-all | Keep, 25% gross change vs. the last three cycles, owner-routed, always. | The validation session's biggest lever for a judge's own scenario. |
| S-5-2 job with no labor | Keep, P1. | Cheap once visits and entries are joined. |
| S-5-3 sync gap workers | Keep. | Verified gap in Gusto's own docs; it is the market insight. |
| S-5-4 job cost vs overhead | Keep, as a learned per-company mapping on the expense account. | Needed before expense matching can be precise. |
| S-5-5 Venmo workers | Keep. | Real-company fact; the Venmo list is an owner-entered rule. |
| C-6-5 escalation path | Reminder, then owner; at cutoff hold the item and pay undisputed hours. | Combines Devaj's and Shannin's positions; never zero, never guessed. |
| S-6-1 numbered options | Keep, via polls when ≤4 options, else numbered text; one open question per conversation. | Photon has no buttons; inbound replies carry no thread id (research 9a). |
| S-6-2 STOP | Keep, minimal. | Cheap, and judges on "would you hire it" notice it. |
| C-7-1 who approves learning | Tiered with separation of duties (section 7). | Hyphenate's own slide auto-saves a manager's answer; our contrast is controlled, scoped, backtested rules. |
| S-7-1 owner-entered rules | Keep. | Needed for Venmo rates and thresholds; backtest makes it honest. |
| S-7-2 runbook as answer key | Keep; aggregate scores only. | Proof for "learned rules vs. the owner's rules" without exposing the runbook. |
| S-8-1 safety rules | Keep all. | Each is a line of code or a UI rule; together they answer "would you hire it". |
| S-19-1 privacy and law | Keep all (P1 to P7). | Research-backed; low cost. |
| S-3-1 profit checks | Keep as the reconciliation stage; wages-as-share-of-revenue is P2. | Most real errors matter through profit (handoff section 9). |
| S-9-1 readiness report | Keep without the "hours saved" claim unless measured. | Never present a target as a result. |
| C-10-1 model | Opus 5.5 for judgment, Haiku 5.5 for structured extraction, one adapter. | Research section 4; swappable by design. |
| C-10-2 memory | Own `rules` and `lessons` tables with a vector index and a classifier. | No hosted product documents the comparison step; research section 7. |
| S-11-1 sponsors | Section 11. | Research section 3. |
| S-12-1 judges' scenario | Keep, plus the catch-all. | Hyphenate says judges may bring a scenario. |
| S-12-2 demo length | 3-minute video; 3-minute pitch plus 2 of questions. | Devpost, verified. |
| S-13-1 timeline | Replaced by the plan's clock and gates. | Sized to 3 people and 32 hours. |
| S-15-1 four pillars | Keep, in Hyphenate's words. | It is their rubric. |
| S-16-1 two stages, two gates | Keep. | Maps onto a regular plus an off-cycle Gusto payroll (verified). |
| S-17-1 F1 to F30 | Superseded by the plan's task IDs. | One numbering, in the plan. |
| S-18-1 shared engine vs learned rules | Keep; it is the architecture. | Generalization and self-improvement follow from it. |
