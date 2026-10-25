# Devpost submission text

Owner: Varnika (C). v0 skeleton, Sat Oct 24. Paste from here into Devpost; edit here first. Sources: `docs/plans/C-product-messaging-demo.md` section 8.4, `specs/final.md`, `docs/sources/plan-research.md` sections 1 to 3. **[TODO]** marks what the plan doesn't answer yet; **[measured at G3]** marks a number that must come from `eval/results.json` / `docs/PROOF.md`.

Rules for every word below: fake names only; no pay amounts; no real company names, runbook contents or problem-register rows (counts only); nothing Hyphenate shared privately (funding, pricing, contract sizes, roadmap); a target is never presented as a result.

Deadlines: draft submitted **Sat 23:00**; final text pasted by **Sun 08:30**; submitted by **Sun 08:40**, confirmed on a second device (hard deadline 09:00).

---

## Project name
PayrollPilot

## Tagline (elevator pitch)
It checks the pay before the paycheck.

## Seats it fills (Hyphenate asks for this line)
PayrollPilot fills the seat of the person who prepares and checks payroll before it is submitted, and the half-seat of the job manager who answers "whose hours are these?" every other Friday.

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

The moment: Sam Okafor (a fake worker) has two overlapping entries on the same day. PayrollPilot catches it before the Gusto draft is filled, his manager approves one text, Sam replies, the owner approves the correction in the workbook (never in Jobber), and only Sam's disputed hours were held in the meantime.

## How we built it
- **Convex** for the database, scheduler, live queries, HTTP actions and vector search, with a **Next.js 16** dashboard (Tailwind, shadcn).
- A small **Bun** worker (the courier) running Photon's `spectrum-ts` for one-to-one iMessage/SMS, with iMessage polls for tap-to-answer. Phone numbers never leave the courier; Convex only sees a hash.
- **Jobber GraphQL** (a trial account seeded with our synthetic company), the **Gusto demo API** (draft-only: prepare, update, calculate), and **QuickBooks Online** sandbox **[TODO: confirm once H3 passes]**.
- A pure TypeScript engine with **23 checks** (CHK-01 to CHK-23), Stage 1 and Stage 2 payroll math, and Vitest tests on every check.
- Three **Claude** agents over that engine, each returning a validated schema and never acting on its own: **Analyst** (learns rules, backtests), **Auditor** (fuzzy matches and corrections), **Messenger** (drafts questions, interprets replies). Claude Opus 5.5 for judgment, Haiku 5.5 for reply interpretation.
- Lessons stored with embeddings **[TODO: Voyage or OpenAI, whichever shipped]** and a classifier that marks each new lesson as new, confirmed, superseded or in conflict.
- An append-only audit log that traces every number to the record, rule or person behind it.

## What's real, what's simulated, and how we know
- **Real:** the Jobber trial account (users, clients, properties, jobs, visits, quotes, invoices and expenses, read through the API), the Gusto demo environment (employees, compensations, the current unprocessed payroll), the texts **[TODO: once H4 passes]**, and a real company's past cycles, anonymized at ingest, for the backtest.
- **Synthetic:** Company A (a 13-person landscaping crew) and Company B, their people, jobs and hours. Time entries and payment records load from fixtures because the Jobber API can't create them; Company A's past payrolls come from fixtures too. Any reply produced by the simulated-manager persona is labelled Simulated. Must match `docs/PROOF.md` section 1.
- **How we know:** 29 planted errors with an answer key in cycle 1 (covering 22 of the 23 checks): precision **[measured at G3]**, recall **[measured at G3]**. Learned rules graded against the owner's runbook, which the system never saw: **[measured at G3]** (aggregate only). The real company's past cycle matched to the cent: **[measured at G3]**. Full statement in `docs/PROOF.md` **[TODO: link once it exists]**.

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
- Manager login (in the demo a role switch stands in).
- A second real company.
- **[TODO: anything cut from the plan's stretch list]**

## Built with
TypeScript, Bun, Next.js, React, Tailwind CSS, shadcn/ui, Convex, Claude (Anthropic API), Photon Spectrum, Jobber API, Gusto API, QuickBooks Online API, Zod, Vitest, Biome. **[TODO: add Playwright, Voyage AI or OpenAI embeddings, Backboard, Apify only if they shipped]**

## Try it out
- GitHub repo: https://github.com/Devaj6190/hyphenatable **[TODO: it is private; follow the organizers' instructions to grant judges access, and check `data/private/` and `.env` are absent]**
- Demo video: **[TODO: YouTube unlisted link, under 3:00, opens on the moment]**
- Live app: **[TODO: Vercel URL, or say the live demo is at the table]**

## Media
- Project image, 1280×720 PNG: the owner home at cycle 2 with one FlagCard showing `rule: certain` and a precedent, the phone with the text overlaid bottom-right, the label chips visible, "PayrollPilot" top-left. Exported from the real UI, fake names only. **[TODO: export after G3]**
- Video: as above.

## Team
- Varnika: product, messaging and demo.
- Devaj: agent and backend.
- Shanin: data and payroll.
**[TODO: add each teammate to the Devpost project]**

---

## Track and sponsor answers

### Hyphenate (main track)
- Seats line: above.
- Is it real enough? Real Jobber and Gusto sandboxes, a real company's cycles anonymized, completeness on every pull, planted errors with an answer key and measured precision and recall.
- Would you hire it? Read-only sources, draft-only Gusto with no submit function, segregation of duties on rules, every number traceable in the audit log, confidence and precedent on every flag, held items instead of guesses.
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
- Claude does what matters (rule extraction from history, fuzzy matching, question drafting, reply interpretation); code does the money.

### Convex
**[TODO: one paragraph once the backend is built]**: scheduler for reminders and syncs, live queries for the owner home and LiveFeed, vector search for lessons, HTTP actions.

### MLH
- Best Use of Gen AI: opt in.
- Commit Fellowship: opt in and fill the supplemental form. **[TODO: form link]**
- Backboard: only if the lessons mirror (B-18) shipped. **[TODO]**

### Other tracks
Creao: **[TODO: Devaj reads the restricted criteria doc or asks at the booth]**. Apify: only if the Playwright reader shipped as an Actor. **[TODO]**

---

## Submission checklist
- [ ] Draft submitted Sat 23:00 with a placeholder video.
- [ ] Teammates added.
- [ ] Image uploaded.
- [ ] Repo access for judges per the organizers; `data/private/` absent; no `.env`.
- [ ] Video opens on a phone over cellular.
- [ ] Hyphenate track selected; the four-pillar text present.
- [ ] MLH categories opted in; Commit Fellowship form submitted.
- [ ] Final text pasted from this file by 08:30.
- [ ] Submitted by 08:40; confirmation screen photographed; checked on a second device.
