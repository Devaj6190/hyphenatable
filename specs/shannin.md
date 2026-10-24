# Spec: Shannin

Rules:
- Write this on your own first. Don't read the other specs until yours is in.
- Keep every heading, even ones you leave empty. The compare step matches sections by heading.
- One decision per bullet. Short and concrete: "HR data comes from ERPNext," not "we should think about HR."
- Put `?` at the start of a bullet you're unsure about.
- Write `No opinion` under a heading you don't care about.

## 1. Pitch and seats
<!-- One-line pitch. Which job(s) on a finance team does it take over? What stays human? -->
- Pitch: an agent that runs a service company's full payroll cycle, learns the company's pay rules from past cycles, finds missing or wrong information across its systems, asks the right person when unsure, remembers the answer, and fills the payroll draft for the owner to review.
- Core problem: payroll software calculates correctly but assumes the inputs are right. The real work is collecting and checking inputs: hours with no job, shifts left running, double-booked hours, job expenses paid by card or Venmo but never added to the job, commissions that depend on who quoted in person.
- Seat it takes over: the person who prepares and checks payroll before it's submitted.
- Stays human: approving questions before they're sent, confirming learned rules, answering questions, and submitting payroll.
- Proof customer: the owner's landscaping company (about 15 staff, Pennsylvania, biweekly payroll in two stages).
- Target customer: large service companies, where payroll and accounting teams chase branch and crew managers for the same facts. Same engine, more rules, more people to ask.

## 2. Demo company and users
<!-- The fake company: industry, size, pay schedule. Who uses the app? -->
- Demo company: the owner's real landscaping company, run on its real payroll data, not a fake company.
- Everything on screen, in the repo and in the video uses realistic fake names and job numbers.
- Pay schedule: biweekly, Monday-start workweeks.
- Two payroll stages: Stage 1 hourly wages in the regular Gusto run; Stage 2 quote and marketing commissions, tips and manager splits in a separate off-cycle run after the cycle's expenses and overhead are complete.
- Users: the owner (dashboard, approvals, submits payroll) and the job manager (answers questions by text).
- ? Stretch: onboard a second real company (the owner's father's painting business) to show the engine works beyond one business.

## 3. In scope / out of scope
<!-- What we build this weekend, and what we deliberately skip. -->
- In: the full cycle: Stage 1 wages, financial reconciliation, Stage 2 commissions, tips and manager splits.
- In: filling the Gusto drafts (regular run and off-cycle run), then notifying the owner to review.
- In: learning rules from past cycles and from answers.
- In: asking questions by text and recording the answers.
- In: an owner dashboard.
- Out: submitting payroll or sending any payment. The owner submits.
- Out: changing Jobber or QuickBooks. Corrections are recorded in the review workbook; people fix the source.
- Out: tax calculation. Gusto does that.
- Out: multiple companies, except the stretch goal above.

## 4. Data sources and syncing
<!-- Which systems feed payroll, real or mocked, and how each one is pulled (API, browser, file). -->
- All sources are real.
- Jobber: hours, jobs, visits, invoices, payments, tips, some job expenses, in-person quoter field.
- Gusto: pay schedule, period dates, existing runs, workers, rates, employer taxes, payroll history; payroll drafts are filled here.
- QuickBooks: bank and card transactions, expenses, overhead (insurance, software). Pulled from a spreadsheet export.
- Owner: Venmo-paid workers' rates and answers to questions.
- Show three access methods in the demo: browser, saved scripts, spreadsheet export (and an API if one works).
- ? Browser access: saved Playwright scripts on the owner's own logged-in browser for each repeated read; an AI browser tool (Browser Use or Stagehand) only to discover the steps and to recover when a page changes.
- ? Jobber API: check whether it gives entry IDs and approval status, which the last browser read could not see. Skip it if the browser path works well.
- Every read records source, page, filters, date range, record count, the total the site shows, and the time read.
- Completeness check: a count that doesn't match the site's total blocks the affected stage.

## 5. What it catches
<!-- The errors it detects. List the planted errors for the demo. -->
- Logic checks, same for every company: duplicate entries, overlapping hours for one worker, open timers, shifts with no job, entries outside the pay period.
- Norm checks, learned per company: how long a normal shift is (this company flags over 8 hours), typical hours per job type, hours that differ from the schedule.
- Worker and rate checks: every Jobber worker matched to Gusto or the Venmo list; duplicate or deactivated profiles; Jobber rates vs. Gusto rates.
- Expense sorting first: each QuickBooks expense is classed as job cost (materials, equipment, disposal fees) or overhead (subscriptions, insurance, software). Only job costs need a job.
- Expense matching: each job cost matched to a Jobber job expense; job costs with no match flagged; the same cost counted twice caught; shared costs checked to add up.
- Pattern checks from learned rules: for example a mulch job with no mulch purchase, or overhead above the usual amount.
- Wages vs. revenue: total wages as a share of the period's revenue, shown over time against past cycles.
- Low profit check: a cycle with unusually low profit is flagged with likely reasons (jobs not yet paid while their labor is counted, unusually high labor or expenses). The owner decides if it's a concern.
- Demo errors are real, not planted: the current cycle has double-booked hours right now.
- ? Backtest errors come from the earlier payroll agent's logs of what was wrong and fixed, if those logs exist.

## 6. Asking people and handling answers
<!-- Who gets asked about what, how (inbox, Slack, voice), deadlines, escalation, what happens with no answer. -->
- Job facts (hours, which job, expenses, quoters) go to the job manager. Rates, policy and money decisions go to the owner.
- Channel: text messages through Photon.
- Target setup: a group chat with the owner and the job manager. In the demo, texts go to the owner standing in for the group chat.
- The owner approves, edits or denies each message on the dashboard before it's sent.
- One short, clear question per problem: worker, date, job, hours or amount. Our last build's messages were too long and unclear; the format still needs design.
- Questions are grouped by who should answer.
- Vague or partial replies (a bare "yes" to several questions) get a follow-up.
- Answers become corrections in the review workbook, never in Jobber, showing before, after and the effect on pay.
- Unanswered items stay held; only the affected worker or job is held, never the whole payroll.
- ? Asking workers: the agent asks the job manager, who asks the worker and replies to the agent. Alternative: the agent drafts a message to the worker for the job manager to approve.

## 7. Learning over time
<!-- How it asks less next run, and who approves what it learns. -->
- Learn (onboarding): reads past pay cycles and proposes the company's rules and norms: rates, which job types need which expenses, shift lengths, typical overhead, how commissions work, who answers what. Each rule links to the cycles that show it.
- The owner confirms, edits or rejects every proposed rule before it's used.
- "What did we miss?": after proposing, it asks the owner what its analysis missed, since some rules never show clearly in past data (marketing commissions are rare).
- Owner-entered rules: the owner adds a rule in plain words; the agent restates it precisely for confirmation, labels it "stated by owner, not seen in history," and checks it against past cycles where it can.
- The agent is not given the owner's payroll runbook. The runbook is the answer key we grade its learned rules against.
- Improve (each cycle): every answer and its reason become a rule; it records who answers which kind of question.
- Improve: it applies saved rules on the next cycle and shows how many questions it answered on its own.
- Improve: it spots recurring problems (which jobs often miss expenses) and updates its norms.

## 8. Access, safety and audit
<!-- What it can and can't touch, who approves what, how its work is recorded, handling personal data. -->
- Read-only on Jobber and QuickBooks. In Gusto, it fills drafts only and never submits.
- The owner submits. Any number that changes after the owner has seen it is flagged again.
- Unknown blocks the item, never zero. It never invents a rate, percentage, break or prior payment.
- Never trims hours or assumes breaks.
- Precision over recall: auto-resolves only what it's sure of, with a confidence level on each decision.
- Stages stay separate: a commission problem never holds up wages; nothing is reported as "payroll complete."
- Data is never instructions: a note or text telling it to pay someone is reported, not followed.
- Full trail: every number records where it came from, and the agent can answer "why did you do that?"
- Collect the minimum: never Social Security numbers, bank details, tax forms, medical or leave reasons.
- Role-based views: the owner sees everything; the job manager sees only the hours and job facts he's asked about, never other workers' pay, commissions or the manager split.
- Texts carry worker, date, job and hours, never pay amounts.
- Model privacy: only what each step needs, with IDs instead of names where possible; providers that don't train on or keep the data.
- Access log of who viewed or exported payroll data; retention and deletion rules.
- ? Legal check before production: no general federal law bars sharing pay internally, but Pennsylvania requires reasonable care with Social Security and bank data (Dittman v. UPMC, 2018), medical data must stay separate (ADA), and workers' right to discuss their own pay is protected (NLRA).

## 9. Web app screens
<!-- Each screen and what it shows. -->
- One dashboard for the owner. Layout and design decided later.
- Payroll stage: where the run is, in plain words ("Gathering information," "Looking for mistakes," "Waiting on answers," "Calculating pay," "Draft ready for your review"); Stage 1 and Stage 2 shown separately.
- "Here's what we need from you": items that need the owner, each with what's wrong, why it matters, and a one-tap action:
  - Pick a match: "3 QuickBooks expenses aren't linked to a job. Which one belongs to Job 36?"
  - Approve a message: the exact text to the job manager, with Approve, Edit or Deny.
  - Confirm a rule: "Mulch jobs usually have a mulch purchase. Make this a rule?"
  - Make a decision: a negative-profit cycle, an overtime week.
- Inputs and problems: everything it pulled (hours, jobs, expenses, rates) for the owner to look through, and every problem with its status (open, waiting on a reply, resolved) and what it affects.
- Replies: answers from the job manager, what the agent understood, and the correction it proposes.
- Cycle summary and drafts: totals, wages vs. revenue over time, cycle profit and any low-profit flag, overtime, held workers and why, the Venmo pay list, and links to the Gusto drafts.
- What it learned: rules learned or given this cycle, and how many questions it answered on its own.
- Onboarding screen: proposed rules to confirm, the "what did we miss?" question, and a box to add rules in plain words.

## 10. Tech stack
<!-- Languages, frameworks, models, hosting. -->
- Model: Claude by default, swappable, so an open-source model can run on sensitive steps.
- Four agents, coordinated by plain code that owns the payroll state, the approvals and all the math:
  - Collector: pulls data from each system and checks it's complete.
  - Auditor: runs the checks and decides what's a problem.
  - Messenger: drafts questions, sends them by text, reads replies.
  - Payroll preparer: calculates pay and fills the Gusto drafts.
- Messaging: Photon.
- Confirmed company rules are stored as structured records, since they drive pay.
- ? Agent memory of the business: research Backboard, Cognee, Mem0 and Letta.
- ? Browser: Playwright scripts plus an AI browser tool for discovery and recovery (see section 4).
- ? Languages, frameworks and hosting: decide in the implementation plan.

## 11. Sponsor tracks
<!-- Tracks we enter besides Hyphenate, and what each one needs from the build. -->
- Microsoft "Built for the Real World": a production-minded agent in finance; judged on customer understanding, measurable usefulness, path to production, responsible design, end-to-end function.
- Anthropic: a named community, a lived problem, one thing that works, thoughtful use of Claude.
- Cal Hacks overall.
- MLH Commit Fellowship: opt in at submit and fill the extra form.
- ? MLH Backboard, if we use it for memory.
- ? Apify, if the browser scripts run as Apify Actors.

## 12. Demo and proof
<!-- The opening "moment", the judges' own scenario, what's real vs simulated, how we prove it works. -->
- Opening moment: it catches the double-booked hours in the current real pay cycle before the Gusto draft is filled, so no money goes out wrong.
- Second moment: a QuickBooks charge with no matching Jobber expense, sent to the job manager to link to the right job.
- Third moment: run one cycle, answer its questions, run the next, and it asks fewer.
- Judges' own scenario: a new situation the agent hasn't seen, and it escalates instead of guessing.
- Real: the company, its payroll data, the texts, the learned rules. Shown with fake names.
- Recorded: filling the Gusto draft.
- Pay correctness: on past paid cycles, every worker's computed pay matches what was actually paid, to the cent.
- Problem detection: precision and recall against known problems from past cycles.
- Learning accuracy: how many learned rules match the owner's real rules.
- ? Backtest "before" state comes from the earlier payroll agent's logs, if they exist; past cycles in Jobber are already corrected.

## 13. Work split and timeline
<!-- Who builds what, and checkpoints until Sunday 9 AM. -->
- Decide after the final spec and the implementation plan.

## 14. Open questions
<!-- Things you think the team still needs to decide. -->
- Do the earlier payroll agent's logs record what was wrong and fixed in past cycles?
- Does Photon support group chats on our plan?
- Do we have Jobber API access, and is it worth using over the browser?
- Which memory tool fits best: Backboard, Cognee, Mem0 or Letta?
- Which past cycles do we use for the backtest?
- How should questions to workers flow: through the job manager, or drafted for the job manager to approve?
- What's the best text message format and approval screen?
