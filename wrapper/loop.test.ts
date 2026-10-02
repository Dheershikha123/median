import { describe, it, expect, vi } from 'vitest';
import { runClosedLoop, LoopDeps, MAX_ITERATIONS, DONE_THRESHOLD } from './loop.js';
import { AgyResult, Checks, DecisionResult, StatePayload } from '../types/index.js';

describe('runClosedLoop (7 exit paths)', () => {
    const defaultChecks: Checks = {
        buildOk: true,
        tests: { passed: 3, failed: 0, total: 3 },
        lintErrors: 0,
        typeErrors: 0
    };

    // Test 1: Returns done on iteration 1 when checks and score pass, and tier1Judge is not called
    it('1. Returns done on iteration 1 when checks and score pass, without calling tier1Judge', async () => {
        const runAgy = vi.fn().mockResolvedValue({
            stdout: 'export function ok() {}',
            stderr: '',
            exitCode: 0
        } as AgyResult);

        const runChecks = vi.fn().mockResolvedValue(defaultChecks);

        const evaluateTier0 = vi.fn().mockReturnValue({
            phase: 'done',
            score: 0.95,
            ambiguous: false,
            reasons: ['All checks passed']
        } as DecisionResult);

        const tier1Judge = vi.fn();

        const deps: LoopDeps = { runAgy, runChecks, evaluateTier0, tier1Judge };
        const result = await runClosedLoop('Make ok function', deps);

        expect(result.success).toBe(true);
        expect(result.reason).toBe('done');
        expect(result.iterations).toBe(1);
        expect(runAgy).toHaveBeenCalledTimes(1);
        expect(runChecks).toHaveBeenCalledTimes(1);
        expect(evaluateTier0).toHaveBeenCalledTimes(1);
        expect(tier1Judge).not.toHaveBeenCalled();
    });

    // Test 2: Stops at exactly 4 iterations and escalates as max_iterations
    it('2. Stops at exactly 4 iterations and escalates as max_iterations on continuous failure', async () => {
        let attempt = 0;
        const runAgy = vi.fn().mockImplementation(() => {
            attempt++;
            return Promise.resolve({
                stdout: `broken code ${attempt}`,
                stderr: `Compilation error variant ${attempt}`,
                exitCode: 1
            } as AgyResult);
        });

        const runChecks = vi.fn().mockResolvedValue({
            buildOk: false,
            tests: { passed: 0, failed: 1, total: 1 },
            lintErrors: 1,
            typeErrors: 1
        } as Checks);

        const evaluateTier0 = vi.fn().mockImplementation((payload: StatePayload) => ({
            phase: 'refine',
            score: 0.2,
            ambiguous: false,
            reasons: ['Build failed'],
            fixInstruction: `Fix build attempt ${payload.iterationCount}`
        } as DecisionResult));

        const tier1Judge = vi.fn();

        const deps: LoopDeps = { runAgy, runChecks, evaluateTier0, tier1Judge };
        const result = await runClosedLoop('Reverse a string', deps);

        expect(result.success).toBe(false);
        expect(result.reason).toBe('max_iterations');
        expect(result.iterations).toBe(MAX_ITERATIONS);
        expect(result.escalationReport).toBeDefined();
        expect(result.escalationReport?.iterations).toBe(4);
        expect(runAgy).toHaveBeenCalledTimes(4);
    });

    // Test 3: The same error repeating escalates as stuck in fewer than 4 iterations
    it('3. The same error repeating escalates as stuck in fewer than 4 iterations', async () => {
        const repeatedError = 'TypeError: Cannot read properties of undefined at foo.ts:14:2';

        const runAgy = vi.fn().mockResolvedValue({
            stdout: 'console.log()',
            stderr: repeatedError,
            exitCode: 1
        } as AgyResult);

        const runChecks = vi.fn().mockResolvedValue(defaultChecks);

        const evaluateTier0 = vi.fn().mockReturnValue({
            phase: 'refine',
            score: 0.5,
            ambiguous: false,
            reasons: ['Runtime error'],
            fixInstruction: 'Fix error'
        } as DecisionResult);

        const tier1Judge = vi.fn();

        const deps: LoopDeps = { runAgy, runChecks, evaluateTier0, tier1Judge };
        const result = await runClosedLoop('Fix bug', deps);

        expect(result.success).toBe(false);
        expect(result.reason).toBe('stuck');
        expect(result.iterations).toBeLessThan(MAX_ITERATIONS);
        expect(result.escalationReport).toBeDefined();
    });

    // Test 4: An environment failure stops immediately and runChecks is never called
    it('4. An environment failure stops immediately and runChecks is never called', async () => {
        const runAgy = vi.fn().mockResolvedValue({
            stdout: '',
            stderr: 'agy: command not found',
            exitCode: 127,
            failureClass: 'environment'
        } as AgyResult);

        const runChecks = vi.fn();
        const evaluateTier0 = vi.fn();
        const tier1Judge = vi.fn();

        const deps: LoopDeps = { runAgy, runChecks, evaluateTier0, tier1Judge };
        const result = await runClosedLoop('Do something', deps);

        expect(result.success).toBe(false);
        expect(result.reason).toBe('environment_error');
        expect(result.iterations).toBe(1);
        expect(runChecks).not.toHaveBeenCalled();
        expect(evaluateTier0).not.toHaveBeenCalled();
        expect(tier1Judge).not.toHaveBeenCalled();
    });

    // Test 5: When Tier 0 flags ambiguity, tier1Judge is called exactly once and can resolve to done
    it('5. When Tier 0 flags ambiguity, tier1Judge is called and can resolve to done', async () => {
        const runAgy = vi.fn().mockResolvedValue({
            stdout: 'export function paginate() {}',
            stderr: '',
            exitCode: 0
        } as AgyResult);

        const runChecks = vi.fn().mockResolvedValue(defaultChecks);

        const evaluateTier0 = vi.fn().mockReturnValue({
            phase: 'refine',
            score: 0.8,
            ambiguous: true,
            reasons: ['Checks clean but diff needs verification']
        } as DecisionResult);

        const tier1Judge = vi.fn().mockResolvedValue({
            phase: 'done',
            score: 0.8,
            passingProbability: 0.96,
            ambiguous: false,
            reasons: ['Tier 1 (Laya): requirements verified']
        } as DecisionResult);

        const deps: LoopDeps = { runAgy, runChecks, evaluateTier0, tier1Judge };
        const result = await runClosedLoop('Implement pagination', deps);

        expect(result.success).toBe(true);
        expect(result.reason).toBe('done');
        expect(result.iterations).toBe(1);
        expect(tier1Judge).toHaveBeenCalledTimes(1);
    });

    // Test 6: Tier 1 can also fail repeatedly across all 4 iterations, and the loop escalates
    it('6. Tier 1 failing repeatedly causes loop to escalate as max_iterations', async () => {
        const runAgy = vi.fn().mockResolvedValue({
            stdout: 'export function fake() {}',
            stderr: '',
            exitCode: 0
        } as AgyResult);

        const runChecks = vi.fn().mockResolvedValue(defaultChecks);

        const evaluateTier0 = vi.fn().mockReturnValue({
            phase: 'refine',
            score: 0.8,
            ambiguous: true,
            reasons: ['Diff requires semantic check']
        } as DecisionResult);

        const tier1Judge = vi.fn().mockResolvedValue({
            phase: 'refine',
            score: 0.8,
            passingProbability: 0.40,
            ambiguous: false,
            reasons: ['Tier 1 (Laya): requirements missing in diff'],
            fixInstruction: 'Please implement pagination logic, not just empty stub'
        } as DecisionResult);

        const deps: LoopDeps = { runAgy, runChecks, evaluateTier0, tier1Judge };
        const result = await runClosedLoop('Add pagination', deps);

        expect(result.success).toBe(false);
        expect(result.reason).toBe('max_iterations');
        expect(result.iterations).toBe(MAX_ITERATIONS);
        expect(tier1Judge).toHaveBeenCalledTimes(4);
    });

    // Test 7: Hysteresis holds a done result through one iteration where score dips just below 0.90
    it('7. Hysteresis holds a done result when score dips into [0.85, 0.90] after a done phase', async () => {
        const runAgy = vi.fn().mockResolvedValue({
            stdout: 'export function compute() {}',
            stderr: '',
            exitCode: 0
        } as AgyResult);

        const runChecks = vi.fn().mockResolvedValue(defaultChecks);

        // Iteration 1: done with score 0.92 (> 0.90), but let's say user wants loop or first iter was done:
        // Actually, if iter 1 returns done, loop would exit on iter 1 unless it needs another pass or tests a sequence.
        // To test hysteresis properly across iterations:
        // Iteration 1: returns done with score 0.92, but loop checks hysteresis when score is [0.85, 0.90].
        // Let's test:
        // Iter 1: evaluateTier0 returns refine (score 0.8).
        // Wait! In order for previousPhase to be 'done', how does an earlier iteration produce 'done' without exiting?
        // Ah! In context.md section 5:
        // "The loop ends successfully only when phase === 'done' AND passing probability > 0.90."
        // If an iteration has phase === 'done', but passingProbability / score was 0.88, under raw threshold it would NOT pass (> 0.90).
        // But with hysteresis: on next iteration, if previous was 'done' and score is in [0.85, 0.90], it holds done!
        // Or in a multi-step check:
        let callCount = 0;
        const evaluateTier0 = vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
                // Iter 1: phase was 'done', but score was 0.90 exactly (does not pass strictly > 0.90!)
                return {
                    phase: 'done',
                    score: 0.90, // strictly > 0.90 fails, so doesn't exit yet!
                    ambiguous: false,
                    reasons: ['Score is 0.90, right at boundary'],
                    fixInstruction: 'Slight improvement needed'
                } as DecisionResult;
            } else {
                // Iter 2: score dips to 0.88 (in [0.85, 0.90])
                return {
                    phase: 'refine',
                    score: 0.88,
                    ambiguous: false,
                    reasons: ['Minor lint noise dipped score to 0.88']
                } as DecisionResult;
            }
        });

        const tier1Judge = vi.fn();

        const deps: LoopDeps = { runAgy, runChecks, evaluateTier0, tier1Judge };
        const result = await runClosedLoop('Build calculation engine', deps);

        expect(result.success).toBe(true);
        expect(result.reason).toBe('done');
        expect(result.iterations).toBe(2);
        expect(result.trace[1].decision.reasons.some(r => r.includes('Hysteresis'))).toBe(true);
    });
});
