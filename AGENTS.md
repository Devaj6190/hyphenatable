# PayrollPilot agent rules

## Where to look (read only what the task needs)
- Code is the truth. The contract is `packages/engine/src/schemas.ts` and `apps/web/convex/schema.ts`. If a doc disagrees with the code, trust the code and say so.
- What we build and why: `specs/final.md`.
- Contracts reference: `docs/plans/00-shared-context.md`. Open only the section you need.
- Your ticket: its section in `docs/plans/A-data-payroll.md`, `B-agent-backend.md` or `C-product-messaging-demo.md` (Creao work: `docs/plans/creao-plan.md`). The timelines, onboarding and first-hour parts of those plans are history.
- Where things stand: the newest entries at the top of `docs/STATUS.md`. What has been tested live: `docs/INTEGRATIONS.md`.
- Demo and submission work only: `docs/DEMO.md`, `docs/PROOF.md`, `docs/devpost.md`.
- A package's details: the README in its folder.
- `docs/sources/` is background research from early Oct 24 and may be stale. Read it only for a sourced fact the task needs.
- Setup, scaffolding and first-hour checks are done. Don't redo them.
- Retired docs (team brief, plan handoff, Creao handoff, spec conflicts) are in git history at `a90563e`. Don't restore them.

## Rules
- Stay inside the task. Work nobody asked for (spikes, refactors, new tools, extra verification) is proposed in one plain sentence first, not done.
- Plain code owns state, approvals and money. Agents return validated proposals; nothing happens without a human approval or a deterministic rule.
- Pure logic lives in packages/engine (no IO, Vitest). Convex functions are thin. The UI never computes pay.
- Money is integer cents. Times are ISO UTC. Ids trace back to the source record.
- The model never receives names, phone numbers, notes, pay amounts in texts, SSNs or bank data. Ids only.
- Checks fire only on exact conditions; anything that needs judgment becomes a question. Never auto-correct. Never invent a rate. Never trim hours.
- Every sync records pulled vs expected. Incomplete blocks what it covers.
- Never call Gusto submit. There is no submit function in this codebase.
- Edit only the folders your role owns. Contract files change only by a `contract:` PR.
- Every PR targets main. One feature per PR. Check main after merging.
- No secrets in the repo. No real names anywhere. data/private is gitignored.
- Numbers shown to users say where they came from and whether they are synthetic.
