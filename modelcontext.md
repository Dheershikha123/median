# Model Context: Laya

Everything about the model behind Tier 1: what it is, how this project uses it, its limits, how to calibrate it, and what is still unverified. Owned by Track B.

Facts below come from the project planning documents. Anything marked **Unverified** has not been confirmed against the real package or a real run, and should be checked in build-order Step 1.

## 1. What Laya is

- An open-weight model from Convai Innovations, used here as the decision layer's "System-1": a fast, cheap judge.
- Runs **locally on Node** through ONNX Runtime via the npm package `@receptron/laya`. No API key, no hosted region, no waitlist.
- Default checkpoint `convaiinnovations/laya`: English, ModernBERT-large, 421M parameters, about **512 tokens** of input.
- Other checkpoints under consideration: `laya-multilingual`, and `laya-typed-decisions` (tuned for workflows like this one, with a larger context).
- Weights are about 850MB to 1.7GB, downloaded once from Hugging Face on first load into `.cache/`, then run fully offline.

**History:** the project originally used Jev (TypeSafe AI), a hosted API, and switched to Laya because access to Jev from India was unreliable. The architecture and schema did not change.

## 2. Role in the system

Laya powers **Tier 1** only. Tier 0 (plain TypeScript) handles clear passes and fails. Laya is called when Tier 0 sets `ambiguous: true`: everything mechanical is green, but nothing confirms the goal was met.

The question Laya answers: *does the change satisfy the explicit requirements, not just pass the existing tests?*

It is deliberately not asked to find bugs, read errors, or judge code quality. Tier 0 already covers those with concrete signals.

## 3. The three primitives

| Primitive | Returns | Use in this project |
|---|---|---|
| `choice` | One option from a list (for example generate / refine / done) | Not used yet. Candidate for phase selection once Step 1 shows how it behaves. |
| `score` | A numeric score | Not used yet. Tier 0 computes the score in plain TypeScript. |
| `noul` | A probability that a stated requirement is satisfied | **The one Tier 1 uses.** Mapped to `done` or `refine` by a threshold. |

## 4. How `tier1.ts` uses it

1. **Lazy load.** On the first call, `getModel()` dynamically imports `@receptron/laya` and calls `Laya.load('convaiinnovations/laya')`. The promise is cached at module level, so the model loads once per process, not once per iteration. Dynamic import means startup isn't slowed when Tier 1 never fires.
2. **Build the state.** Only `goal`, `diff`, and `verifiedRequirements` are sent. Errors and the full `checks` object are excluded on purpose: Tier 1 only runs when those are already clean, and they would eat the input budget.
3. **Ask one `noul` question** with instructions to answer false if the goal describes behavior the diff does not implement.
4. **Map to a decision.** `passingProbability` above the threshold gives `done`; below it gives `refine` with a generated fix instruction.
5. **Keep the trace.** `reasons` records `tier1 (Laya): noul=0.XX`, the raw probability before any threshold, so old traces can feed calibration later.

The result is a `DecisionResult` with `passingProbability` set. `loop.ts` uses `passingProbability ?? score` when applying the 0.90 gate.

## 5. Input budget and compaction

The default checkpoint takes about 512 tokens. A goal, a real diff, and a requirements list can exceed that quickly.

- **Compaction is a hard requirement**, not an optimization. It is Track B's job (state payload builder).
- Options when a diff is too large: send only the changed hunks relevant to the goal, truncate with a marker, summarize per file, or switch to a larger-context checkpoint.
- **Not yet confirmed:** whether a compacted state from a real, non-trivial task fits. Test this in Step 1 with a real diff before designing anything else around it.
- If it doesn't fit, `laya-typed-decisions` (larger context) is the fallback.

## 6. Calibration

Laya's own documentation says it ships **over-confident**: its probabilities read higher than the true chance of being right. That makes a raw `noul > 0.90` unsafe as a gate.

Its docs recommend fitting a **calibration temperature per (question type, option count)** on your own labeled data before trusting the probability for a threshold decision.

Proposed procedure (Phase 3, Track B):

1. Collect 20 to 30 `(prompt, code, human verdict)` examples in `fixtures/labeled-examples/`. Include code that passes its tests but misses the ask, and code that genuinely meets it. Track A collects candidates; Track B assigns final labels.
2. Run Laya on each and record the raw `noul` probability.
3. Fit the temperature that best matches Laya's outputs to the human verdicts (for example by minimizing log loss). Then choose the threshold from the calibrated probabilities.
4. Measure the false-"done" rate (cases Laya passes that a human failed). This is the number that matters most.
5. Record the temperature and threshold in `tier1.ts` (replacing `RAW_DONE_THRESHOLD = 0.90`) and log the decision in `docs/decisions.md`.

20 to 30 examples is a small set. Treat the fitted values as a starting point and revisit them as the benchmark grows.

## 7. Known limitations

- **Tier 0's ambiguity rule is a placeholder.** It flags `ambiguous` only for an empty diff or zero tests. A run with passing tests and a non-empty diff goes straight to `done`, so Tier 1 rarely fires today. Tightening this rule is what lets Laya catch real intent gaps.
- **Small input window.** Long diffs may not fit (section 5).
- **Over-confident out of the box** (section 6).
- **Judges a text description against a diff.** It doesn't run the code. It can be fooled by a diff that looks like it implements the goal but doesn't work, which is why Tier 0's mechanical checks run first.
- **First-run cost.** The first load downloads roughly 1GB or more and needs Hugging Face reachable. Later runs are offline.
- **Optional native dependency.** `onnxruntime-node` downloads a binary from `nuget.org` during install. If that is blocked, Laya won't be installed and Tier 1 can't run, but the rest of the project still works.

## 8. Unverified assumptions (check in Step 1)

`types/laya.d.ts` and `tier1.ts` were written from documentation, not from the real package. Confirm each of these before trusting Tier 1:

- [ ] The package exposes `Laya.load(checkpoint)` and it returns a model.
- [ ] `systemOne()` exists and takes a `state` and a `questions` object, in the shape `tier1.ts` assumes.
- [ ] `noul` results come back at `result.answers.<key>.noul` as a number from 0 to 1. (If the field is named differently, the chain breaks silently at runtime while TypeScript still compiles against the assumed types.)
- [ ] Checkpoint names load as written (`convaiinnovations/laya`, `laya-multilingual`, `laya-typed-decisions`).
- [ ] The checkpoint downloads into `.cache/` and loads on CPU on your machine.
- [ ] Typical latency per call on your hardware (CPU vs GPU).
- [ ] Real token count of a compacted state from a real diff.

Once confirmed, replace or delete `types/laya.d.ts` in favor of the package's real types.

## 9. Decisions still open

| Question | Decide after |
|---|---|
| Standardize on `laya` (English, smaller context) or `laya-typed-decisions` (larger context)? | Step 1 token-budget test |
| Use `choice` or `score` from Laya, or keep phase and score in plain TypeScript? | Step 1 behavior notes |
| Real ambiguity rule for Tier 0 | Step 2 to Step 5, agreed together |
| Final threshold and temperature | Phase 3 calibration |
| GPU or CPU-only? | Now (affects latency expectations only) |

## 10. Quick reference

| Item | Value |
|---|---|
| Package | `@receptron/laya` (optional dependency) |
| Default checkpoint | `convaiinnovations/laya` |
| Architecture | ModernBERT-large, 421M parameters |
| Input budget | About 512 tokens (default checkpoint) |
| Weights | About 850MB to 1.7GB, cached in `.cache/` |
| Primitive used | `noul` |
| Called when | Tier 0 returns `ambiguous: true` |
| Sent as state | `goal`, `diff`, `verifiedRequirements` |
| Current threshold | 0.90 raw, **uncalibrated** |
| Runtime | ONNX Runtime on Node, CPU by default |
| Files | `decision/tier1.ts`, `types/laya.d.ts` |
