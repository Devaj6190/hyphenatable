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

The rest of the video (title card, Learns, Runs, Escalates, Improves, Proof, end card) follows plan C section 8.1. **[TODO: lock the full shot list and voice-over at G3]**, using the corrections above: Company A has 13 active people, the catalogue has 23 checks, and every proof number is measured.

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
- [TODO] The full video shot list and voice-over beyond 0:20, locked at G3.
- [TODO] Who holds Sam's phone during the live demo.
- [TODO] The real-company moment: the team agreed the demo uses Shanin's anonymized company data. Proposed: the full walkthrough on Company A (synthetic, labelled) plus one "real company moment" on Company R. Company R has 0 loadable time entries, so a live flag page may be empty; the safer moment is the backtest proof (35 of 46 to the cent, 44 of 46 within $1). Needs Company R loaded on dev Convex (Devaj) and the team's OK.
- [TODO] A deployed dashboard URL (Devaj, Vercel) for `DASHBOARD_URL`; without it the manager's text has no link.
- [TODO] Whether the owner gets any texts at all (the team's open question). This script assumes not.
