# Devpost submission text

Owner: Varnika (C). v0 skeleton, Sat Oct 24. Paste from here into Devpost; edit here first. Sources: `docs/plans/C-product-messaging-demo.md` section 8.4, `specs/final.md`, `docs/plan-research.md` sections 1 to 3. **[TODO]** marks what the plan doesn't answer yet; **[measured at G3]** marks a number that must come from `eval/results.json` / `docs/PROOF.md`.

Rules for every word below: fake names only; no pay amounts; no real company names, runbook contents or problem-register rows (counts only); nothing Hyphenate shared privately (funding, pricing, contract sizes, roadmap); a target is never presented as a result.

Deadlines: draft submitted **Sat 23:00**; final text pasted by **Sun 08:30**; submitted by **Sun 08:40**, confirmed on a second device (hard deadline 09:00).

---

## Project name
RollPay

## Tagline (elevator pitch)
It checks the pay before the paycheck.

## Seats it fills (Hyphenate asks for this line)
RollPay fills the seat of the person who prepares and checks payroll before it is submitted, and the half-seat of the job manager who answers "whose hours are these?" every other Friday.

## Inspiration
- One of us runs a small service company and does payroll every other Friday. Payroll software does the math right; it assumes the inputs are right. In service businesses they aren't.
- That company's problem register: **[TODO: count]** real payroll-input problems over three pay periods (counts only, no rows).
- The Gusto–Jobber gap: Gusto's own support page says the Jobber sync doesn't cover salaried, contractor or commission workers. **[TODO: paste the exact quote and link from `docs/sources/`]**

## What it does
The four pillars, in Hyphenate's words:

- **Learns.** It reads a company's past pay cycles in Jobber, QuickBooks and Gusto and proposes the company's rules (overtime, Venmo rates, who answers what, expense kinds), each with the records behind it. What it can't work out, it asks.
- **Runs.** Every cycle it syncs all three systems and proves each pull is complete, runs a deterministic engine of 23 checks over hours, jobs, expenses and pay, computes pay to the cent, and fills the Gusto draft. It never submits.
- **Escalates.** When something is missing or contradictory, it holds only that item and texts the right person one short question with numbered options, a confidence and a precedent note. The manager approves every message to an employee before it goes out. Texts never carry pay amounts.
- **Improves.** Every answer becomes a lesson, is compared with what it already knows, is backtested over past cycles, and becomes a rule only when the owner approves it. The person who answered can't be the one who approves. Cycle 2 asks fewer questions: **[measured at G3]** vs **[measured at G3]**.

The moment: Sam Okafor (a fake worker) has two overlapping entries on the same day. RollPay catches it before the Gusto draft is filled, his manager approves one text, Sam replies, the owner approves the correction in the workbook (never in Jobber), and only Sam's disputed hours were held in the meantime.

## How we built it
- **Convex** for the database, scheduler, live queries, HTTP actions and vector search, with a **Next.js 16** dashboard (Tailwind, shadcn).
- A small **Bun** worker (the courier) running Photon's `spectrum-ts` for one-to-one iMessage/SMS, with iMessage polls for tap-to-answer. Phone numbers never leave the courier; Convex only sees a hash.
- **Jobber GraphQL** (a trial account seeded with our synthetic company), the **Gusto demo API** (draft-only: prepare, update, calculate), and **QuickBooks Online** sandbox **[TODO: confirm once H3 passes]**.
- A pure TypeScript engine with **23 checks** (CHK-01 to CHK-23), Stage 1 and Stage 2 payroll math, and Vitest tests on every check.
- Three batch agents on **Creao** over that engine, started by our Convex controller through Creao's API Trigger, each returning a validated schema and never acting on its own: **Analyst** (proposes rules from history, which code backtests), **Auditor** (fuzzy matches, a morning list, vague-case flags that only ever become questions), **Messenger** (drafts questions for person-routed flags). They run on Claude Opus 5.5 and read and write only through our own HTTP API. Creao only ever sees ids. Reading a worker's reply stays in our code: numbers, poll votes and `STOP` by code, free text by Haiku 5.5. Agent ids and the run share link: TODO(S7).
- Lessons stored with embeddings **[TODO: Voyage or OpenAI, whichever shipped]** and a classifier that marks each new lesson as new, confirmed, superseded or in conflict.
- An append-only audit log that traces every number to the record, rule or person behind it.

## What's real, what's simulated, and how we know
Every number cites `docs/PROOF.md`. "Measured at G3" means not measured yet.

| Item | Real or simulated | Number | Synthetic? | Source |
|---|---|---|---|---|
| Jobber trial | real records for users, clients, properties, jobs, visits, quotes, invoices, expenses; time entries and payment records from fixtures (the API cannot create them) | none quoted | Company A is synthetic | PROOF.md section 1 |
| Gusto demo | employees, compensations and the current unprocessed payroll are real in the demo; past payrolls from fixtures; no submit in the code | none quoted | Company A is synthetic | PROOF.md section 1 |
| QuickBooks sandbox | real records in our own sandbox | cycle 1 purchases match 6 of 6 | synthetic | PROOF.md section 1 |
| Company A | seeded landscaping crew | 14 worker records, 12 of them the crew | synthetic | PROOF.md section 2 |
| Company R | real past timesheets and pay, anonymized at ingest | 283 entries, 188 payroll rows, 8 pay periods | real, anonymized | PROOF.md section 3 |
| Backtest on Company R | Stage 1 gross vs what was actually paid | 35 of 46 worker pay periods match to the cent; 44 of 46 within $1 | real, anonymized | PROOF.md section 4 |
| Backtest self-check, Company B | payroll math on four past weekly cycles | 120 of 120 worker-cycles match to the cent | synthetic | PROOF.md section 4 |
| Planted-error precision and recall, questions in cycle 2 vs cycle 1, rules vs the owner's runbook | not yet measured | measured at G3 | synthetic (Company A) | PROOF.md section 5 |
| Creao agent runs | real Creao runs once the spike passes; ids only | not yet measured | TODO(S7): agent ids and run share link | `docs/INTEGRATIONS.md` row H9 |
| Texts | real iMessage through Photon on registered demo phones; simulated-manager replies are labelled Simulated | live round trip tested: owner approve → text in 3 s → reply back in 49 s → correction proposed | demo personas are fake | `docs/INTEGRATIONS.md` rows H4, H5 |

Learned rules are graded against the owner's runbook, which the system never saw (aggregate only). Full statement: `docs/PROOF.md`.

## Challenges we ran into
- Inbound texts carry no thread id, so each conversation holds at most one open question, and polls tie votes back to their question.
- The Jobber API can't create time entries, so our synthetic hours load from fixtures while everything else lives in the real Jobber trial.
- Gusto's demo can't create processed payroll history without submitting, so pay history for the 25% catch-all comes from fixtures.
- Photon's free shared line won't send the first message to a newly registered phone.
- Proving each pull is complete (pulled vs expected) before trusting it.
- Segregation of duties in a 36-hour build: nothing changes without a person's approval, and the agent can never approve its own proposal.

## Accomplishments that we're proud of
**[TODO: write at G3 from what actually shipped.]** Candidates: the live text round trip; cycle 2 asking fewer questions; the backtest to the cent; zero pay amounts in any text.

## What we learned
**[TODO: write at G3.]** Candidates: payroll errors live in the inputs, not the math; a model is most useful when it returns a schema that code checks; most of the work is deciding when to ask.

## What's next
- Gusto production partner approval.
- Manager login (in the demo a role switch stands in; the texted link already opens the manager view).
- A second real company.
- **[TODO: anything cut from the plan's stretch list]**

## Built with
TypeScript, Bun, Next.js, React, Tailwind CSS, shadcn/ui, Convex, Creao, Claude (Anthropic API), Photon Spectrum, Jobber API, Gusto API, QuickBooks Online API, Zod, Vitest, Playwright, Biome. **[TODO: add Voyage AI or OpenAI embeddings, Backboard, Apify only if they shipped]**

## Try it out
- GitHub repo: https://github.com/Devaj6190/hyphenatable **[TODO: it is private; follow the organizers' instructions to grant judges access, and check `data/private/` and `.env` are absent]**
- Demo video: **[TODO: YouTube unlisted link, under 3:00, opens on the moment]**
- Live app: **[TODO: Vercel URL from Devaj, or say the live demo is at the table]**

## Media
- Project image, 1280×720 PNG: the owner home at cycle 2 with one FlagCard showing `rule: certain` and a precedent, the phone with the text overlaid bottom-right, the label chips visible, "RollPay" top-left. Exported from the real UI, fake names only. **[TODO: export after G3]**
- Video: as above.

## Team
- Varnika: product, messaging and demo.
- Devaj: agent and backend.
- Shanin: data and payroll.
**[TODO: add each teammate to the Devpost project]**

---

## Track and sponsor answers

### Creao: Best One-Person Company
- Track: Best One-Person Company, plus Hyphenate. TODO(S7): check on Devpost whether both can be selected.
- Three batch agents behind our controller: Auditor, Messenger, Analyst. One saved agent per role, started by our Convex controller through the API Trigger. Proposals only; a person approves everything, and plain code owns the money.
- Creao only ever sees ids.
- "Remove the agent, and this product dies. Without the Analyst there are no rules learned from history; without the Auditor, no fuzzy matches or morning list; without the Messenger, no questions. What's left is a calculator."
- Agent ids: TODO(S7) Auditor, TODO(S7) Messenger, TODO(S7) Analyst. Run share link: TODO(S7).
- The demo shows a Creao run in progress and the org chart (`docs/DEMO.md`).

### Hyphenate (main track)
- Seats line: above.
- Is it real enough? Real Jobber and Gusto sandboxes, a real company's cycles anonymized, completeness on every pull, planted errors with an answer key and measured precision and recall.
- Would you hire it? **Limited access:** read-only sources; draft-only Gusto with no submit function; the manager's view never carries a pay amount (stripped on the server, proven by an end-to-end test that also scans every network response), and the manager's texted link opens their inbox as the manager; the agents see ids only. **A clean record:** an append-only audit log where every pull, flag, text, answer, correction and rule change names who did it, and the owner home shows each agent's latest run and the Auditor's brief. **Knows when to ask:** checks fire only on exact conditions; anything that needs judgment becomes a question with a confidence and a precedent, a vague case becomes an AGT-01 flag ("Unusual case, needs your decision") routed to the owner, and a held item is never guessed at.
- Did we see something new? Payroll inputs verified across three systems before the payroll tool runs; workers outside the official sync handled; fixes made at the source are re-checked on the next sync; owner-approved, backtested rules with provenance.
- The moment: Sam Okafor's overlapping hours, caught before the draft is filled.

### Microsoft: Built for the Real World
- Customer: owners and bookkeepers of 10 to 500-worker service companies who run their own payroll.
- Measurable usefulness: questions per cycle, corrections caught before submit, hours of checking replaced, all measured **[measured at G3]**.
- Prototype to production: OAuth per company, Gusto partner approval, SOC 2 scope (read-only sources, draft-only writes, audit log, retention).
- Responsible design: no personal data beyond ids, segregation of duties, precision over recall, STOP honoured in code.
- End to end: the live loop at the table.

### Anthropic
- Named community: owners of small service companies who run their own payroll.
- Real problem: one of us lives it every other Friday.
- It works: one loop done well, from flag to text to approved correction to filled draft.
- Where Claude could go wrong for these people, and what we did:
  - Misreading a terse reply ("03") as an answer: a fixed schema, a confidence, and one follow-up before the item is held.
  - Proposing a rule from a coincidence: backtests over past cycles and owner approval.
  - Following instructions hidden in data: data is never instructions, enforced in code.
  - Leaking pay: the model sees ids only, and texts never carry amounts.
- Claude does what matters (rule extraction from history, fuzzy matching, question drafting, reply interpretation); code does the money. Claude sees ids, never names or phone numbers.

### Convex
Convex is the whole backend: the database and schema (mirrored by a zod contract with a drift test), the controller that owns each cycle's stage and approvals, the checks runner, the scheduler for syncs, reminders and question expiry, the HTTP actions the Creao agents and the courier talk to, and live queries that keep the owner home, flag pages, Agents section and LiveFeed current without a refresh. The audit log is an append-only Convex table (CI greps that nothing patches or deletes it). A manager's query is redacted on the server by viewer id, so pay never leaves Convex for a manager.

### MLH
- Best Use of Gen AI: opt in.
- Commit Fellowship: opt in and fill the supplemental form. **[TODO: form link]**
- Backboard: only if the lessons mirror (B-18) shipped. **[TODO]**

### Other tracks
Apify: only if the Playwright reader shipped as an Actor. **[TODO]**

---

## Submission checklist
- [ ] Draft submitted Sat 23:00 with a placeholder video.
- [ ] Teammates added.
- [ ] Image uploaded.
- [ ] Repo access for judges per the organizers; `data/private/` absent; no `.env`.
- [ ] Video opens on a phone over cellular.
- [ ] Hyphenate track selected; the four-pillar text present.
- [ ] Creao track (Best One-Person Company) selected; agent ids and run share link filled in (TODO(S7)).
- [ ] MLH categories opted in; Commit Fellowship form submitted.
- [ ] Final text pasted from this file by 08:30.
- [ ] Submitted by 08:40; confirmation screen photographed; checked on a second device.
