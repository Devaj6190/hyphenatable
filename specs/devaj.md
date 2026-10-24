# Spec: Devaj

Rules:
- Write this on your own first. Don't read the other specs until yours is in.
- Keep every heading, even ones you leave empty. The compare step matches sections by heading.
- One decision per bullet. Short and concrete: "HR data comes from ERPNext," not "we should think about HR."
- Put `?` at the start of a bullet you're unsure about.
- Write `No opinion` under a heading you don't care about.

## 1. Pitch and seats
- The agent gets a seat in the company, like a new hire, and goes through an onboarding before it starts working.
- It creates the full payroll: gathers the data, flags and fixes problems, builds the pay run in Gusto, and submits it.
- One human gate: the payroll owner approves the final pay run, and only then does the agent submit it. The agent never submits without that approval.
- Top priority is accuracy. When speed and accuracy conflict, accuracy wins.
- It must generalize across companies, not fit one company's setup.

## 2. Demo company and users
- The workflow is modeled on a friend's real business, which runs on Jobber (jobs and hours), QuickBooks (books and expenses) and Gusto (payroll).
- The demo runs on the real tools' developer environments: QuickBooks sandbox companies, Gusto's demo environment, and Jobber developer tester accounts.
- Two synthetic companies, set up differently, to show it generalizes. Example: a 12-person landscaping crew paid every two weeks, and a 30-person HVAC company paid weekly.
- A seed script creates each company through the APIs, including past pay periods, and plants errors with an answer key.
- ? We may switch to, or add, the friend's real data later.
- Users:
  - **Payroll owner:** approves the final pay run.
  - **Managers:** approve every message before it goes to an employee.
  - **Employees:** get messages after their manager approves.

## 3. In scope / out of scope
- In:
  - onboarding from past data, plus clarification questions
  - syncing the three systems with fallbacks
  - flagging
  - the manager-approval flow
  - SMS and dashboard messages
  - building and submitting the pay run after approval
  - tiered self-improvement
- Flagging comes first. Learning patterns from history comes after.
- Out for now: real customer data, and systems beyond Jobber, QuickBooks and Gusto.

## 4. Data sources and syncing
- Sources: Jobber, QuickBooks, Gusto.
- For each source, try in order:
  1. The system's own API, pulling everything we can get.
  2. A spreadsheet export, if there's no API access but the system can export one.
  3. Browser Use (the product), if everything else fails or the system is very old.
- The demo shows all three paths:
  - APIs for Jobber, QuickBooks and Gusto;
  - one spreadsheet export, e.g. an expense or mileage CSV;
  - one Browser Use run on an old-style time-clock site we host.
- Every sync is checked for completeness before anything is flagged or built. Accuracy comes before speed.

## 5. What it catches
- Missing hours: an employee hasn't put in hours for the period.
- Missing labor: a job shows work done, but no labor was recorded against it.
- Cross-system discrepancies:
  - a QuickBooks expense not linked to any job or service;
  - a pay rate that differs between Jobber and Gusto;
  - someone who left the company still active in Gusto.
- Patterns from history, e.g. an employee who forgot hours in 3 of the last 6 periods gets checked first and earlier.
- Detection is hybrid:
  - Code rules for anything with a clear right answer.
  - During onboarding, Claude maps each company's fields onto those rules, and the payroll owner approves the mapping.
  - Claude handles fuzzy cases with a confidence score. Low confidence means it asks instead of guessing.

## 6. Asking people and handling answers
- Always manager-first. A flag goes to the manager as a short report (what was flagged, the evidence, and a proposed message to the employee). The employee gets the message only after the manager approves it.
- Channels: the manager gets an SMS with a link to the report and approves in the dashboard. The employee gets an SMS.
- No answer by the payroll deadline:
  1. A reminder.
  2. Escalation to the payroll owner.
  3. If still unresolved at cutoff, only that employee's affected pay item is held (or paid on undisputed hours only), and everyone else is paid on time.
- After a fix, the agent re-syncs the source and re-checks before closing the flag.

## 7. Learning over time
- Onboarding: the agent reads the company's past pay periods and learns its patterns.
- After onboarding, it asks clarification questions about anything it couldn't work out, e.g. "Is Sam salaried? He never logs hours."
- Learning continues after every pay period, and the agent can ask clarifying questions at any time.
- Tiered self-improvement:
  - The agent learns and proposes freely.
  - Low-risk changes apply on their own and are logged: message wording, reminder timing, which report details managers respond to.
  - Changes that affect what gets flagged or what gets paid need the payroll owner's approval, then become standing policies.
  - Every change can be undone.
- Since every employee message still goes through the manager, "asks less over time" comes from fewer false flags and better reports.

## 8. Access, safety and audit
- The agent can read Jobber, QuickBooks and Gusto. It can write only the draft pay run in Gusto, and it submits only after the owner approves.
- Every flag, message, approval, policy change and submission is logged with who did it and the evidence.
- ? Audit log details to be decided.

## 9. Web app screens
- Our own website, mostly for approvals plus ways to interact with the agent:
  - manager inbox of flag reports with approve, edit or reject;
  - the payroll owner's final pay-run approval;
  - onboarding, including the agent's clarification questions;
  - proposed policies to approve;
  - an activity log.
- ? Exact layout to be decided.

## 10. Tech stack
- The most accurate model over a faster one: Claude Opus 5.5 for judgment calls and onboarding mapping.
- APIs: Jobber (GraphQL), QuickBooks Online, Gusto.
- Browser Use for the browser fallback.
- Twilio for SMS.
- ? Backend and frontend frameworks to be decided.

## 11. Sponsor tracks
- Devaj is handling sponsor tracks separately. This spec covers the product only.

## 12. Demo and proof
- Proof: the two seeded companies, planted errors with an answer key, and a detection score.
- ? The opening "moment" will be decided later.

## 13. Work split and timeline
- No opinion yet.

## 14. Open questions
- The opening moment for the demo.
- Whether and when to bring in the friend's real data.
- Audit log design and the exact web app layout.
