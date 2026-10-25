# eval (A)

Proof metrics M1 to M6 (shared-context section 14) → `eval/results.json`, read by the readiness screen and `docs/PROOF.md`.

```bash
cd eval
bun run flags                                   # writes fixtures/flags.json (naive stand-in flags, every current cycle)
bun run metrics                                 # Company A, a-c05 → results.json
bun run run.ts --cycle a-c06 --out /tmp/r6.json # cycle 2
bun run run.ts --flags <eval.summary export>    # real flags, once B's export exists
bun run test                                    # vitest
```

## Flags: the checks engine

`engine.ts` runs the product's checks (`runAll` from `packages/engine`) over the fixtures with onboarding's rules (`rules.json`) owner-approved, then applies the backend's settling step (`settlingRule`, `precedentFor`, as `apps/web/convex/checks.ts` does). `results.json.flagsSource` says so; `--flags <export.json>` scores an exported set instead. `m1ByCycle` scores every current cycle.

`fixtures/flags.json` (from `naive-checks.ts`) is the old stand-in that tested the scoring code before the engine existed; `stand-in.test.ts` still checks it.

## Learning curve (M3)

`m3-learning.ts` runs cycle 2 three times: no rules, onboarding's rules, and onboarding plus the rules cycle 1's answers teach. Each flag ends **settled** (an owner-approved rule decides it), **rule-backed** (a rule is cited, one tap for the owner), a **note**, or **needs a person**. `LEARNED_A` is the oracle step (what a correct Analyst writes from each cycle-1 answer-key row); the dedupe, backtest over past cycles, approval, checks and routing are the product's code. `results.json.learning` holds the curve, each learned rule's backtest, and what happened to every row the answer key marks rule-resolvable.

`__tests__/engine.test.ts` is the regression gate CI runs on every PR: cycle 1 catches every planted error with no false alarm, cycle 2 misses only the known CHK-08 gap (a-ak-72), every learned rule passes its backtest, cycle 2 needs a person less at each step, and all 9 rule-resolvable rows are handled by a rule.

## Metrics

| | File | What it measures | Source |
|---|---|---|---|
| M1 | `m1-planted.ts` | Recall and precision over the answer key. A row is caught when a flag has the same `checkId` and any overlapping subject id (worker, job, entry, expense), never by text. Reported per check and overall, with every missed row and every unmatched flag | flags + `answer-key.json` (base rows → a-c05, extension rows carry `cycleId`) |
| M2 | `m2-rules.ts` | Learned rules vs the owner's runbook, counts only | `data/private/r/rule-grading.json` (never committed); `pending` until it exists |
| M3 | `m3-questions.ts` | **Measured:** `Cycle.questionsAsked` per current cycle (0 until live runs). **Past:** answered questions per closed cycle. **Expected from the answer key:** planted rows needing an answer (CHK-12 is a note, never a question; a-c06 rows with `resolvableByRuleType` are settled by a cycle-1 rule). The expectation is labelled, never shown as a result | `cycles.json`, `questions.json`, answer key |
| M4 | `m4-backtest.ts`, `m4-r.ts` | **Company R:** the counts-only summary from `m4-r-run.ts` (below), or `pending`. **Synthetic self-check:** `computeStage1` gross vs Company B's past Gusto regular rows | `data/private/r/m4/summary.json`; Company B fixtures |
| M5 | `m5-completeness.ts` | Share of `SyncRun.complete`, every blocked object listed | `syncRuns.json` |
| M6 | `m6-traceability.ts` | Share of flags with at least one `where` ref and a rule or model-call id. A deterministic check (`confidence: "certain"`) counts as its own rule. A judged flag needs `precedent.ruleId`, or a model-call id from the audit log | flags (+ audit export later) |

`schema.ts` is the `results.json` contract (zod). `metrics.ts` builds it from loaded data; `run.ts` does the IO.

## Company R (private inputs; nothing real is committed)

Both runners print counts only. Everything they read and write stays under `data/private/` (gitignored). Their tests run only on the synthetic samples in `fixtures/`, never on real data.

### M2: `data/private/r/rule-grading.json`

```json
[
  { "ruleId": "r-rule-03", "runbookId": "RB-07", "verdict": "match" },
  { "ruleId": "r-rule-05", "runbookId": "RB-02", "verdict": "differs" },
  { "ruleId": null,        "runbookId": "RB-11", "verdict": "not_learned" }
]
```

- **`ruleId`:** the learned `Rule.id`, or `null` exactly when `verdict` is `not_learned`.
- **`runbookId`:** the owner's runbook rule id.
- **`verdict`:** `match`, `differs` or `not_learned`.
- **Ids only:** each id is 1 to 40 characters from `A-Za-z0-9:_.-`, and any extra field is rejected. Rule or runbook text cannot get in, and none comes out.
- **Example:** `fixtures/rule-grading.example.json` (fake ids).

```bash
bun run m2-run.ts   # "M2: N of M onboarding rules match the owner's runbook; K differ; J were not learned"
```

### Sealed grading protocol (M2)

This lets onboarding run blind, with the owner's runbook encrypted until the agent's answers are fixed.

1. **Seal the key (owner, once).** Write `data/private/r/runbook-key.json` as `[{ id, ruleType, params, statement, scope, sourceSection }]` (`ruleType` is a RuleType or `"other"`). Encrypt it to `runbook-key.json.enc` and delete the plain file. Either way works:
   - `openssl enc -aes-256-cbc -pbkdf2 [-iter N] [-a] -in runbook-key.json -out runbook-key.json.enc`. `m2-grade` tries the openssl default of 10000 iterations, then 200000; pass `--iter N` for any other count.
   - `bun run m2-seal.ts encrypt` (AES-256-GCM, scrypt-derived key, authenticated).
   - **Unstated values:** if the owner didn't state a value, set that param to `null`. A proposal then matches only with `null` or by leaving the param out (asking the question), never with a value.
   - **Passphrase:** set `RUNBOOK_KEY_PASS` (or `M2_KEY_PASSPHRASE`), or you'll get a hidden prompt. It is never taken from the command line, logged or written.
2. **Run onboarding blind (Devaj's agent).** It writes its proposed rules to a file in either shape:
   - an array of **Proposals** (`packages/engine/src/lessons/history.ts`: `{ type, params, statement, evidence, seenInCycles, ofCycles, confidence }`). These get ids `proposal-<n>` by position.
   - an array of **Rule rows** (`{ id | _id, type, params, provenance.evidence, backtest, confidence }`).

   Every rule needs at least one evidence id.
3. **Freeze before unsealing.** Run `bun run m2-freeze.ts --rules <file>`. It validates the file, writes `out/m2-freeze.json` = `{ sha256, count, frozenAt }` and prints the hash. (`eval/out/` ignores its own contents.)
4. **Grade.** Run `bun run m2-grade.ts --rules <file> --key data/private/r/runbook-key.json.enc [--write-grading]`.
   - **Refusals:** it refuses without the freeze file, and refuses if the rules file's sha256 differs from it, so answers can't change after unsealing.
   - **Key handling:** the key is decrypted in memory only.
   - **Headline: the typed rules only.** These are the key rules with a specific `ruleType`, matched deterministically: proposed `type` = key `ruleType`, and the key's params are equal within a per-type tolerance (`TOLERANCE` in `m2-match.ts`). Strings are compared case-insensitively, and extra params in a proposal are not penalized.
     - **Verdicts:** `match`, `differs` (a wrong value; the params are named in the private detail) or `not_learned` (no proposal of that type).
     - **Reported numbers:**
       - recall = match / typed key rules
       - precision = match / (match + differs + extra)
       - the wrong-value count, plus not learned and extra
   - **`"other"` rules (free-text statements) are never in the headline.** Each one is reported as `needs_human_review`. If `ANTHROPIC_API_KEY` is set, the engine's model adapter suggests the closest unused proposal. It sees types and params only, never the statement, and input that fails the model-input scrub is not sent. The suggestion goes in the private detail for the person reviewing.
   - **Output:** stdout gets counts only. The per-rule detail goes **only** to `data/private/r/m2-grade-<time>.json`. `--write-grading` also writes `data/private/r/rule-grading.json` (typed rules only), which `run.ts` reads for `results.json`.

### M4 setup from the owner's facts: `m4-rules-build.ts`

```bash
bun run m4-rules-build.ts   # [--private data/private/r] → data/private/r/m4-rules.json; prints counts only
```

It reads three private inputs:

1. **`owner-facts.json`** (real first names):

   ```
   { source, timezone, payFrequency,
     overtime: { workweekStartsOn, weeklyHours, multiplier, dailyOvertime },
     longShiftReviewHours,
     venmo: { latestCycle, earlierCycle (full names), movedVenmoToGusto },
     salaried, commission: { plan, recordedRecipients }, managerProfitShare: { recipients } }
   ```

2. **`pseudonyms.json`**: ingest-r's map from a real-name key to a pseudonymous display name.
3. **`out/*.json`**: the anonymized bundles.

How it builds the setup:

- **Name resolution:** a first name resolves when exactly one map key contains it, and a full name needs an exact key. Ambiguous or missing names are counted as unresolved, never guessed. The display name is then joined to the bundle's worker id.
- **Rates:** each worker's Regular rate comes from regular-section journal rows, using the row's rate, else amount / hours.
  - One rate: the worker is hourly at that rate.
  - Several rates: `multiRate: true`. M4 reports these workers separately as "rate depends on job role, not in timesheets".
  - No rate: the worker is excluded with that reason.
- **Venmo:** Venmo workers (latest and earlier cycles, minus those who moved to Gusto) are excluded with "paid outside Gusto".
- **Salaried:** a salaried worker needs one consistent Salary amount per period, which becomes a `Paycheck` rate.
- **Stage 2:** commission and manager-share recipients are listed only as ids. Their Stage 2 pay types are left out of the Stage 1 comparison.
- **Rules:** the overtime rule takes the owner's workweek (for example `Monday-Sunday`).
- **Output:** ids only. A leak check refuses to write the file if any word of a real name appears in it.

Synthetic test inputs: `fixtures/r-build/` (every name invented).

### M4: the Company R backtest

The backtest takes three inputs:

1. **`data/private/r/out/*.json`:** ingest-r's anonymized bundles (`namesAnonymized: true`). It reads `workers`, `timeEntries` and `paid` (gross per pseudonymous worker and pay period, from the Gusto Payroll Journal). Several files are merged by id.
2. **`data/private/r/m4-rules.json`:** how Company R pays, with `source` set to `owner_stated` or `onboarding`. It gives `timezone`, `payFrequency`, and `workers: [{ id, payType, rateCents, paymentUnit }]`, plus section 6 `rules` (at least an active `overtime_policy`). A worker missing from it is reported as unmatched; no rate is ever invented.
3. **`data/private/r/corrections.json`** (optional): the owner's register corrections as section 6 Correction targets. Each is `[{ id, target: { table: "timeEntries", id, field }, after }]`, where `field` is one of `durationSec`, `workerId`, `date`, `payable`, `category` or `deleted`.

For each pay period, it runs `computeStage1` and compares gross per worker with what was paid. Venmo is excluded, because it is not in the Gusto journal. The report gives exact matches, matches within $1, the max difference and the unmatched worker-periods, **before and after corrections**.

**Which periods are compared.** Only pay periods that lie fully inside the timesheet export window are compared.

- **Where the window comes from:** `--from` / `--to`, taken from the export's SyncRun or metadata. Without them it falls back to the earliest and latest entry date.
  - The fallback is narrower when the export's first or last days have no entries, for example a Saturday off, so pass `--from` / `--to` when you know them.
- **Periods the window misses:** periods only partly inside it, or not at all, are counted as "not compared (outside the timesheet export window)". The summary gives how many periods were fully covered, partly covered and not covered.

**Per period.** Every compared period gets its own exact, within-$1 and max-difference counts.

**The within-$1 split.** "Within $1" is split out as **rounding** when the difference is at most 0.005 h × the worker's entries in the period × rate × the highest multiplier they earned. That is what Jobber's 2-decimal rounding of each entry can explain.

Explain trails go only to `data/private/r/m4/trails-<time>.json`. The counts go to `data/private/r/m4/summary.json`, which `run.ts` copies into `results.json` as `m4.companyR`. The runner refuses any directory outside `data/private/`.

Export entries without a start time are placed at local noon of their date. An unknown `payable` is counted as worked. Both are listed in `notes`. Hours are never trimmed.

```bash
bun run m4-r-run.ts   # [--private data/private/r] [--rules …] [--corrections …] [--from YYYY-MM-DD --to YYYY-MM-DD]
```

Synthetic sample: `fixtures/r-sample/`. It has 3 workers and one duplicate entry that the register's correction deletes: 2 of 3 exact before the correction, 3 of 3 after.

## Fixtures

`lib/io.ts` loads `data/fixtures/<company>/*.json` and concatenates every extension folder under `cycles/` (for example `a-c06`) onto the same-named base files, as `data/fixtures/README.md` describes.
