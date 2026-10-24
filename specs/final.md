# Product spec (draft)

The team's agreed spec for the Cal Hacks 13.0 Hyphenate track, built from the agreed and resolved items in [conflicts.md](conflicts.md) on Oct 24, 2026.

It's a draft because 30 items are still open; they're summarized at the end. The three personal specs and the old design draft were removed from the repo on the same day. They're still in git history at commit `a8a52f3`.

## 1. Pitch and seats
- The agent takes the seat of the person who prepares and checks payroll before it's submitted.
- Accuracy comes before speed: precision over recall.
- The agent fills the Gusto drafts. A person submits payroll; the agent never submits.

## 2. Demo company and users
- Demo data:
  - synthetic companies in the real tools' sandboxes (QuickBooks, Gusto, Jobber), read through their APIs, with planted errors;
  - one real company, Shannin's landscaping business, using its real Jobber data and its real errors.
- Everything on screen is anonymized with fake names.
- The main company is paid biweekly.
- Users:
  - **Payroll owner:** the main user, with the final say on each pay run.
  - **Managers:** log in to approve messages to their employees.
  - **Employees:** receive texts once their manager approves them.

## 3. In scope / out of scope
- In: the full payroll cycle, with two stages:
  - **Stage 1:** wages, in the regular Gusto run.
  - **Stage 2:** commissions, tips and the manager split, in a separate off-cycle Gusto run with its own owner approval.
- Code calculates wages, overtime, commissions, tips and the manager split, checks them to the cent, and then fills Gusto.
- Out: tax calculation (Gusto does it), and voice or phone calls.

## 4. Data sources and syncing
- Sources: Jobber, QuickBooks and Gusto.
- API first. Spreadsheet export and browser automation are fallbacks.
- Every read is checked for completeness (records pulled vs. the total the source shows) before use, and a mismatch blocks what it affects.
- The demo shows more than one access method.

## 5. What it catches
- A pay rate that differs between Jobber and Gusto.
- A QuickBooks job expense with no matching Jobber job.
- Former or deactivated employees who are still active or have hours.
- Duplicate entries.
- An active employee with no hours this period.
- Long shifts and open timers, with the threshold set per company.
- Repeat problems from history, which get extra attention.

## 6. Asking people and handling answers
- The manager gets a short Photon text that only pages them, e.g. "You have 8 errors to review", with a link. The full details are in the dashboard.
- The manager approves or edits each message in the dashboard before it goes to the employee. The agent messages employees only after that approval.
- Job facts go to the job manager; policy and money decisions go to the owner.
- One short, specific question per problem, grouped by who should answer.
- Vague or partial replies get a follow-up question.
- Each correction goes into the review workbook (before, after, effect on pay) only after a human approves it. Pay is calculated from the workbook. Source systems aren't changed.
- Only the affected worker or item is held, never the whole payroll.

## 7. Learning over time
- Onboarding learns from the company's past pay cycles.
- After onboarding, the agent asks the owner clarifying questions about what it couldn't work out.
- It records who answers which kind of question and routes there next time.
- Learned rules can be reviewed, turned off or undone.
- The demo shows cycle 2 asking fewer questions than cycle 1.

## 8. Access, safety and audit
- Read-only on Jobber, QuickBooks and Gusto, except for filling Gusto drafts.
- Full audit trail: every sync, flag, message, reply, approval and change is logged with who did it and when.
- Texts never include pay amounts, SSNs or bank details.
- Names and identifiers are replaced with IDs before data reaches the model.

## 9. Web app screens
- The main screen centers on what needs a human now, with one-tap approve, edit or deny.
- Managers log in to read the full error details and approve employee messages. The owner gives final pay-run approval.
- There's an onboarding screen with proposed rules and clarifying questions, and a screen of learned rules.
- The exact layout is decided later.

## 10. Tech stack
- Plain code owns the payroll state, the approvals and all the math. Deterministic checks handle anything with a clear answer, and Claude handles the fuzzy cases.
- Each decision shows a confidence level.
- Texting: Photon.
- Backend and frontend frameworks are decided in the implementation plan.

## 11. Sponsor tracks
- Devaj is handling these (see open items).

## 12. Demo and proof
- The opening moment, subject to change: the agent catches double-booked hours in the real company's current pay cycle before the Gusto draft is filled.
- Proof: planted errors with an answer key in the synthetic companies, plus real errors in the real company's anonymized data.

## 13. Work split and timeline
- Not decided yet.

## Still open
Details and each person's position are in [conflicts.md](conflicts.md).

- **Pitch:** target customer size (C-1-2); the product name, with "Payroll Ops Agent" proposed (S-1-1).
- **Generalization:** how we show it works beyond one company (C-2-2).
- **Data:** how QuickBooks data is pulled, API or spreadsheet (C-4-3).
- **Checks:**
  - whether to check bank details, tax forms and deductions (C-5-1);
  - a net-pay-change catch-all (S-5-1);
  - jobs with no labor recorded (S-5-2);
  - workers the Jobber-to-Gusto sync misses (S-5-3);
  - sorting expenses into job cost vs. overhead (S-5-4);
  - Venmo-paid workers (S-5-5).
- **Asking:** the escalation path (C-6-5); numbered reply options (S-6-1); STOP opt-out (S-6-2).
- **Learning:** who approves learned rules (C-7-1); owner-entered rules (S-7-1); the runbook as the answer key (S-7-2).
- **Safety:** Shannin's safety rules (S-8-1); privacy and the law (S-19-1).
- **Scope:** profit checks (S-3-1); the readiness report (S-9-1).
- **Stack:** the model and whether it's swappable (C-10-1); the memory store (C-10-2).
- **Demo:** the sponsor list (S-11-1); a judges' scenario that escalates (S-12-1); demo length (S-12-2); the timeline (S-13-1).
- **Structure:**
  - the four-pillar mapping (S-15-1);
  - the two-stage cycle with two owner gates (S-16-1);
  - features F1–F30 as the ticket basis (S-17-1);
  - shared engine vs. learned rules (S-18-1).
