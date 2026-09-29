# Team split update: drafts to paste into the repo

Two pieces: (1) replacement for `context.md` section 9 (plus two small follow-on edits), and (2) a new entry for `docs/decisions.md`.

---

## 1. `context.md` — replace section 9

## 9. Team split

Split by dependency on the decision layer, not by phase. The rule: a file belongs to Track B if it needs to understand what Tier 0 or Tier 1 returns; it belongs to Track A if it only runs a tool or reports a result. Both people still work every phase in parallel.

| | **Track A: Runner and tooling (other person)** | **Track B: Decision layer and loop (you)** |
|---|---|---|
| Owns | Calling `agy`, running checks, CLI, escalation report, benchmark | Deciding pass/fail, scoring, judging intent, and the loop that acts on those decisions |
| Files | `wrapper/agy.ts`, `wrapper/checks.ts`, `wrapper/cli.ts`, `wrapper/escalation.ts`, `bench/`, `fixtures/sample-agy-outputs/` | `decision/tier0.ts`, `decision/tier1.ts`, `types/laya.d.ts`, `wrapper/loop.ts`, `wrapper/loop.test.ts`, `fixtures/labeled-examples/` |
| P1 | `agy` non-interactive integration (command, flags, output parsing, exit codes), `runChecks`, real sample outputs saved to fixtures | Tier 0 rule engine, typed interfaces, `loop.ts` skeleton, state payload builder |
| P2 | Escalation report writer, timeout handling, failure classification (`environment` / `code_bug` / `timeout`), real lint and tsc issue counts | `MAX_ITERATIONS` enforcement, hysteresis, stuck detection and fix-instruction rewrite, ambiguity rule, state compaction |
| P3 | Collect candidate intent-gap examples (code that passes tests but misses the ask), CLI `--verbose` polish | Tier 1 judge via Laya's `noul`, verified-requirements carry-forward, final verdict labels, calibration fit (see section 12) |
| P4 | Benchmark runner (three modes), cost and latency tracking, debug logging | Calibration analysis, false-"done" rate, Laya integration polish |

### Interface between the tracks

Track A delivers three functions. Everything behind them is internal to Track A:

```ts
runAgy(prompt: string): Promise<AgyResult>
runChecks(code: string): Promise<Checks>
writeEscalationReport(report: EscalationReport): Promise<void>
```

`AgyResult` and `EscalationReport` live in `types/index.ts` (moved out of `loop.ts`), so neither track imports from the other's files. `types/index.ts` remains the only file both depend on; changes go through a pull request reviewed by both.

### Known dependencies

- Track B's loop tests are mock-only until Track A saves real `agy` outputs to `fixtures/sample-agy-outputs/`. Track A's Step 1 findings are the critical path for both tracks.
- Track A collects candidate examples in P3, but Track B assigns the final verdict labels, since those labels feed calibration.

---

### Follow-on edit to section 8 (repository layout)

Update the ownership comments:

```
antigravity-agent/
  types/        shared schema                                          (both own)
  wrapper/      agy.ts, checks.ts, cli.ts, escalation.ts               (Track A)
                loop.ts, loop.test.ts                                  (Track B)
  decision/     tier0 rules, ambiguity rule, tier1 judge (Laya)        (Track B)
  fixtures/     sample-agy-outputs/ (A), labeled-examples/ (B)
  bench/        benchmark tasks and runner                             (Track A)
  docs/         README, decisions log, results                         (both)
  .cache/       downloaded Laya checkpoint (git-ignored)
```

### Follow-on edit to section 14 (change log)

Add:

- **Rebalanced team split** (2026-09-30): moved `loop.ts`, its tests, state payload building, compaction, and the calibration set to Track B, since they depend directly on Tier 0 and Tier 1 outputs. Track A now owns everything that only runs tools or reports results. See `docs/decisions.md`.

---

## 2. `docs/decisions.md` — add entry

### 2026-09-30: Rebalance the team split around Laya dependency

**Changed:** The wrapper files that consume Tier 0 and Tier 1 output (`wrapper/loop.ts`, `wrapper/loop.test.ts`, the state payload builder, state compaction, and verified-requirements carry-forward) moved from Track A to Track B. Track A keeps `agy.ts`, `checks.ts`, `cli.ts`, `escalation.ts`, `bench/`, and `fixtures/sample-agy-outputs/`. `AgyResult` and `EscalationReport` moved from `loop.ts` into `types/index.ts`. Label ownership for `fixtures/labeled-examples/` stays with Track B, but Track A collects candidate examples in Phase 3.

**Why:** The original split cut through the loop, which is the seam between the two tracks. Every change to Tier 0 or Tier 1 output (hysteresis band, stuck rewrite, threshold gate, compaction to fit Laya's ~512-token budget) also required a change in `loop.ts`, so one person had to coordinate constantly with the other. Grouping by dependency on the decision layer removes that coupling and shrinks Track A's surface to three functions with stable signatures. It also reduces the load on Track A, whose Step 1 work (verifying non-interactive `agy`) is already the highest-uncertainty task in the project.

**Affects:**
- `context.md` section 8 (repo layout ownership comments), section 9 (team split), section 14 (change log)
- `README.md` per-file ownership labels for `wrapper/loop.ts`, `wrapper/loop.test.ts`, and `fixtures/`; the "Track A" heading on the `wrapper/` section no longer covers the whole directory
- `types/index.ts` gains `AgyResult` and `EscalationReport`; `loop.ts`, `agy.ts`, and `escalation.ts` must import them from there
- Track B's Phase 3 workload is now heavier (Tier 1, carry-forward, calibration); mitigated by Track A collecting candidate examples
- Risk to watch: Track B's loop tests stay mock-only until Track A delivers real `agy` outputs
