# Status (update at every gate and after every merge; newest first)

Format: `HH:MM PDT · who · what landed on main / what I'm on / what I need`. Decisions that change the plan go here too, with the file they changed.

- Sat 02:10 · A2 · Merged #1 (bc14f40): `data/fixtures/a/*.json` (13 files, Company A cycle a-c05, 40 entries) + `answer-key.json` v1 (CHK-01, 02, 03, 04, 05, 10, 11, 14) + `seed/validate.ts`. **B and C: fixtures are on main.** Conventions in `data/fixtures/README.md`.
  - **Ask → Devaj (B):** confirm for the checks: CHK-17 skips expenses with null account (Jobber expenses); CHK-05 doesn't count a ticking entry as zero; cycle `periodEnd` is inclusive. Also expected real-but-unkeyed flags: CHK-06 on a-te-0140, CHK-12 on a-w08/09/10, CHK-23 on a-sr-04.

- Sat 01:50 · A (lead) · On: lanes A1 (connectors: A-01, A-03, A-08, A-09, A-15) and A2 (seed: A-02 → A-04..A-07, A-14) started; A3 (payroll + eval) after G1. A-02 fixtures target 03:00.
  - **Ask → Devaj (B), contract:** A-10 produces a per-line arithmetic trail. `DraftLine` in shared-context §6 has no `explain` field. Until a `contract:` PR adds `explain: string[]` to `DraftLine`, A returns `{ draft, explain: Record<workerId, string[]> }` beside the `Draft`. Please say yes/no here.
  - **Decision (A):** Company R ingest script lives at `packages/connectors/src/ingest-r.ts`, not `seed/ingest-r.ts` (keeps lane folders disjoint). Plan A-09 file list is superseded by this line.
  - **Decision (A):** until B-02 merges, A validates fixtures with `seed/validate.ts` (zod mirror of §6).

- Sat 01:55 · Shanin · Decision: product name is **PayrollPilot**, not PayCheck. Renamed in the spec, plans and README (Gusto's "Paycheck Tips" earning name is unchanged). Package name `payrollpilot`; Convex project `payrollpilot`; seed tags `payrollpilot:`.

- Sat 01:35 · plan · Spec completed (0 open items), shared context, team brief and role plans committed. Next: everyone reads `docs/plans/00-team-brief.md`, then first-hour checks (see `docs/INTEGRATIONS.md`).
