# Status (update at every gate and after every merge; newest first)

Format: `HH:MM PDT · who · what landed on main / what I'm on / what I need`. Decisions that change the plan go here too, with the file they changed.

- Sat 02:20 · Devaj · B-01 scaffold on `b/scaffold` (Next.js 16 + Convex in apps/web, workspaces, Biome, CI, AGENTS.md, .env.example). H5 proven on a local Convex backend; the cloud deployment waits on `convex login`. Gotchas: Biome `!**/build` excluded the whole repo (it lives under `C:uild`); `.gitattributes` forces LF so Biome passes on Windows.

- Sat 01:55 · Shanin · Decision: product name is **PayrollPilot**, not PayCheck. Renamed in the spec, plans and README (Gusto's "Paycheck Tips" earning name is unchanged). Package name `payrollpilot`; Convex project `payrollpilot`; seed tags `payrollpilot:`.

- Sat 01:35 · plan · Spec completed (0 open items), shared context, team brief and role plans committed. Next: everyone reads `docs/plans/00-team-brief.md`, then first-hour checks (see `docs/INTEGRATIONS.md`).
