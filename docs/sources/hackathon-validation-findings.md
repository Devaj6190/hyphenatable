# Cal Hacks 13.0 validation: key findings (research session)

## Maximor (now Hyphenate) judged HackMIT 2026, Sept 2026, track "Office of the CFO Agent Challenge"
Source: plume.hackmit.org gallery API, /api/v3/projects/gallery?hackathon_id=hack-2026
- 1st VistaAI: AI operating system for PE roll-up onboarding. Founder has Goldman and PE experience. Messy CSV ingest, human staging, provenance to file and row.
- 2nd CFO-Sabbatical: 15 Grok agents covering AP, AR, bank recon and a 13-week forecast. Real Gmail and Stripe intake; harness observability UI.
- 3rd Sherlock: 22-role finance org. Pitched for school boards failing audits. Deterministic cents; precedents rechecked before reuse.
- 4th Money Maxer: deterministic kernel re-performs every entry; learned rules approved like PRs; auditor pack. Most rigorous entry, yet only 4th.
- 5th TrueUp: accruals agent.
- Unplaced but overlapping with us:
  - Audita: holds a payment to a vendor whose bank details changed last week.
  - Precedent, RedLedger: controller-approved learned controls.
  - hyper.: conflicting-evidence AP.
- Takeaway: learned controller-approved policies and the "bank changed recently → hold" pattern are NOT new to these judges.

## Other facts
- Hyphenate modules: O2C, treasury, P2P, GL/close, reporting. Payroll appears only as a system they connect to, not a module.
- CRS sandbox: credit, IDV (KBA, OTP, device, document), prefill, business credit, public records, criminal and eviction, OFAC and MLA. No fraud or bank-account-verification endpoint. The MCP server is on npm. Sign-up is an emailed invite plus a Postman collection.
- Devpost lists NO Anthropic prize.
  - Devpost format: 3-minute pitch plus 2-minute Q&A. The guide says 2 minutes.
  - Devpost criteria: Application, Intentionality, Functionality, Creativity, Technical Complexity.
  - Devpost requires a GitHub repo and an image. Sponsors may judge asynchronously from the video.
- Nessie: https works; plain http timed out (from this machine).
- Real anchor: the Dec 2021 UKG Kronos ransomware attack broke hospital payroll in several states (Becker's, NBC Boston).

## Hyphenate workshop slides (sources/hyphenate-workshop-slides.md), folded in
- Their loop is Learns → Runs → Escalates → Improves. Slide 06, the coffee chain, splits tips, drafts payroll, holds one store's payout, and saves a manager's answer as a policy for all 18 stores, "never asked again".
- **Novelty, now weaker:**
  - Learned policies that cut asks are their own demo.
  - Holding one payout instead of the whole run is their own demo.
  - Payroll-adjacent work is their own demo, so "payroll is outside their modules" is a thin claim on its own.
  - Slide 07 is exactly the source-conflict escalation, ending in "the email wins".
- **Still not in their slides:**
  1. Fixing the error in the system of record and re-checking. They record an answer; the upstream data stays wrong.
  2. A conflict caused by fraud rather than an honest disagreement. Note that HackMIT's Audita did a version of this and didn't place.
  3. Separation of duties on learned policies. In slide 06 one store manager's answer becomes policy for 18 stores with no controller sign-off. Our controller approval, scope and expiry are a "would you hire it" contrast, not novelty; they also scope sometimes ("for this year").
- **Rubric changes:**
  - Name the four steps in their words, in the pitch and the UI.
  - Every exception card shows a confidence score and a precedent note, like their "41%, no precedent".
  - For deterministic rule hits, show "rule: certain"; give percentages only where there's real uncertainty (fuzzy ID match, reply parsing).
  - Pitch line: "Their slide asks the manager and saves the answer. We also make HR fix the record, then prove it's fixed on the next sync."
