# Hyphenate workshop slides (photos, transcribed)

Source: the user's photos of two slides, presumably from Hyphenate's workshop "Beyond Agentic Harnesses: Engineering the Autonomous Enterprise" (Cal Hacks 13.0, Oct 23, 2026). Values in [brackets] were hard to read in the photo.

Each slide follows the same four-step loop: **Learns → Runs → Escalates → Improves.**

## Slide 06: A coffee chain

- **Job:** split each store's tips every Sunday.
- **Scale:** 18 stores, 240 baristas.
- **Learns (self-learning):** reads six months of tips and payroll runs to learn the split.
  - Split by hours worked.
  - Shift leads get 1.2×.
- **Runs (AI-automated):** every Sunday night, splits each store's tips and drafts payroll.
  - 240 shares across 18 stores.
  - Payroll draft ready Monday.
- **Escalates (needs review):** a new store logged $310 [blurry] in cash tips with no shifts attached.
  - Routed to the store manager.
  - Confidence: 41%, no precedent.
  - Holds that store's payout.
- **Improves (new policy):** Manager: "Split cash tips by scheduled hours."
  - Saved as a policy for all 18 stores.
  - Never asked again.
- **Next Sunday:** no human needed.

## Slide 07: A music festival

- **Job:** pay every food vendor its share of sales, each night.
- **Scale:** one weekend, 60 [blurry] food vendors.
- **Learns (self-learning):** reads vendor contracts and last year's settlements to learn the terms.
  - Festival keeps 15% of sales.
  - $500 minimum fee.
- **Runs (AI-automated):** each night, pulls every vendor's sales and drafts its payout.
  - 60 [blurry] vendors settled overnight.
  - Statements ready by 9 AM.
- **Escalates (needs review):** the taco truck's contract says 15%; the producer's email says 10%.
  - Routed to the partnerships lead.
  - Confidence: 38% [blurry], sources disagree.
  - Holds that one payout.
- **Improves (new policy):** Partnerships: "The email wins for this year."
  - Email linked to the contract.
  - Never asked again.
- **Tomorrow:** paid at 10%, email cited.

## What this means for our design

- **This loop is the shape Hyphenate wants to see.** Our pay run already maps onto it: pattern miner = Learns, sync and rules = Runs, routing to the owner = Escalates, controller-approved policy = Improves. The demo and pitch should name these four steps in Hyphenate's own words.
- **Payroll is already one of their examples.** Slide 06 drafts payroll, holds one store's payout, and turns a manager's answer into a standing policy. "Learned policies so it asks less" is their baseline, not our novelty.
- **Slide 07's escalation is our source-conflict case.** Two sources disagree, the payout is held, and the owner decides which source wins. It's the same idea as our HR-vs-time conflict, and it backs up the validation session's novelty warning.
- **They show a confidence score and a precedent note on every escalation** ("41% · No precedent"). Our exceptions should show the same on screen.
- **They hold one payout, not the whole run.** That matches our "hold the line, not the run" rule.
