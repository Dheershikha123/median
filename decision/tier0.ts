import { StatePayload, DecisionResult, Phase } from '../types/index.js';

export const LINT_PENALTY = 0.02;
export const TYPE_PENALTY = 0.05;

/**
 * Builds a targeted fix instruction based on the failure signals.
 */
export function buildFixInstruction(payload: StatePayload, reasons: string[]): string {
    const checks = payload.checks;
    const errors = Array.isArray(payload.executionErrors)
        ? payload.executionErrors.join('\n')
        : (payload.executionErrors || '');

    if (!checks || !checks.buildOk) {
        const errorDetail = payload.errorSignature || errors || 'Unknown build failure';
        return `Build failed. Fix compile/build errors before proceeding:\n${errorDetail.trim()}`;
    }

    if (checks.tests && checks.tests.failed > 0) {
        const detail = payload.errorSignature || errors ? `\nError details:\n${(payload.errorSignature || errors).trim()}` : '';
        return `Tests failed (${checks.tests.failed} of ${checks.tests.total} failing). Fix the code to pass all tests.${detail}`;
    }

    if (checks.typeErrors > 0) {
        return `TypeScript type checking failed with ${checks.typeErrors} error(s). Please resolve all type errors.`;
    }

    if (checks.lintErrors > 0) {
        return `Linter reported ${checks.lintErrors} error(s). Please fix the lint issues.`;
    }

    if (payload.currentCodeState.trim() === '') {
        return `No code changes detected. Please implement the requested goal: "${payload.goal}".`;
    }

    return `The solution needs refinement. Please ensure the code satisfies the goal: "${payload.goal}".`;
}

/**
 * Tier 0 Deterministic Rule Engine
 * Evaluates mechanical checks (build, tests, lint, types) sub-millisecond.
 */
export function evaluateTier0(payload: StatePayload): DecisionResult {
    const reasons: string[] = [];
    const checks = payload.checks;

    // 1. Build check
    if (!checks || !checks.buildOk) {
        reasons.push('Build failed');
        return {
            phase: 'refine',
            score: 0,
            ambiguous: false,
            reasons,
            fixInstruction: buildFixInstruction(payload, reasons)
        };
    }

    // 2. Score calculation
    const totalTests = checks.tests.total;
    const passedTests = checks.tests.passed;
    const passRate = totalTests > 0 ? passedTests / totalTests : 0;

    let score = passRate - (checks.lintErrors * LINT_PENALTY) - (checks.typeErrors * TYPE_PENALTY);
    score = Math.max(0, Math.min(1, Math.round(score * 1000) / 1000)); // Clamp [0, 1] with 3 decimals

    // 3. Concrete mechanical failures -> refine, not ambiguous
    const hasTestFailures = checks.tests.failed > 0;
    const hasLintErrors = checks.lintErrors > 0;
    const hasTypeErrors = checks.typeErrors > 0;

    if (hasTestFailures) {
        reasons.push(`Tests failing: ${checks.tests.failed}/${checks.tests.total}`);
    }
    if (hasTypeErrors) {
        reasons.push(`Type errors: ${checks.typeErrors}`);
    }
    if (hasLintErrors) {
        reasons.push(`Lint errors: ${checks.lintErrors}`);
    }

    if (hasTestFailures || hasTypeErrors || hasLintErrors) {
        return {
            phase: 'refine',
            score,
            ambiguous: false,
            reasons,
            fixInstruction: buildFixInstruction(payload, reasons)
        };
    }

    // 4. All mechanical checks clean -> Check for ambiguity
    const nothingChanged = payload.currentCodeState.trim() === '';
    const noTestsWereAdded = totalTests === 0 && (!payload.verifiedRequirements || payload.verifiedRequirements.length === 0);

    if (nothingChanged || noTestsWereAdded) {
        const ambiguityReason = nothingChanged ? 'No code changes in diff' : 'No tests exist to verify requirements';
        reasons.push(`Ambiguous: ${ambiguityReason}`);
        return {
            phase: 'refine',
            score,
            ambiguous: true,
            reasons,
            fixInstruction: buildFixInstruction(payload, reasons)
        };
    }

    // 5. Clean checks with non-empty diff and tests -> done
    reasons.push('All checks clean, tests passed');
    return {
        phase: 'done',
        score,
        ambiguous: false,
        reasons
    };
}
