import { describe, it, expect } from 'vitest';
import { evaluateTier0, buildFixInstruction } from './tier0.js';
import { StatePayload } from '../types/index.js';

function createPayload(overrides: Partial<StatePayload> = {}): StatePayload {
    return {
        goal: 'Reverse a string and write unit tests',
        iterationCount: 1,
        currentCodeState: '+ export function reverse(s: string) { return s.split("").reverse().join(""); }',
        executionErrors: [],
        errorSignature: '',
        previousErrorSignature: '',
        checks: {
            buildOk: true,
            tests: { passed: 3, failed: 0, total: 3 },
            lintErrors: 0,
            typeErrors: 0
        },
        verifiedRequirements: [],
        ...overrides
    };
}

describe('evaluateTier0', () => {
    it('returns score 0 and refine when build fails', () => {
        const payload = createPayload({
            checks: {
                buildOk: false,
                tests: { passed: 0, failed: 0, total: 0 },
                lintErrors: 0,
                typeErrors: 2
            }
        });

        const result = evaluateTier0(payload);
        expect(result.phase).toBe('refine');
        expect(result.score).toBe(0);
        expect(result.ambiguous).toBe(false);
        expect(result.fixInstruction).toContain('Build failed');
    });

    it('returns refine and calculates pass rate when tests fail', () => {
        const payload = createPayload({
            checks: {
                buildOk: true,
                tests: { passed: 2, failed: 1, total: 3 },
                lintErrors: 0,
                typeErrors: 0
            },
            errorSignature: 'AssertionError: expected "olleh" to be "hello"'
        });

        const result = evaluateTier0(payload);
        expect(result.phase).toBe('refine');
        expect(result.score).toBeCloseTo(0.667, 2);
        expect(result.ambiguous).toBe(false);
        expect(result.fixInstruction).toContain('Tests failed (1 of 3 failing)');
    });

    it('applies lint penalty and flags refine even if all tests pass', () => {
        const payload = createPayload({
            checks: {
                buildOk: true,
                tests: { passed: 3, failed: 0, total: 3 },
                lintErrors: 1,
                typeErrors: 0
            }
        });

        const result = evaluateTier0(payload);
        expect(result.phase).toBe('refine');
        expect(result.score).toBeCloseTo(0.98, 2);
        expect(result.ambiguous).toBe(false);
        expect(result.fixInstruction).toContain('Linter reported 1 error(s)');
    });

    it('applies type error penalty and flags refine', () => {
        const payload = createPayload({
            checks: {
                buildOk: true,
                tests: { passed: 3, failed: 0, total: 3 },
                lintErrors: 0,
                typeErrors: 1
            }
        });

        const result = evaluateTier0(payload);
        expect(result.phase).toBe('refine');
        expect(result.score).toBeCloseTo(0.95, 2);
        expect(result.ambiguous).toBe(false);
        expect(result.fixInstruction).toContain('TypeScript type checking failed with 1 error(s)');
    });

    it('returns done with score 1 when all checks are green with non-empty diff', () => {
        const payload = createPayload();
        const result = evaluateTier0(payload);

        expect(result.phase).toBe('done');
        expect(result.score).toBe(1);
        expect(result.ambiguous).toBe(false);
        expect(result.fixInstruction).toBeUndefined();
    });

    it('flags ambiguous when all checks are clean but diff is empty', () => {
        const payload = createPayload({
            currentCodeState: ''
        });

        const result = evaluateTier0(payload);
        expect(result.ambiguous).toBe(true);
        expect(result.phase).toBe('refine');
        expect(result.fixInstruction).toContain('No code changes detected');
    });

    it('flags ambiguous when no tests were added or ran', () => {
        const payload = createPayload({
            checks: {
                buildOk: true,
                tests: { passed: 0, failed: 0, total: 0 },
                lintErrors: 0,
                typeErrors: 0
            },
            verifiedRequirements: []
        });

        const result = evaluateTier0(payload);
        expect(result.ambiguous).toBe(true);
        expect(result.phase).toBe('refine');
        expect(result.reasons).toContain('Ambiguous: No tests exist to verify requirements');
    });
});
