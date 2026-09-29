# Antigravity CLI + Decision Layer (Laya)

A closed-loop wrapper around `agy` (Antigravity CLI). Instead of stopping after one shot, it checks the result, decides whether the code is done, and feeds a targeted fix back to `agy` automatically, up to 4 times. If it still can't finish, it writes an escalation report instead of returning unverified code.

The decision layer has two tiers:

- **Tier 0** is a deterministic rule engine. It answers "does the code work?" from build, test, lint, and type results.
- **Tier 1** is a semantic judge backed by **Laya** (open-weight, self-hosted). It answers "does the code do what was asked?" and only runs when Tier 0 can't settle the question.

## Documentation map

| File | Read it for |
|---|---|
| `README.md` | This file. Quick start, layout, ownership at a glance. |
| `context.md` | Why the project exists: problem, architecture, guardrails, plan, open questions, definition of done. |
| `modelcontext.md` | Everything about the Laya model: what it is, how we use it, its limits, calibration, and what is still unverified. |
| `split.md` | Who owns what, the interface between the two tracks, and each phase's deliverables. |
| `details.md` | A per-file reference: what every file contains, what it does, who owns it, and what breaks without it. |
| `docs/decisions.md` | A running log of decisions that changed the plan, and why. |

## Quick start

```bash
npm install
npm test          # runs wrapper/loop.test.ts against mocked dependencies
npx tsc --noEmit  # type-check everything
npx tsx wrapper/cli.ts "reverse a string, with tests" --verbose   # once TODOs are filled in
```

`@receptron/laya` is an optional dependency. If its native `onnxruntime-node` binary can't be downloaded, `npm install` still succeeds for everything else, and only Tier 1 is unavailable.

## Status legend

| Symbol | Meaning |
|---|---|
| ✅ Real | Implemented, type-checks, and (where applicable) tested |
| 🟡 Skeleton | Real structure and imports, but has `TODO`s that need project specifics |
| ⚠️ Unverified | Best-effort guess at an external API's shape; confirm before trusting |
| ⬜ Placeholder | Empty on purpose, filled in during a later phase |

## Repository layout

```
antigravity-agent/
  README.md  context.md  modelcontext.md  split.md  details.md
  package.json  tsconfig.json  .gitignore
  types/
    index.ts              shared schema                                 (both)
    laya.d.ts             ambient types for @receptron/laya  ⚠️          (Track B)
  wrapper/
    agy.ts                runs agy, classifies failures      🟡          (Track A)
    checks.ts             build/test/lint/tsc -> Checks      🟡          (Track A)
    cli.ts                entry point, wires everything      ✅          (Track A)
    escalation.ts         writes escalation report           ✅          (Track A)
    loop.ts               the state machine                  ✅          (Track B)
    loop.test.ts          7 exit-path tests                  ✅          (Track B)
  decision/
    tier0.ts              deterministic rules                ✅          (Track B)
    tier1.ts              Laya semantic judge                🟡 ⚠️       (Track B)
  fixtures/
    sample-agy-outputs/   real agy outputs                   ⬜          (Track A)
    labeled-examples/     (prompt, code, verdict) triples    ⬜          (Track B)
  bench/
    run-bench.ts          three-mode benchmark               🟡          (Track A)
    tasks/                benchmark projects                 ⬜          (Track A)
  docs/
    decisions.md          decision log                       ✅          (both)
  .cache/                 Laya checkpoint (git-ignored, generated)
  escalation/             failure reports (git-ignored, generated)
```

## Ownership at a glance

| | Track A: runner and tooling | Track B: decision layer and loop |
|---|---|---|
| Owns | Calling `agy`, running checks, CLI, escalation report, benchmark | Tier 0, Tier 1 (Laya), the loop, payload building, calibration |
| Delivers to the other side | `runAgy`, `runChecks`, `writeEscalationReport` | `runClosedLoop` and the `LoopDeps` it takes |

Full details, phase deliverables, and dependencies are in `split.md`.

## How the pieces call each other

```
wrapper/cli.ts
  ├─ wrapper/agy.ts        (runAgy)        ─┐
  ├─ wrapper/checks.ts     (runChecks)      ├─ injected into ─▶ wrapper/loop.ts (runClosedLoop)
  ├─ decision/tier0.ts     (evaluateTier0)  │
  ├─ decision/tier1.ts     (tier1Judge)    ─┘
  └─ wrapper/escalation.ts (writeEscalationReport)   ◀── called on a failed LoopResult
```

`cli.ts` is intentionally the only file that knows about all four pieces at once. `loop.ts` receives them as injected functions (`LoopDeps`), so its tests use mocks and never need a real `agy` install or a real model. Swapping `agy` for another code generator, or Laya for another judge, only changes what gets passed into `LoopDeps`.

## The loop in one paragraph

Each iteration: run `agy` (or send it the previous fix instruction), stop immediately on an environment failure, run the checks, build a compact state payload, run Tier 0, escalate to Tier 1 only if Tier 0 is ambiguous, check for a repeated error, apply hysteresis, and return `done` only if the phase is `done` and the probability is strictly above 0.90. After 4 iterations without success, it escalates with the best-scoring attempt.

## Current status and next step

Nothing has been run against a real `agy` or a real Laya checkpoint yet. Build-order Step 1 (try both tools by hand) is the first thing to do. See `context.md` section 11 for the full build order and section 12 for open questions.
