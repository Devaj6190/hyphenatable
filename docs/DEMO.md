# RollPay demo kit

Owner: Varnika (C). v0, Sat Oct 24. Sources: `docs/plans/C-product-messaging-demo.md` section 8, `specs/final.md` section 12, and the Company A fixtures in `data/fixtures/a/`. Every name here is fake. No pay amounts appear in any text, on the manager's or employee's screens, or in this file. Anything marked **[measured at G3]** is a placeholder until `eval/` and `docs/PROOF.md` have the real number; a target is never shown as a result.

## 1. Cast and facts

**Company A** (`data/fixtures/a/company.json`): a synthetic landscaping crew in Pennsylvania (`America/New_York`), paid biweekly. **13 active people** (14 on file, one inactive): 8 hourly field workers, 1 salaried crew lead, 2 contractors paid by Venmo, 1 manager, 1 owner.

| Role in the demo | Fake person | Who plays it | Gets texts? |
|---|---|---|---|
| Owner | Skyler Ashford (`a-w12`) | the laptop, owner view | No. The owner works in the dashboard only. |
| Manager | Dakota Brennan (`a-w11`) | Shanin's phone, `contact:a-w11` | Yes: the manager page |
| Employee | Sam Okafor (`a-w03`) | Varnika's phone, `contact:a-w03` | Yes: the question about his own hours |

**Cycles.** Cycle 1 is `a-c05` (Sat Oct 10 to Fri Oct 23, cutoff Fri Oct 23, 6:00 PM ET). Cycle 2 is `a-c06` (Sat Oct 24 to Fri Nov 6).

**Checks.** The catalogue has **23 checks** (CHK-01 to CHK-23, shared context section 9). Cycle 1 plants **29 errors** covering CHK-01 to CHK-22, with an answer key. Cycle 2 plants 31, and 9 of them can be settled by rules learned in cycle 1, which is where "fewer questions" comes from.

**What's real, what's synthetic (say it exactly this way).** The people, jobs and hours are synthetic. Company A's users, clients, properties, jobs, visits, quotes, invoices and expenses live in a real Jobber trial account and are read through the Jobber API. Its time entries and payment records are loaded from fixtures, because the Jobber API cannot create them. Its employees, compensations and current unprocessed payroll live in the real Gusto demo environment; its past payrolls come from fixtures. (Same as `docs/PROOF.md` section 1.) QuickBooks: the sandbox row (H3) is still unverified in `docs/INTEGRATIONS.md`; until Shanin confirms it, say "QuickBooks sandbox" only if PROOF.md section 1 says so. The texts are real iMessage through Photon, tested end to end on both demo phones: owner approves in the dashboard, the text lands in 3 s, the reply is back in 49 s and shows as a proposed correction (`docs/INTEGRATIONS.md` rows H4, H5). Anything the simulated-manager persona writes carries a red **Simulated** chip. Creao: the Auditor, Messenger and Analyst are saved Creao agents that see ids only and return proposals; their status is the H9 row of `docs/INTEGRATIONS.md`, and until it is tested the run shown at 1:55 is **[TODO(S7)]**, not a result.

**Live Convex vs fixtures.** The dev Convex deployment holds one company, **"Sample Landscaping (synthetic)"** (3 workers, one cycle Oct 5–18, 5 flags). It is not Company A: Company A's fixtures are not loaded in Convex. The home body and the manager inbox render from the Company A fixtures; flag detail pages and the Agents section read Convex live. Never call the live company "Company A" on stage.

## 2. The opening moment (video 0:00 to 0:20)

**The catch.** Sam Okafor logged two entries on **Wed Oct 14**, both on Job 102 (Backyard patio and drainage, Birchwood Ave): **7:00 to 15:30** (`a-te-0111`) and **12:00 to 16:00** (`a-te-0113`). They overlap by 3.5 hours, so 12.5 hours are logged for that day. The answer key (`a-ak-04`) says the afternoon entry was Job 104 (Retaining wall rebuild, Foxglove Ct) and Sam left Job 102 at 12:00. That means 9 hours, split across two jobs. This is CHK-04 (overlap), planted error `a-ak-04`.

Labels on screen the whole time: `synthetic` and `planted error a-ak-04`.

| # | Time | Screen / shot | On screen | Voice (Shanin) |
|---|---|---|---|---|
| 1 | 0:00 | Owner home, cycle 1, stage tracker on **Asking** | The FlagCard: "Two entries overlap on Wed Oct 14: 7:00 to 15:30 and 12:00 to 16:00, both on Job 102." Chips: `rule: certain`, `no precedent`, `route: manager`; the source chip shows the two entry ids and `synthetic` (hours come from fixtures, not Jobber). Only Sam's Oct 14 hours show as **held**; the counts show everyone else going through. | "This is the error that was in my real payroll, planted here with an answer key." |
| 2 | 0:04 | Manager summary arrives on Shanin's phone (filmed, or iPhone mirroring) | `Hi Dakota, before we run payroll (Oct 10–23) there are 10 timesheet items to check, mostly duplicate or zero-hour entries.` then `Details here: <DASHBOARD_URL>/c/a/manager?as=manager` (10 = the manager-routed planted errors in cycle 1; use the live count). The link line appears only when `DASHBOARD_URL` is set in `apps/courier/.env`; `?as=manager` opens the inbox in the manager view, so the phone never lands as the owner. | "RollPay caught it before the Gusto draft..." |
| 3 | 0:07 | Manager inbox, opened from the link on the phone (or role switch: Manager on the laptop) | The ApprovalSheet with the exact text to Sam, recipient `employee`, options preview. Dakota taps **Approve and send**. No pay anywhere on this screen. | "...asked my manager to OK one question..." |
| 4 | 0:10 | Varnika's phone (Sam) | `Sam, on Wed Oct 14 two entries overlap (7:00-15:30 Job 102 and 12:00-16:00 Job 102). Which one is right? 1 7:00-15:30 Job 102 2 12:00-16:00 Job 102 3 both, different jobs 4 neither` (180 characters) | "...and texted the worker." |
| 5 | 0:13 | Phone, then the dashboard LiveFeed | Sam replies: `3. The 12 to 4 was the Foxglove wall, I left Birchwood at noon`. The reply lands in the LiveFeed; the interpretation reads in plain words: "change: 12:00 to 16:00 is Job 104; 7:00 entry ends at 12:00." | |
| 6 | 0:16 | Problem detail, owner view | CorrectionDiff: `a-te-0111` end 15:30 → 12:00; `a-te-0113` job 102 → 104. Sam's Oct 14 hours 12.5 → 9.0. Job profit effect on both jobs. Owner taps **Approve**; "applied to workbook v{n}"; the held hours are released. | "It fixed the workbook, not Jobber." |
| 7 | 0:20 | Cut to title card | | |

Shot notes:
- Browser at 1280×800 for the dashboard, recorded with QuickTime. Phones recorded with iPhone mirroring in QuickTime, or filmed with a second phone. Captions burned in for the labels.
- Record the reply live from the phone, with the courier running (`bun run courier`, wait for "connected to Photon"). Only if the signal fails, use `demo.simulatedReply` and keep its **Simulated** chip visible. Never hide it.
- If unclear replies need the bounded follow-up, it reads: `Thanks. To confirm: the 12:00-16:00 entry was Job 104 and you left Job 102 at 12:00. Reply 1 yes, 2 no`. Only one follow-up is ever sent; after that the item stays held.
- Real-company version (stretch A-16): the same catch on the real company's current cycle, labelled `real, anonymized`. Decide by Sun 00:00; otherwise this synthetic version is the moment.

## 2b. The rest of the video (0:20 to 3:00)

One segment per Hyphenate judging question, in the order the judges ask them, with the moment already answered at 0:00. Total 3:00. Voice is Shanin unless marked; about 2.5 words a second, so a 10-second shot gets 25 words at most. Every number spoken is in `docs/PROOF.md` today; anything else stays **[measured at G3]** and is cut if it is not measured by recording time. Label chips (`synthetic`, `real, anonymized`, `Simulated`) stay in frame in every shot that shows data.

| Time | Judge question | Shot (1280×800 browser unless noted) | On screen | Voice |
|---|---|---|---|---|
| 0:20 | | **Title card.** "RollPay" top-left, the seats line underneath, nothing else. | *RollPay fills the seat of the person who prepares and checks payroll before it is submitted, and the half-seat of the job manager who answers "whose hours are these?" every other Friday.* | "RollPay fills the seat of the person who checks payroll before anyone hits submit. Payroll software does the math right. It assumes the inputs are right. In service businesses they aren't." |
| 0:32 | **1. Is it real enough?** | Owner home, top. Hold on the header chip, then the "Run this payroll" card. | `synthetic · Company A, cycle 5`; "14 people · 12 in Gusto, 2 on Venmo"; "We pull Jobber, QuickBooks and Gusto, run 23 checks and tell you what needs you. Nothing is submitted." Under it: "Cycle dates from data/fixtures/a/cycles.json · synthetic". | "Every screen says where its data came from. Company A is synthetic: 29 planted errors with an answer key, seeded into a real Jobber trial and Gusto demo." |
| 0:44 | 1 | Owner home in demo mode, stage tracker on **Collecting**, then **Checking** (the DemoBar's Next steps it). | "Pulling this cycle from Jobber, QuickBooks and Gusto…", the sync strip with pulled vs expected counts, then "Starting checks…" and flags appearing. | "Every pull proves it is complete, pulled against expected, before anything is trusted. Then 23 deterministic checks run over hours, jobs, expenses and pay." |
| 0:54 | 1 | **Proof card** (a slide, or `docs/PROOF.md` section 4 on screen, zoomed). | "Company R: a real company's past cycles, anonymized at ingest. Stage 1 gross vs what was actually paid: **35 of 46** worker pay periods to the cent, **44 of 46** within $1." Label: `real, anonymized`. | "The payroll math also ran on a real company's past cycles, anonymized: thirty-five of forty-six to the cent, forty-four within a dollar. Not a toy." |
| 1:06 | **2. Would you hire it?** Limited access | Shanin's phone (iPhone mirroring): the manager's text, tap the link, the manager inbox opens. | The text: "Hi Dakota, before we run payroll (Oct 10–23) there are 10 timesheet items to check… Details here: …/c/a/manager?as=manager". The inbox: "You are seeing Dakota's inbox. Dakota sees hours, jobs and record ids here, never pay." and "10 things to check before payroll". No dollar sign anywhere. | "Limited access. The manager gets one text and one page: hours, jobs and ids. Pay is stripped on the server, and a test fails the build if a dollar ever reaches that phone." |
| 1:20 | 2. Clean record | Audit page: the org chart card, then the log scrolling slowly. | "Controller: plain code starts every run and owns state, approvals and money. Agents never start each other." "Auditor: flagged 1, routed 1 to Messenger." "Messenger: drafted 1 question, read 2 replies." "Analyst: proposed 1 rule." "Owner or manager: approves every text, correction and rule before anything happens." Then rows: pull, flag, message, answer, correction, each with its actor. | "A clean record. Every pull, flag, text, answer and correction is one row in an append-only log that names who did it, person or agent. Nothing in here can be edited." |
| 1:32 | 2. Knows when to ask | Demo panel, "Try your own case": pick "A purchase arrived with an expense category we have never seen." The flag appears on the home. Open it. | FlagCard chips: confidence, `no precedent`, `route: owner`; only that item held. Flag detail: "What happened", the options, "The owner reviews the text." | "Knows when to ask. A case it has never seen: it doesn't guess. It holds that one item, writes one question with a confidence, and routes it to the right person. Everyone else still gets paid." |
| 1:46 | 2 | Owner home: **Gate 1** → confirm dialog → **Fill Gusto draft** → Readiness card. | GateConfirm rows (engine preview); then "Filling the regular draft…"; Readiness: "Gusto draft status · Calculated in Gusto", "Held items stay out of Gusto until someone answers. Everyone else can be paid." Footer: "Draft only. RollPay never submits payroll." | "The owner approves the gate. RollPay fills and calculates the Gusto draft. It never submits; there is no submit function in the code. The owner submits." |
| 1:58 | **3. Did we see something new?** | Rules screen (Company → Rules): one rule proposed from history, e.g. overtime policy, 40 h weekly at 1.5×. | RuleCard: `Proposed`, "Needs the owner's approval", evidence: four past cycles, confidence 0.95, the backtest badge. Then "Change it in your own words" with the restatement box. | "Nobody else does this part. It reads four past cycles and proposes the company's own rules, with the records behind each. The owner rewrites one in plain words; RollPay restates it and checks it against history." |
| 2:12 | 3 | Learned rules (Rules → Learned): the rule that came from a manager's answer. | Provenance: "Answered: Dakota (manager)", "Approved by the owner", backtest "agrees in [measured at G3] of [measured at G3] past cycles" (cut the badge if unmeasured). | "Every answer becomes a lesson. It only becomes a rule when the owner approves it, and the person who answered can never be the one who approves. Next cycle asks less." |
| 2:24 | 3 | Owner home, scroll to the **Agents** section. | The Auditor's brief ("From the Auditor (Creao), proposal only"), then one row per agent: Auditor · Completed · credits; Messenger; Analyst. Source line visible. | "Three agents on Creao, one seat each: Analyst, Auditor, Messenger. They see ids only and return proposals only. Remove them and this is a calculator." |
| 2:36 | **4. The moment, closed** | Back to the opening flag, owner view, after approval. | CorrectionDiff: `a-te-0111` end 15:30 → 12:00; `a-te-0113` job 102 → 104; "Effect on pay", "Effect on job profit"; status `applied to workbook`; the held hours released; the chips `rule: certain`, `synthetic`, `planted error a-ak-04`. | "That's the error from my own payroll, planted here with an answer key. Caught before the draft, asked of the right person, fixed in the workbook, never in Jobber, and every step is in the log." |
| 2:50 | | **End card.** | "RollPay. It checks the pay before the paycheck." The seats line. Repo URL. "Company A synthetic · Company R real, anonymized." | "RollPay. It checks the pay before the paycheck." |
| 3:00 | | Black. | | |

**Recording order** (do the risky shots first): 1:06 phone shots and the 0:00–0:20 round trip with the courier running, 0:44 demo-mode stage tracker, then everything else in page order. Record voice last, against the cut.

**Rules for the cut.**
- Never speak a number that is not in `docs/PROOF.md`. If a badge on screen shows an unmeasured number, crop it or cut the shot.
- Every data shot keeps its label chip in frame. If a shot has no chip, burn in a caption: `synthetic` or `real, anonymized`.
- Manager and phone shots: no dollar sign, no pay word. Check the frame before exporting.
- A simulated reply, if one is used anywhere, keeps the red **Simulated** chip visible and is said out loud.
- Fake names only (Skyler, Dakota, Sam, Casey). Blur anything else.
- Under 3:00 including the end card. Devpost refuses longer uploads at some limits and judges stop watching sooner.

## 3. Live demo (3 minutes, then 2 minutes of questions)

**Before the judges arrive.**
- [ ] `DEMO_MODE=1`. Company A restored to cycle 2 with `demo.reset` (under 10 s).
- [ ] Sam's cycle-2 overlap question drafted and waiting for the manager's approval.
- [ ] Courier running on the laptop; both phones unlocked on the table, with Messages open.
- [ ] Video open in a browser tab as the backup.
- [ ] Owner home showing in the browser at 1280×800.
- [ ] `DASHBOARD_URL` in `apps/courier/.env` points at the deployed dashboard, so the manager's text carries its link.
- [ ] One Creao run started for cycle 2 and visible in the **Agents** section at the bottom of the owner home (the Auditor's brief and one row per agent; it says "synthetic fixture" until Convex has runs). TODO(S7): needs the agents from `docs/plans/creao-plan.md`.

**Cycle 2's catch** (`a-ak-64`): Sam again, **Wed Oct 28**, both entries on Job 162 (Paver walkway, Ashgrove Ln), 7:00 to 15:30 and 12:00 to 16:00. The truth is Job 164 (Retaining wall rebuild, Brookhollow Ct). No rule can settle it, so it is still asked, now with a precedent: cycle 1, same worker, same pattern.

| Time | Who | Screen and action | Line |
|---|---|---|---|
| 0:00 | Shanin | Owner home | "RollPay is the agent a small service company hires to check payroll inputs before anyone hits submit. This is Company A, a synthetic 13-person landscaping crew, seeded into real Jobber and Gusto sandboxes, and labelled synthetic on every screen." |
| 0:15 | Varnika | Owner home: stage tracker, counts, "Questions this cycle: [measured at G3] (last cycle: [measured at G3])" | "Cycle two. Most items went through on rules it learned last cycle; only these need a person." |
| 0:35 | Varnika | Open Sam's flag: `rule: certain`, `precedent: cycle 1, same worker`; switch to Manager; ApprovalSheet | "Same pattern as last cycle, so it asks the same person, not the owner. Here's the exact text. The manager approves it." |
| 0:50 | Varnika (Sam's phone) | Sam's phone gets: `Sam, on Wed Oct 28 two entries overlap (7:00-15:30 Job 162 and 12:00-16:00 Job 162). Which one is right? 1 7:00-15:30 Job 162 2 12:00-16:00 Job 162 3 both, different jobs 4 neither`. Reply `3` and the job; the LiveFeed updates. | "That's a real text on a real phone, and the reply comes straight back." |
| 1:10 | Varnika | Owner view: CorrectionDiff → Approve; workbook version ticks; **Approve Gate 1** → **Fill Gusto draft** → status `calculated`, with "Draft only. RollPay never submits payroll." | "Before, after, effect on pay. The owner approves. The Gusto draft fills. It never submits." |
| 1:35 | Varnika | Rules screen: the rule learned from a cycle-1 answer, with provenance (answered by the manager, approved by the owner) and backtest "agrees in [measured at G3] of [measured at G3] past cycles" | "Every answer becomes a lesson. It only becomes a rule when the owner approves it, and the person who answered can't be the one who approves." |
| 1:55 | Devaj | **Creao run in progress.** Scroll to the **Agents** section on the owner home: the Auditor's morning brief, then one row per agent; the Auditor run for this cycle shows pending, then running, then completed, with its credits (ids only). Then the org chart on the audit page: the controller on top, the Auditor, Messenger and Analyst below it, and the hand-offs in the audit log (for example "Auditor flagged items, routed some to the Messenger"). Each audit row names the agent as the actor. Shared run link: TODO(S7). | "Three Creao agents, one per role, started by our controller. They only ever see ids and they only return proposals. Nothing they write happens until a person approves it. Remove them and this is a calculator." |
| 2:15 | Devaj | Demo panel: judge scenario (section 4) | "Give us a situation." ... "It doesn't guess. It asks." |
| 2:40 | Varnika | Readiness report, then the audit log scrolling | "Precision [measured at G3] and recall [measured at G3] on 29 planted errors across 22 of our 23 checks. Every step you just saw is in the log with who did it." |
| 2:55 | Shanin | Close | "Same engine, more rules, more people to ask. We'd hire it." |

**[TODO: decide who holds Sam's phone.]** Varnika drives the laptop, so either she taps the reply herself or hands Sam's phone to a teammate for 0:50 to 1:10. A judge's own phone only works if it was registered in Photon beforehand.

## 4. Judge scenario

1. Ask the judge for a situation in one sentence. Repeat it back.
2. Devaj enters it in the demo panel and picks the nearest builder: a worker's gross jumps more than 25% (CHK-22), an expense account we've never seen (CHK-17), or two systems disagree on a rate (CHK-10). Anything else goes in as free text; the Auditor classifies it as unknown and routes it to the owner with `no precedent`.
3. Show the flag card: confidence, `no precedent`, routed to the owner, only that item held.
4. If they want to see the ask: approve it and send it. If there's no signal in the room, use `demo.simulatedReply` and say out loud: "That reply is simulated; a model is playing the manager, which Hyphenate's brief allows." The **Simulated** chip stays on screen.
5. Show the audit log rows for everything that just happened.

## 5. Likely questions

| Question | Who answers | Answer |
|---|---|---|
| What's real? | Shanin | Section 1, word for word. |
| What if the manager or worker is wrong? | Devaj | A person approves every correction; replies that contradict the records or history escalate; the 25% catch-all (CHK-22) always goes to the owner. |
| Why not let it submit? | Shanin | Segregation of duties: the owner is accountable, so the owner submits. There is no submit function in the code. |
| How does it learn? | Devaj | Answer → lesson → compared with what it knows → backtested → owner approves → rule. |
| Does the manager see pay? | Varnika | No. Manager and employee views and texts show worker, date, job and hours only. |
| What does a cycle cost? | Devaj | Token cost per cycle from the audit log: **[measured at G3]**. |

## 6. Fallbacks

| If | Then |
|---|---|
| The text doesn't arrive within 10 s | `demo.simulatedReply` with the Simulated chip, said out loud; the video shows the real round trip. |
| Photon says "Target not allowed for this project" | The phone isn't registered, or a newly registered phone hasn't texted the shared line first. Use the simulated reply now; fix it after. |
| The Gusto demo is down | The labelled mock; the UI shows `Gusto: simulated`; say so. |
| Reset leaves the owner home empty | Second laptop with the same build at cycle 2, with the courier moved there. |
| The Creao run is slow or Creao is down (a run takes minutes) | Show the run that finished before the demo, or the shared run link (TODO(S7)), and say it was started earlier; the live reply path never depends on Creao. If the Agents section shows the synthetic fixture, say so and show the org chart on the audit page. |
| The video won't play | MP4 on a laptop and a phone. |

## 7. Rehearsals

- Rehearsal 0, Sat 23:30: walk this script on the real build once and note every stall.
- Rehearsal 1, Sun 06:00: timed, with the phones; fix timings here.
- Rehearsal 2, Sun 08:20: at the venue, on venue Wi-Fi and phone signal; decide live vs simulated reply for the room.

## 8. Still open

- [TODO] H3: QuickBooks sandbox, and what to call it in section 1.
- [TODO(S7)] Creao agent ids and the shared run link for step 1:55; start one Auditor run before the judges arrive so it is visible. Creao spike status: `docs/INTEGRATIONS.md` row H9.
- [TODO] Every **[measured at G3]** number, from `eval/results.json` and `docs/PROOF.md`.
- [TODO] Video: record it (section 2b), then fill or cut the two **[measured at G3]** badges in the 2:12 shot.
- [TODO] Who holds Sam's phone during the live demo.
- [TODO] The real-company moment: the team agreed the demo uses Shanin's anonymized company data. Proposed: the full walkthrough on Company A (synthetic, labelled) plus one "real company moment" on Company R. Company R has 0 loadable time entries, so a live flag page may be empty; the safer moment is the backtest proof (35 of 46 to the cent, 44 of 46 within $1). Needs Company R loaded on dev Convex (Devaj) and the team's OK.
- [TODO] A deployed dashboard URL (Devaj, Vercel) for `DASHBOARD_URL`; without it the manager's text has no link.
- [TODO] Whether the owner gets any texts at all (the team's open question). This script assumes not.
