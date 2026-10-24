# Implementation plan handoff

Written 2026-10-24 ~12:30 AM PT by the previous planning chat, so a fresh chat can write the implementation plan without that conversation. Read this whole file first, then the files it points to.

## 1. The task for the new chat

Write an in-depth implementation plan for our Cal Hacks 13.0 build, once the final product spec exists.

- **Wait for Shanin's go-ahead** before writing the plan. Devaj is merging the three teammate specs into the final spec.
- **Input:** the final product spec (Devaj will commit it, likely `specs/final.md`). Where the final spec is silent, use this file.
- **Output:** the implementation plan in this repo, in the style of the BetterBill plans (see section 9), but better.
- **Then:** propose roles for the three teammates (section 4), so the team can decide who owns what.

## 2. Deadline and rules (confirmed from the Cal Hacks Devpost page)

- Submission deadline: **Sunday Oct 25, 9:00 AM PT, hard deadline.**
- Every teammate must be checked in at the venue (Palace of Fine Arts, SF) by **8:00 AM Sunday.**
- Planning starts around midnight Saturday, so about **33 hours** remain, minus time for the video and submission.
- **All work must be done during the hackathon.** Do not copy code from the earlier PayrollPilot repo; reuse ideas and lessons only.
- Teams of 2 to 4. We are 3.
- Submission needs: an image of the project, the GitHub repo, a pre-recorded or live demo. Pitch is 3 minutes plus 2 minutes of judge questions.
- Cal Hacks judging criteria: Application (real use, clear user), Intentionality (purposeful UX), Functionality (live demo runs smoothly, plus a video on Devpost for sponsors judging asynchronously), Creativity, Technical Complexity.

## 3. What Hyphenate is judging (our main track)

Hyphenate track: "The Hyphenated Enterprise: Autonomous Systems for Finance." Prizes $8,000 / $5,000 / $3,000, plus expedited interviews for the top 5. Shanin wants to win this and get an internship there.

**Official judging criteria (equally weighted), from the Cal Hacks prize page:**
1. **Is it real enough?** Realistic data, a messy problem, proof that it works.
2. **Would you hire it?** For which seats, and would it earn them: limited access, a clean record of its work, and knowing when to ask.
3. **Did we see something new?** A company, problem or approach not seen made autonomous before.
4. **The moment.** When it catches what others missed, recovers from something going wrong, or defends a decision when questioned.

Teams should bring: a demo video that opens with their moment; a live demo at judging (judges may ask us to try a scenario of their own); one line on the seats the system fills; proof it works (what's real, what's simulated, and how we know).

**The four pillars Hyphenate's engineers said to build to ("a path to top 3"). All four are P0:**
1. **Self-learning onboarding:** ingests historical data and learns the company's rules, policies and workflows.
2. **Autonomous runs:** runs each cycle on its own once trained.
3. **Escalation:** asks a human at the right time when confidence is low or context is missing.
4. **Self-improvement:** records each human intervention as a new rule, so it escalates less over time.

**Shanin's proposed self-improvement loop** (the plan should design around it): attempt a task → evaluate the result (against the human's answer, the answer key, or what actually got paid) → extract a lesson → save it → test that lesson on future tasks, keeping it only if it holds up. Lessons that would change what gets flagged or paid still need the owner's approval before they apply.

**Other workshop advice (Hyphenate team, Oct 23):**
- Keep it simple. A small number of agents that work well together beats a swarm nobody can debug. (The team leans toward 3 to 4 agents because it demos well; the plan makes the final call, see section 5.)
- Automate one whole function deeply (e.g. the full payroll cycle), not one isolated task.
- Precision over recall: "100% precision and 50% recall is okay." Escalate anything uncertain.
- Finance is formally verifiable: backtest learned rules on historical data, tie every rule to a past example, check invariants (amounts reconcile).
- Confidence scores on decisions; when a human rejects something, record the reason and use it to improve.
- Trust in the output matters more to finance users than security paperwork: controls and monitoring of what the agent does.
- Payroll data is highly confidential (often only ~2 people at a company can see it).
- Their customers are $100M+ revenue up to $40B. The pitch frames our real small company as proof, large service companies as the target.
- Script repeated browser actions instead of re-running a browser agent each time (cheaper, more reliable).
- Visualizations strengthen the pitch.
- Document the workflow first, then design the agent around it.

**Hyphenate's worked examples from the workshop** (useful for framing the demo):
- Coffee-chain tip splitting: onboarding reads 6 months of tip and payroll data and learns how tips split; it runs every week on its own; a new store with $310 in cash tips and no record escalates to the store manager; the manager's answer becomes a rule so next time no one is asked.
- Music-festival vendor payouts: learns commission structures from past contracts; a vendor disputes 15% vs. an email saying 10%; it escalates to the partnerships team and remembers the answer for similar disputes.
- Uber tolls: GPS data verifies whether a driver really paid a toll, replacing teams of manual checkers.
- Their summary: simple systems, high impact; the hard part is messy real data (refunds, chargebacks, disputes, mismatched contract vs. invoice amounts).

**More Hyphenate material:** the prize page links a "CalHacks_Hyphenate_Track" document (not read by the earlier chat). The repo's `docs/sources/` folder holds workshop notes and research (for example `docs/sources/hyphenate-workshop-slides.md`); read those too.

**Things shared privately by Hyphenate that must NOT appear in the repo, pitch or posts:** their funding, pricing, contract sizes, and internal roadmap (including any payroll product they're building).

## 3b. Other tracks we could enter

From the Cal Hacks prize page (https://hive.hackberkeley.org/prizes), read Oct 23. The plan should say which tracks to enter and what each needs from the build, and should not let a bonus track pull time from the Hyphenate P0 work. Prize amounts differ between Devpost and the live site; the live site is newer.

**Strong fits (no extra build, or the build already does it):**
- **Cal Hacks overall** (1st: MacBook Air; 2nd: Switch 2; 3rd: Google eyewear) and **Most Technically Complex Hack** (keyboards).
- **Microsoft "Built for the Real World"** (Surface laptops, FDE tech talk, mentorship; 2nd: "Customer Impact Award"): "build a production-minded AI agent that solves a meaningful problem in finance, productivity, healthcare, or another high-impact domain." Judged on customer understanding, measurable usefulness, path from prototype to production, responsible design, end-to-end functionality. No Microsoft tech required as listed.
- **Anthropic:** (1) a named community, not "students"; (2) a real problem you lived or heard firsthand; (3) it works: one thing done well and usable Monday; (4) thoughtful use of Claude, knowing where it could go wrong for users. Prize "coming soon."
- **MLH Commit Fellowship:** working prototype with a team, a real problem; opt in at submission and fill MLH's supplemental form.
- **MLH Best Use of Gen AI:** uses a public generative AI API (Anthropic counts).

**Fits if we make it part of the product (decide in the plan):**
- **Convex** ($5,000 on the live site): use Convex as the reactive backend so the dashboard updates live as replies arrive.
- **Creao AI** (three tracks, cash plus a launch program): Best AI-First Disruptor, Best One-Person Company, Best Team Empowerment. Criteria are in a Google Doc linked from the prize page, not read yet.
- **Factory Droid SDK** ($2,000): Droid must do real work in the running product on a trigger we design, with controls on what it can touch and its plans and steps visible; a README section on where Droid is used.
- **MLH Backboard:** only if Backboard is chosen for memory.
- **Apify** (up to $2,000, plus $400 Best Actor): only if the browser scripts run as Apify Actors in a meaningful way.
- **Atlassian Best Agent / Best Security Solution for Agents:** details in a linked Google Doc, not read.
- **Mana:** use Mana while building and link its pages; bonus if the project lives inside Mana.
- **MLH .Tech domain / GoDaddy domain:** cheap side entries if we register a domain.

**Poor fits or ruled out:**
- **Bright Data:** disqualifies scraping behind a login, which is all our data.
- **CRS:** requires its credit-data sandbox to be central.
- **Cartesia, ElevenLabs, Moss, Presage:** voice or personal-agent focused; only if we add voice.
- **Visa** (shopping), **Solana**, **Coinbase x402**, **Capital One Nessie**, **Snowflake**, **Tiger Data**, **Vultr**, **DigitalOcean**, **MongoDB**, **Auth0**, **Bitdeer**, **SpacetimeDB**, **Fetch.ai**, **Meta**, **Notability**, **SpaceXAI/Cursor**, hardware, planet-first: not a natural fit unless the stack choice happens to use one (for example MongoDB or Auth0 as the database or login).

## 4. Team and roles

- **Shanin:** owns the sandbox and seed data, the Jobber API side, the financial and payroll logic, and running the system on his real company's data. Runs a landscaping company and wrote its payroll runbook. Also enjoys UI and UX work.
- **Devaj** and **Varnika:** roles to be proposed by the plan. Their strengths are not yet known; ask Shanin.
- The plan should define **two other roles** for them. A sensible split (adjust to the final spec):
  - **Agent and backend:** syncing the systems with completeness checks, the checks engine, the agents and their handoffs, learning and memory, filling the Gusto draft, the audit log.
  - **Product, messaging and demo:** the owner dashboard and approval flow, onboarding screens, texting in and out and reading replies, escalation timing, the demo video, pitch and Devpost write-up.
- Note the tradeoff: Shanin could take dashboard design if the data side moves fast.

## 5. Product, as understood before the final spec

The final spec is the source of truth; this section is only background. Don't plan from the three individual teammate specs. Open them only if the final spec is unclear on something.

- An agent that runs a service company's payroll cycle: pulls Jobber, QuickBooks and Gusto data; checks it is complete; finds missing or wrong information; asks the right person (job manager or owner) by text; records the answer; learns the company's rules; fills the Gusto draft for the owner to review.
- Core insight: payroll software calculates correctly but assumes the inputs are right. In service businesses they often aren't: hours with no job, open timers, double-booked hours, job expenses paid by card or Venmo never added to the job, commissions that depend on who quoted in person.
- Known gap in the market: the standard Jobber-to-Gusto sync does not cover salaried, contractor or commission employee types.

**Decisions and conflicts the final spec should have settled (check them):**
- Demo data: Devaj's approach (two synthetic companies seeded into the real tools' developer sandboxes with planted errors and an answer key) was recommended, with planted errors drawn from Shanin's real problem register, and Shanin's real company as backtest proof.
- Submitting payroll: two of three specs say the agent never submits; the owner submits. Recommended.
- Who approves messages: owner by default; manager-first approval as an option for larger companies.
- Texting: Photon (decided; section 6).
- Agents: **open, the plan decides.** Earlier draft: four agents (Collector, Auditor, Messenger, Payroll preparer) coordinated by plain code that owns state, approvals and all math. The planner should choose the number and split that works best, weighing Hyphenate's advice (a few agents that work well together; one well-scoped agent is often enough for one workflow) against the team's preference for 3 to 4 agents because hand-offs demo well. Whatever the count, plain code owns state, approvals and money math. Explain the choice in the plan.

## 6. Tools and accounts: current state

| Item | State |
|---|---|
| GitHub repo | `Devaj6190/hyphenatable` (private). Local clone at `~/Development/Hackathons/hyphenatable`. No `.gitignore` yet; add one with `.env` before anyone creates a `.env`. |
| Jobber API | Shanin created a Jobber developer app "PayrollPilot (Dev)" with read scopes. Has client ID and secret (kept out of chat and repo). Callback URL: `https://payrollpilot.vercel.app/oauth/callback`; localhost callbacks are allowed automatically by Jobber. |
| Jobber sandbox | Jobber "developer testing accounts" are separate Jobber accounts (90-day trial) that work with the full GraphQL API, including mutations, so a seed script can create data. Recommended: a second Jobber app with write access used only to seed the test account; the product app stays read-only. Source: https://developer.getjobber.com/docs/getting_started |
| Vercel | Project `payrollpilot` in Shanin's Vercel account, serving a placeholder page at https://payrollpilot.vercel.app. Connect the GitHub repo to this project when the app exists. Do NOT deploy the repo as-is publicly; it contains private notes. Secrets go in with `vercel env add`. |
| QuickBooks | Developer sandbox companies exist (Devaj's spec). Real company data via export. |
| Gusto | Devaj's spec says Gusto has a demo environment for developers; unverified in this chat. Production API access needs Gusto partner approval, which won't happen this weekend. |
| Texting | **Decided: Photon** (Spectrum, iMessage). Worked live in the earlier build: an approved message reached the owner's phone and the reply came back into the app. Free tier uses shared lines and "limited" group messaging, so the demo texts the owner standing in for the job manager. Dedicated lines with full group messaging appear to need the Business plan (~$250 per line). Shanin has a Photon project and credentials; keep them in `.env` only. Docs: https://photon.codes/docs/spectrum-ts/getting-started |
| Memory | Core (it's the self-improvement pillar). **The planner chooses the best memory system.** What it must do: take new information, compare it with what it already knows from past cycles and answers, and learn from the difference (new pattern, confirmed pattern, contradiction to escalate). Shanin is not set on Backboard. Options seen so far: Backboard (memory API, `memory="Auto"`, memories shared across an assistant's threads, Python/JS SDKs, $5 free credits, MLH track), Cognee (open source knowledge graph; worked live in the earlier build, including recall after a restart), Mem0, Letta, or our own database plus embeddings. Confirmed pay rules must live in our own database regardless, because they drive money. |
| Browser access | Core (autonomous runs). Recommended: saved Playwright scripts for every repeated read; an AI browser tool (Browser Use or Stagehand) only to discover steps or recover when a page changes. Earlier Browser Use read of real Jobber: 58 entries in ~6.5 min for $0.63, but Jobber's day view hid entry IDs, approval status and a total to check against; the API may fix this. |
| Model | Claude, swappable. Devaj prefers Claude Opus 5.5 for judgment calls. |

## 7. Data assets (private, do not commit)

- **Payroll runbook** (Shanin's real company rules, 29 pages): `/Users/shanindrucquer/Downloads/Payroll runbook for Claude.pdf`. This is the answer key for learned rules: the agent is not given it; we grade learned rules against it.
- **Problem register** (answer key for detection): `/Users/shanindrucquer/Downloads/Payroll-Problem-Register.csv`. 125 real problems across 3 pay periods (Aug 24 to Sep 6: 41; Sep 7 to 20: 31; Sep 21 to Oct 4: 47; 6 undated). Each row: what was seen, where, who answered, the correct answer, what changed, what it affected. Most common areas: unmatched material purchases, bank charges missing from Jobber, costs counted twice, disposal not linked to its parent job, hours with no job, overlaps, long or open shifts, zero-minute entries, missing Venmo rates, stale rates inflating job profit, wrong in-person quoter, a deposit mistaken for a final payment. Several rows are mistakes the earlier AI agent made; use them as test cases. Contains real names and local paths: use a de-identified copy for the team.
- **Current real pay cycle** has double-booked hours right now: the planned opening "moment."

## 8. Privacy and law (from research; not legal advice)

- No general US federal law bars an employer from sharing pay internally; risks come from contracts, discrimination, or payroll staff leaking without permission.
- Workers' right to discuss their own pay is protected (NLRA). Never build anything that restricts it.
- Pennsylvania: employers must take reasonable care with Social Security and bank numbers (Dittman v. UPMC, 2018); a breach-notice law covers them. Do not collect them at all.
- Medical information must be kept separate (ADA). Never pull leave or medical reasons.
- Product rules: collect the minimum; role-based views (job manager never sees others' pay); texts carry worker, date, job and hours, never pay amounts; send the model only what each step needs with IDs instead of names; access log; retention and deletion; fake names on every screen, in the repo and in the video.

## 9. How the plan should look

Model it on the BetterBill plans at `~/Development/Hackathons/BetterBill/docs/plans/` (`00-shared-context.md`, `00-team-brief.md`, and the A to D role plans): binding shared context, exact contracts, role ownership, dependency gates, detailed tasks, acceptance tests, fallbacks. Do not copy BetterBill's medical-billing content or stack.

Required in the plan:
- **Tools and stack** chosen and justified, with anything unverified labeled and given a first-hour check.
- **P0 / P1 / P2** priorities. P0 = all four Hyphenate pillars working end to end, the live demo, and the demo video. Every P0 task names which Hyphenate criterion or pillar it serves.
- **Tasks** each with ID, priority, owner role, owned files, dependencies, what's safe to start before dependencies land, acceptance test, verification command, time estimate, fallback.
- **Gates** with clock times and a named owner (e.g. "first real text round trip works").
- **A cut order** for when the team falls behind.
- **Stage 2 comes before running on Shanin's real business.** Stage 2 = financial reconciliation, job profit, quote and marketing commissions, tips and the manager split. Many of the real errors (missing job expenses, costs counted twice, disposal not linked to its parent job, stale rates inflating profit, wrong in-person quoter) only matter because profit drives the manager percentages and commissions. Without Stage 2, the real-data run can't show why those errors matter. The planner should decide whether Stage 2 is P0 or the first P1, and justify it.
- **Stretch order if ahead:** (1) Stage 2, if not already P0; (2) run on Shanin's real current cycle and catch the double-booked hours live; (3) a second company to prove it generalizes; (4) UI polish and rehearsal.
- **Measured proof:** precision and recall against the problem register; learned rules vs. the runbook; questions asked in cycle 1 vs. cycle 2.
- **Demo and pitch** owned from hour one: video opening with the moment, live demo, judge-scenario readiness, Devpost text, project image.
- **Two proposed roles** for Devaj and Varnika, plus Shanin's role, for the team to assign.

## 10. Lessons from the earlier build (PayrollPilot, Oct 20)

- **Data came last, so the demo ran on fixtures.** This time, seed the sandbox and pull real data first.
- **A stacked pull request merged into a side branch, not main,** so its code silently never shipped. Use one simple rule: every PR targets `main`, and someone checks main has the code after merging.
- **The plan was too big for the time.** Size it to 3 people and ~33 hours, with a real cut order.
- **Text messages were too long and unclear.** Design short, one-question messages with tap-to-answer options.
- **The UI started as a dense debugging screen; the owner wanted it super simple.** Owner view: payroll stage, "here's what we need from you" with one-tap actions, and details one click away.
- **Real integrations worked once tried:** a real iMessage round trip, a real browser read of Jobber, real memory recall after restart. Prove each integration in the first hours.
- **The lead lost time relaying between sessions.** Put decisions in repo files, not chat.

## 11. Open questions to resolve early

- Memory tool.
- Gusto access: is the demo environment usable this weekend, and can the agent fill a draft there?
- Does the Jobber API expose entry IDs and approval status?
- Each teammate's strengths, to finalize roles.
- Backtest: which past cycles, and how to recreate their "before" state (the problem register helps).
