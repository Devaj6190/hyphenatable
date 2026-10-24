# Spec conflicts

Fill in **Decision** and **Decided by** under each open item, then move the result into [final.md](final.md).

Status: 30 open · 13 resolved · 34 agreed (21 conflicts, 22 solo items)

This compared Devaj's, Shannin's and Varnika's specs, with the old DESIGN.md as background. Those files were removed on Oct 24, 2026 and are in git history at commit `a8a52f3`; each person's position is quoted under every item below. Rule and rubric notes cite [../docs/sources/](../docs/sources/README.md).

The biggest split is **C-2-1 (what the demo runs on)**. C-4-1, C-5-1 and C-12-2 mostly follow from it, so decide it first.

## 1. Pitch and seats

### C-1-1 Does the agent submit payroll, or does a person? (RESOLVED)
- **Varnika:** the agent prepares and corrects the payroll file. The payroll team submits. It never runs payroll or moves money.
- **Devaj:** the agent builds the full pay run in Gusto and submits it after the payroll owner approves.
- **Shannin:** the agent fills the Gusto drafts (the regular run and the off-cycle run). The owner submits. The agent never submits.
- **DESIGN.md:** the agent only verifies inputs and hands over a verified file.
- **Note:** Hyphenate's rubric asks "would you hire it" on limited access ([track doc](../docs/sources/README.md)). All three options keep a human approval before money moves, so the real difference is who clicks submit.
- **Decision:** A person submits payroll. The agent fills the Gusto drafts and never submits.
- **Decided by:** Devaj

### C-1-2 Who is the target customer in the pitch? (OPEN)
- **Varnika:** any company size. Its open questions ask whether to lead with enterprise scale or "works for any company".
- **Devaj:** must generalize across many companies. No size given.
- **Shannin:** the proof customer is a 15-person landscaping company. The target is large service companies: "same engine, more rules, more people to ask".
- **DESIGN.md:** a 1,200-person hospital network.
- **Decision:**
- **Decided by:**

### S-1-1 Working name "Payroll Ops Agent" (OPEN)
- **Proposed by:** Varnika: working name "Payroll Ops Agent", to be renamed. It's already in the root README.
- **Decision:** keep / drop / change to …
- **Decided by:**

### Agreed
- The seat it takes over is the person who prepares and checks payroll before it's submitted. (Devaj, Shannin, Varnika)
- Accuracy comes before speed: precision over recall. (Devaj, Shannin)

## 2. Demo company and users

### C-2-1 What does the demo run on? (RESOLVED)
- **Varnika:** a synthetic company of about 3,000 employees on mock APIs, plus Shannin's real company's Jobber data (read-only, anonymized) as the real-data proof.
- **Devaj:** the real tools' developer sandboxes (QuickBooks, Gusto demo, Jobber tester accounts), with two synthetic companies seeded with planted errors. The friend's real data maybe later.
- **Shannin:** the owner's real landscaping company and its real payroll data, with realistic fake names on screen, in the repo and in the video. No synthetic company.
- **DESIGN.md:** a synthetic hospital on mock APIs.
- **Note:** Hyphenate's first question is "real enough? Realistic data, a messy problem, and proof that it works", and real data scores best there. Planted errors with an answer key are the proof method the track doc suggests. Real data also covers Anthropic's "lived or heard firsthand" point.
- **Decision:** Synthetic companies in the real tools' sandboxes, read through their APIs, plus one real company: Shannin's, using its real Jobber data. Everything on screen is anonymized with fake names.
- **Decided by:** Devaj

### C-2-2 How do we show it works beyond one company? (OPEN)
- **Varnika:** a large synthetic company for scale, plus Shannin's company.
- **Devaj:** two synthetic companies set up differently: a 12-person landscaping crew paid every two weeks and a 30-person HVAC company paid weekly.
- **Shannin:** stretch goal: onboard a second real company (the owner's father's painting business).
- **Decision:**
- **Decided by:**

### Agreed
- The main company is paid biweekly. (Devaj, Shannin, Varnika)
- The payroll owner is the main user and has the final say. (Devaj, Shannin, Varnika)

## 3. In scope / out of scope

### C-3-1 Is Stage 2 (commissions, tips, manager profit split) in scope this weekend? (RESOLVED)
- **Varnika:** partly. The checks catalog includes "commission file missing a region or rep", but there's no separate stage.
- **Devaj:** not covered.
- **Shannin:** yes. Stage 2 is a separate off-cycle Gusto run after expenses and overhead are reconciled, with its own owner gate.
- **Decision:** Go with Shannin's spec: Stage 2 (commissions, tips, manager split) is in scope, as a separate off-cycle Gusto run with its own owner gate.
- **Decided by:** Devaj

### C-3-2 Does the agent calculate pay itself? (RESOLVED)
- **Varnika:** no. It corrects the payroll file; calculating pay isn't part of the spec.
- **Devaj:** not stated. It builds the pay run in Gusto.
- **Shannin:** yes. Code computes wages, overtime, commissions, tips and the manager split, checks them to the cent, and then fills Gusto. Gusto does taxes.
- **DESIGN.md:** no; Gusto/ADP do the math.
- **Decision:** Go with Shannin's spec: code calculates wages, overtime, commissions, tips and the manager split, checked to the cent, then fills Gusto. Gusto does taxes.
- **Decided by:** Devaj

### S-3-1 Financial reconciliation and profit checks (OPEN)
- **Proposed by:** Shannin: match customer payments, job profit (invoice minus labor minus expenses), wages as a share of revenue over time, and a low-profit flag with likely reasons.
- **Decision:** keep / drop / change to …
- **Decided by:**

### Agreed
- Tax calculation is out; Gusto does it. (Shannin, Varnika)
- No voice or phone calls; text messages only. (Devaj, Shannin, Varnika)

## 4. Data sources and syncing

### C-4-1 Which source systems? (RESOLVED)
- **Varnika:** generic types: HRIS, time and attendance, benefits and deductions, expenses and commissions, and the payroll provider. Mocked for the synthetic company; Jobber for Shannin's company.
- **Devaj:** Jobber, QuickBooks, Gusto.
- **Shannin:** Jobber, Gusto, QuickBooks, plus the owner's list of Venmo-paid workers.
- **DESIGN.md:** HR, Time, Benefits, Bank (Nessie).
- **Decision:** Jobber, QuickBooks and Gusto.
- **Decided by:** Devaj

### C-4-2 Which access method comes first? (RESOLVED)
- **Varnika:** API where one exists, browser automation where it doesn't.
- **Devaj:** API first, then a spreadsheet export, then Browser Use.
- **Shannin:** browser first. Saved Playwright scripts run on the owner's logged-in browser, and an AI browser tool (Browser Use or Stagehand) is used only to discover the steps and recover when a page changes. Skip the Jobber API if the browser path works.
- **Decision:** API first. Spreadsheet export and browser automation are fallbacks.
- **Decided by:** Devaj

### C-4-3 How do we get QuickBooks data? (OPEN)
- **Varnika:** not covered.
- **Devaj:** the QuickBooks Online API.
- **Shannin:** a spreadsheet export.
- **Decision:**
- **Decided by:**

### Agreed
- Every read is checked for completeness (records pulled vs. the total the source shows) before use, and a mismatch blocks what it affects. (Devaj, Shannin, Varnika)
- The demo shows more than one access method. (Devaj, Shannin)

## 5. What it catches

### C-5-1 Do we check bank details, tax forms and benefit deductions? (OPEN)
- **Varnika:** yes: "new hire missing bank details or tax form" and "deduction doesn't match benefit election". It anonymizes SSNs and bank numbers before the model sees them.
- **Devaj:** not covered.
- **Shannin:** no. It never collects SSNs, bank details, tax forms, or medical or leave reasons; Gusto keeps them.
- **Note:** Shannin's legal research cites Pennsylvania's reasonable-care duty for SSN and bank data (Dittman v. UPMC).
- **Decision:**
- **Decided by:**

### S-5-1 Catch-all: net pay changed more than 20% vs. last period (OPEN)
- **Proposed by:** Varnika: flag any net-pay change of more than 20%, routed to the payroll owner.
- **Note:** the validation session named a catch-all like this (it suggested 25%) as the biggest single lever for handling a judge's own scenario ([findings](../docs/sources/README.md)).
- **Decision:** keep / drop / change to …
- **Decided by:**

### S-5-2 Job with work done but no labor recorded (OPEN)
- **Proposed by:** Devaj: a job shows work done, but no labor was logged against it.
- **Decision:** keep / drop / change to …
- **Decided by:**

### S-5-3 Workers the Jobber-to-Gusto sync doesn't cover (OPEN)
- **Proposed by:** Varnika: salaried, contractor and commission workers aren't covered by the Jobber-to-Gusto sync, per Gusto's support page.
- **Decision:** keep / drop / change to …
- **Decided by:**

### S-5-4 Sort expenses into job cost vs. overhead before matching (OPEN)
- **Proposed by:** Shannin: only job costs (materials, equipment, disposal fees) need a job. Overhead (subscriptions, insurance, software) goes to a cycle total.
- **Decision:** keep / drop / change to …
- **Decided by:**

### S-5-5 Venmo-paid workers (OPEN)
- **Proposed by:** Shannin: every Jobber worker is matched to Gusto or to the owner's Venmo list, and the cycle summary includes a Venmo pay list.
- **Decision:** keep / drop / change to …
- **Decided by:**

### Agreed
- A pay rate that differs between Jobber and Gusto is flagged. (Devaj, Shannin)
- A QuickBooks job expense with no matching Jobber job is flagged. (Devaj, Shannin)
- Former or deactivated employees who are still active or have hours are flagged. (Devaj, Shannin, Varnika)
- Duplicate entries are flagged. (Shannin, Varnika)
- An active employee with no hours this period is flagged. (Devaj, Varnika)
- Long shifts and open timers are flagged, with the threshold set per company. (Shannin, Varnika)
- Repeat problems from history get extra attention. (Devaj, Shannin)

## 6. Asking people and handling answers

### C-6-1 Who approves a message before it's sent, and where? (RESOLVED)
- **Varnika:** the agent texts the owner of the problem directly. Before texting an employee, it asks the manager for permission by SMS.
- **Devaj:** always manager-first. The manager gets an SMS with a link and approves each employee message in the dashboard.
- **Shannin:** the owner approves, edits or denies every message on the dashboard before it goes out (to the job manager).
- **Decision:** The manager gets a short SMS page only (e.g. "You have 8 errors to review") with a link. Full details are in the dashboard, where the manager approves or edits each message before it goes to the employee.
- **Decided by:** Devaj

### C-6-2 Does the agent ever message employees directly? (RESOLVED)
- **Varnika:** yes, with the manager's OK.
- **Devaj:** yes, after the manager approves each message.
- **Shannin:** undecided: either the job manager asks the worker and replies to the agent, or the agent drafts a message to the worker for the job manager to approve.
- **Decision:** Yes. The agent messages employees directly, but only after the manager approves each message in the dashboard.
- **Decided by:** Devaj

### C-6-3 Which texting service? (RESOLVED)
- **Varnika:** SMS, e.g. Twilio.
- **Devaj:** Twilio.
- **Shannin:** Photon. The target setup is a group chat with the owner and the job manager.
- **Decision:** Photon.
- **Decided by:** Devaj

### C-6-4 Where does a correction land? (RESOLVED)
- **Varnika:** the agent writes the fix into its own copy of the payroll file, never into the source system.
- **Devaj:** people fix the source, then the agent re-syncs and re-checks before closing the flag.
- **Shannin:** in the review workbook, never in Jobber, showing before, after and the effect on pay. People fix the source.
- **DESIGN.md:** fixed at the source, then re-synced and re-verified.
- **Note:** the validation findings say "fix it in the system of record, then prove it's fixed on the next sync" is one of the few things Hyphenate's own slides don't already show ([findings](../docs/sources/README.md)).
- **Decision:** The agent records each correction in the review workbook (before, after, effect on pay) and pays from it, but only after a human approves the correction. Source systems are not changed.
- **Decided by:** Devaj

### C-6-5 What's the escalation path when nobody answers? (OPEN)
- **Varnika:** the owner's manager, then HR or the payroll owner. Anything unresolved at the deadline is marked as blocking in the hand-off.
- **Devaj:** a reminder, then escalation to the payroll owner. Still unresolved at cutoff means that item is held or paid on undisputed hours only.
- **Shannin:** unanswered items stay held. No escalation chain is given.
- **Decision:**
- **Decided by:**

### S-6-1 Numbered reply options in texts (OPEN)
- **Proposed by:** Varnika: e.g. "1 = correct, 2 = change to 8 hrs, 3 = I'll fix it in Jobber".
- **Decision:** keep / drop / change to …
- **Decided by:**

### S-6-2 Opt-out by replying STOP (OPEN)
- **Proposed by:** Varnika: anyone can reply STOP, and managers decide whether their employees may be contacted.
- **Decision:** keep / drop / change to …
- **Decided by:**

### Agreed
- Only the affected worker or item is held, never the whole payroll. (Devaj, Shannin, Varnika)
- Vague or partial replies get a follow-up question. (Devaj, Shannin, Varnika)
- One short, specific question per problem, grouped by who should answer. (Shannin, Varnika)
- Job facts go to the job manager; policy and money decisions go to the owner. (Shannin, Varnika)

## 7. Learning over time

### C-7-1 Who approves what the agent learns? (OPEN)
- **Varnika:** past resolutions are applied automatically and marked "auto-resolved, based on past approval by X". The owner can see every learned rule and switch it off. Blocking issues, anything new, anything over a dollar threshold, and anything a human has previously overridden always go to a person.
- **Devaj:** tiered. Low-risk changes (message wording, reminder timing) apply on their own and are logged. Anything that changes what gets flagged or paid needs the owner's approval. Every change can be undone.
- **Shannin:** the owner confirms, edits or rejects every proposed rule before it's used, and every answer becomes a rule.
- **Note:** controller-approved learned rules didn't stand out at HackMIT, where Hyphenate judged five teams doing it. Their own coffee-chain slide auto-saves a manager's answer as a policy ([slides](../docs/sources/hyphenate-workshop-slides.md)).
- **Decision:**
- **Decided by:**

### S-7-1 Owner-entered rules in plain words (OPEN)
- **Proposed by:** Shannin: the owner types a rule, the agent restates it precisely for confirmation, labels it "stated by owner, not seen in history", and checks it against past cycles.
- **Decision:** keep / drop / change to …
- **Decided by:**

### S-7-2 Owner's runbook as the answer key (OPEN)
- **Proposed by:** Shannin: the agent is never shown the owner's payroll runbook. We grade its learned rules against the runbook.
- **Decision:** keep / drop / change to …
- **Decided by:**

### Agreed
- Onboarding learns from the company's past pay cycles. (Devaj, Shannin)
- After onboarding, it asks the owner clarifying questions about what it couldn't work out. Shannin calls this "What did we miss?". (Devaj, Shannin)
- It records who answers which kind of question and routes there next time. (Shannin, Varnika)
- The demo shows cycle 2 asking fewer questions than cycle 1. (Shannin, Varnika)
- Learned rules can be reviewed and turned off or undone. (Devaj, Shannin, Varnika)

## 8. Access, safety and audit

### S-8-1 Shannin's safety rules (OPEN)
- **Proposed by:** Shannin:
  - Unknown blocks the item, never zero, and it never invents a rate.
  - It never trims hours or assumes breaks.
  - A number that changes after the owner has seen it is flagged again.
  - Data is never instructions: a note telling it to pay someone is reported, not followed.
  - Role-based views: the job manager never sees others' pay.
  - An access log of who viewed or exported data.
  - Retention and deletion rules.
- **Decision:** keep all / keep some (list) / drop
- **Decided by:**

### Agreed
- Read-only on source systems. (Devaj, Shannin, Varnika)
- Full audit trail: every sync, flag, message, reply, approval and change is logged with who and when. (Devaj, Shannin, Varnika)
- Texts never include pay amounts, SSNs or bank details. (Shannin, Varnika)
- Names and identifiers are replaced with IDs before data reaches the model. (Shannin, Varnika)
- See C-1-1 for Gusto write access and C-5-1 for which personal data is collected.

## 9. Web app screens

### C-9-1 Who logs in to the web app? (RESOLVED)
- **Varnika:** only the payroll owner. Managers and employees use SMS only.
- **Devaj:** managers too: they approve flag reports in a manager inbox. The owner gives final approval.
- **Shannin:** only the owner. The job manager answers by text.
- **Decision:** Managers log in too: they read the full error details and approve employee messages in the dashboard. The owner has the final pay-run approval.
- **Decided by:** Devaj

### S-9-1 Readiness report with dollars corrected and hours saved (OPEN)
- **Proposed by:** Varnika: clean, fixed and open counts, dollars corrected, hours saved, and a download of the corrected file.
- **Decision:** keep / drop / change to …
- **Decided by:**

### Agreed
- The main screen centers on what needs a human now, with one-tap approve, edit or deny. (Devaj, Shannin, Varnika)
- There's an onboarding screen with proposed rules and clarifying questions, and a screen of learned rules. (Devaj, Shannin, Varnika)
- The exact layout is decided later. (Devaj, Shannin, Varnika)

## 10. Tech stack

### C-10-1 Which model, and is it swappable? (OPEN)
- **Varnika:** not covered.
- **Devaj:** the most accurate model: Claude Opus 5.5 for judgment calls and onboarding mapping.
- **Shannin:** Claude by default, swappable so an open-source model can run the most sensitive steps.
- **Decision:**
- **Decided by:**

### C-10-2 Where does the agent's memory of the business live? (OPEN)
- **Varnika:** Backboard (stated in the root README, not in the spec).
- **Devaj:** not covered.
- **Shannin:** confirmed rules are stored as structured records because they drive pay. A memory tool is still to research: Backboard, Cognee, Mem0 or Letta.
- **DESIGN.md:** a SQLite policy table.
- **Decision:**
- **Decided by:**

### Agreed
- Plain code owns the payroll state, the approvals and all the math. Deterministic checks handle anything with a clear answer, and Claude handles the fuzzy cases. (Devaj, Shannin)
- Each decision shows a confidence level. (Devaj, Shannin)
- Backend and frontend frameworks are decided in the implementation plan. (Devaj, Shannin)

## 11. Sponsor tracks

### S-11-1 Shannin's sponsor list (OPEN)
- **Proposed by:** Shannin: Microsoft "Built for the Real World", Anthropic, Cal Hacks overall, MLH Commit Fellowship, and maybe MLH Backboard and Apify. Devaj's spec says Devaj is handling sponsors separately.
- **Note:** the validation findings say Devpost lists no Anthropic prize ([findings](../docs/sources/README.md)). Confirm with the organizers before building for it.
- **Decision:** keep / drop / change to …
- **Decided by:**

## 12. Demo and proof

### C-12-1 What's the opening "moment"? (RESOLVED)
- **Varnika:** no single moment. The demo is a 3-minute script: the issue queue fills, a live text flow, an ignored text escalates, the readiness report, cycle 2, then Shannin's real data.
- **Devaj:** to be decided later.
- **Shannin:** it catches double-booked hours in the current real pay cycle before the Gusto draft is filled. Second: a QuickBooks charge with no Jobber expense. Third: cycle 2 asks fewer questions.
- **DESIGN.md:** a terminated nurse with a fresh bank-account change.
- **Note:** Hyphenate requires the demo video to open with the moment ([track doc](../docs/sources/README.md)).
- **Decision:** Shannin's: catch the double-booked hours in the real company's current pay cycle before the Gusto draft is filled. Subject to change.
- **Decided by:** Devaj

### C-12-2 How do we prove it's accurate? (RESOLVED)
- **Varnika:** all seeded errors in the synthetic company are caught, plus hours saved and the drop in questions.
- **Devaj:** planted errors with an answer key and a detection score, on the two seeded companies.
- **Shannin:** a backtest on past paid cycles, where every worker's computed pay matches what was actually paid, to the cent. Plus precision and recall against known past problems, and learned rules vs. the owner's runbook.
- **Note:** Hyphenate asks for "what's real, what's simulated, and how you know".
- **Decision:** Both: synthetic companies with planted errors and an answer key, plus the real company's anonymized data with its real errors.
- **Decided by:** Devaj

### S-12-1 Judges' own scenario: escalate instead of guessing (OPEN)
- **Proposed by:** Shannin: given a situation it hasn't seen, the agent escalates instead of guessing.
- **Decision:** keep / drop / change to …
- **Decided by:**

### S-12-2 Demo length and script (OPEN)
- **Proposed by:** Varnika: a 7-step, 3-minute demo script.
- **Note:** the hacker guide says a 2-minute pitch; the validation findings say Devpost lists a 3-minute pitch plus 2 minutes of Q&A. Confirm which one applies.
- **Decision:** keep / drop / change to …
- **Decided by:**

## 13. Work split and timeline

### S-13-1 Hour-by-hour timeline (OPEN)
- **Proposed by:** Varnika: hours 0–4 data model and generator; 4–12 sync and checks; 12–20 routing, SMS and corrections; 20–26 escalation and learning; 26–30 real-data sync; 30–36 polish and rehearsals. Devaj and Shannin both leave the work split for after the final spec.
- **Decision:** keep / drop / change to …
- **Decided by:**

## Shannin's added sections (15–19)

### S-15-1 Map the product onto Hyphenate's four pillars (OPEN)
- **Proposed by:** Shannin: self-learning onboarding, autonomous run, escalation, self-improvement. These match the Learns → Runs → Escalates → Improves loop in Hyphenate's workshop slides ([slides](../docs/sources/hyphenate-workshop-slides.md)).
- **Decision:** keep / drop / change to …
- **Decided by:**

### S-16-1 The two-stage payroll cycle with two owner gates (OPEN)
- **Proposed by:** Shannin: set up, Stage 1 wages, Gate 1, financial reconciliation, Stage 2, Gate 2. Depends on C-3-1.
- **Decision:** keep / drop / change to …
- **Decided by:**

### S-17-1 The feature list F1–F30 as the basis for tickets (OPEN)
- **Proposed by:** Shannin: 30 numbered features across collect, find problems, calculate, ask, learn, improve, prepare and prove.
- **Decision:** keep / drop / change to …
- **Decided by:**

### S-18-1 Shared engine vs. learned company rules (OPEN)
- **Proposed by:** Shannin: the engine stays the same for every company, and only the learned rules change. This fits Devaj's "must generalize" and the hybrid-detection item agreed above.
- **Decision:** keep / drop / change to …
- **Decided by:**

### S-19-1 Privacy and the law (OPEN)
- **Proposed by:** Shannin: product rules P1–P7, based on research into pay-sharing, the NLRA, Dittman v. UPMC and ADA medical data. It's research, not legal advice.
- **Decision:** keep / drop / change to …
- **Decided by:**

## 14. Open questions

Not compared; each person's open questions remain in their own spec. Most are answered by decisions above, e.g. Varnika's "which payroll provider" by C-4-1 and the memory tool by C-10-2.
