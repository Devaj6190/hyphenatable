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

## Flags: a stand-in until B's checks run

`fixtures/flags.json` comes from `naive-checks.ts`, a deliberately simple reading of the section 9 catalogue over the fixtures. **It is not B's checks engine.** It was written by someone who knows the fixtures, so its M1 score shows the scoring code works, not that the product does. `results.json.flagsSource` says which flags were scored. The readiness screen and PROOF.md show M1 only from real flags (B's `eval.summary` or a Convex export).

## Metrics

| | File | What it measures | Source |
|---|---|---|---|
| M1 | `m1-planted.ts` | Recall and precision over the answer key. A row is caught when a flag has the same `checkId` and any overlapping subject id (worker, job, entry, expense), never by text. Reported per check and overall, with every missed row and every unmatched flag | flags + `answer-key.json` (base rows → a-c05, extension rows carry `cycleId`) |
| M2 | `m2-rules.ts` | Learned rules vs the owner's runbook, counts only | `data/private/r/rule-grading.json` (never committed); `pending` until it exists |
| M3 | `m3-questions.ts` | **Measured:** `Cycle.questionsAsked` per current cycle (0 until live runs). **Past:** answered questions per closed cycle. **Expected from the answer key:** planted rows needing an answer (CHK-12 is a note, never a question; a-c06 rows with `resolvableByRuleType` are settled by a cycle-1 rule). The expectation is labelled, never shown as a result | `cycles.json`, `questions.json`, answer key |
| M4 | `m4-backtest.ts` | **Company R:** pending (A-12). **Synthetic self-check:** `computeStage1` gross vs Company B's past Gusto regular rows | Company B fixtures |
| M5 | `m5-completeness.ts` | Share of `SyncRun.complete`, every blocked object listed | `syncRuns.json` |
| M6 | `m6-traceability.ts` | Share of flags with at least one `where` ref and a rule or model-call id. A deterministic check (`confidence: "certain"`) counts as its own rule. A judged flag needs `precedent.ruleId`, or a model-call id from the audit log | flags (+ audit export later) |

`schema.ts` is the `results.json` contract (zod). `metrics.ts` builds it from loaded data; `run.ts` does the IO.

## Fixtures

`lib/io.ts` loads `data/fixtures/<company>/*.json` and concatenates every extension folder under `cycles/` (for example `a-c06`) onto the same-named base files, as `data/fixtures/README.md` describes.
