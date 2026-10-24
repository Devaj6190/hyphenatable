# Project sources

Everything the team has collected for the Cal Hacks 13.0 payroll agent (Hyphenate track).

## From the event
- **Hacker guide:** https://docs.google.com/document/u/0/d/1RQrueC9wm5u8uxtWSC2gadIchp05hVayhGUrIjxT9dE/mobilebasic
- **Hyphenate track doc:** rubric, deliverables and the sandbox list: https://docs.google.com/document/d/1u4iN8R97ILY3kfHTPKC82zdutHrGx4ze5eCAP-J92w4/edit?usp=sharing
- **Hyphenate workshop slides:** [hyphenate-workshop-slides.md](hyphenate-workshop-slides.md). The Learns → Runs → Escalates → Improves loop, with coffee-chain tips and festival vendor payouts as examples.
- **CRS sandbox:** keys, docs and test identities at https://calhacks.crscreditapi.com. Use test identities only.
- **Live site and app:** sponsor starter packs and workshop times are posted there once hacking starts.

## Our work
- **[../../specs/final.md](../../specs/final.md):** the team's product spec (draft).
- **Sponsor stacking page:** https://claude.ai/artifact/GvEA9bPYZNrFjTGxcT8TYS (private until shared).
- **[hackathon-validation-findings.md](hackathon-validation-findings.md):** the validation session's findings (copied here; the session keeps its own copy up to date).

## Key validation points (from the validation session)
- Hyphenate judged a CFO-agent track at HackMIT 2026. There they already saw controller-approved learned rules and a "bank changed recently, so hold the payment" check, so neither reads as new.
- What still reads as new to them: payroll as the handoff from hiring to paying, and getting each error fixed in its source system, then re-checking.
- CRS has no fraud or bank-account endpoint. Use a CRS identity check, and don't pull credit reports on employees.
- The biggest single lever: a catch-all rule (net pay changed more than 25% from last period) plus a path where the controller refuses, so a judge's own scenario still gets caught.
