# Laya Model Notes (Track B - Step 1 Verification)

## 1. Package & Availability

- **Package:** `@receptron/laya@0.1.2`
- **Installation:** Installed cleanly as an optional dependency via `npm install --save-optional @receptron/laya`.
- **Runtime:** Runs locally in Node.js via ONNX Runtime (`onnxruntime-node: ^1.22.0`) and `@huggingface/tokenizers: ^0.2.0`.
- **Hardware:** Default execution provider is CPU (`["cpu"]`). No GPU or remote API key required.

---

## 2. Checkpoint & Bundle Architecture

- **Hugging Face Repository:** `receptron/laya-onnx` (pre-converted ONNX bundle of `convaiinnovations/laya`).
- **Cache Directory:** Configured to `./.cache/receptron-laya` (git-ignored).
- **Bundle Files:**
  - `laya.onnx`
  - `laya.onnx.data` (weights ~850MB - 1.7GB)
  - `laya_config.json`
  - `tokenizer/tokenizer.json`
  - `tokenizer/tokenizer_config.json`
- **Underlying Architecture:** ModernBERT-large (421M parameters).

---

## 3. Verified API Surface

The real TypeScript types from `@receptron/laya/dist/types.d.ts` confirm the following request/response shapes:

### Loading
```ts
import { Laya } from '@receptron/laya';

const model = await Laya.load({
    cacheDir: './.cache/receptron-laya'
});
```

### Supported Question Primitives
1. **`choice`**: Categorical classification over criteria list.
2. **`score`**: Ordered level evaluation returning discrete score & probabilities.
3. **`noul`**: Calibrated probability $P(\text{true})$ that a requirement is satisfied.

### Invocation Shape (`systemOne`)
```ts
const result = await model.systemOne(state, {
    satisfied: {
        type: 'noul',
        instructions: 'Determine whether the code diff genuinely implements the stated goal.',
        criteria: {
            true: 'The code diff correctly satisfies and implements the requested goal.',
            false: 'The code diff does not implement the requested goal or only partially implements it.'
        }
    }
});

// Output shape:
// result.answers.satisfied.noul -> number in [0, 1]
// result.usage.input_tokens     -> input token count
// result.usage.output_tokens    -> output token count
```

---

## 4. Input Budget & Compaction Strategy

- **Context Window:** ~512 tokens maximum for the default checkpoint.
- **Compaction Rule:**
  - **Included:** `goal` (prompt), `diff` (only changed lines/hunks), and `verifiedRequirements` (array of requirement strings).
  - **Excluded:** Raw stdout/stderr, full file trees, and verbose test logs. Tier 1 is only invoked when Tier 0 mechanical checks are clean (`ambiguous: true`), so error logs are omitted.
- **Token Monitoring:** Every `systemOne` response returns `usage.input_tokens` which allows tracking state sizes across runs.

---

## 5. Decision Layer Integration

- **Tier 0:** Implemented in `decision/tier0.ts`. Evaluates build, test pass rates, lint errors, and type errors deterministically in < 1ms.
- **Tier 1:** Implemented in `decision/tier1.ts`. Lazy-loads `Laya`, caches the model instance across iterations, and evaluates ambiguous cases against `RAW_DONE_THRESHOLD = 0.90`.
- **Closed Loop:** Implemented in `wrapper/loop.ts`. Connects Track A runners with Tier 0 & Tier 1, enforcing 4 iterations max, stuck error detection, and hysteresis dead-band `[0.85, 0.90]`.
