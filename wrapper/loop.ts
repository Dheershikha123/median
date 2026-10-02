import {
    AgyResult,
    Checks,
    DecisionResult,
    EscalationReport,
    Phase,
    StatePayload
} from '../types/index.js';

export const MAX_ITERATIONS = 4;
export const DONE_THRESHOLD = 0.90;
export const HYSTERESIS_FLOOR = 0.85;
export const STUCK_AFTER_REPEATS = 2;

export interface LoopDeps {
    runAgy: (prompt: string) => Promise<AgyResult>;
    runChecks: (code: string) => Promise<Checks>;
    evaluateTier0: (payload: StatePayload) => DecisionResult;
    tier1Judge: (payload: StatePayload, tier0: DecisionResult) => Promise<DecisionResult>;
}

export interface IterationLog {
    iteration: number;
    promptSent: string;
    agyResult: AgyResult;
    checks?: Checks;
    errorSignature?: string;
    decision: DecisionResult;
}

export type ExitReason = 'done' | 'max_iterations' | 'stuck' | 'environment_error';

export interface LoopResult {
    success: boolean;
    reason: ExitReason;
    finalCode?: string;
    iterations: number;
    bestScore: number;
    bestCode?: string;
    escalationReport?: EscalationReport;
    trace: IterationLog[];
}

/**
 * Strips line and column numbers so the same error in different positions
 * yields an identical signature for stuck detection.
 */
export function signatureOf(error?: string): string {
    if (!error) return '';
    return error.replace(/:\d+:\d+/g, '').trim();
}

/**
 * Executes the closed-loop agentic workflow.
 */
export async function runClosedLoop(goal: string, deps: LoopDeps): Promise<LoopResult> {
    const trace: IterationLog[] = [];
    let currentPrompt = goal;
    let previousErrorSignature = '';
    let consecutiveRepeatCount = 0;
    let previousPhase: Phase | undefined;
    let bestScore = -1;
    let bestCode = '';
    let verifiedRequirements: string[] = [];

    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
        // 1. Run agy (initial prompt or previous fix instruction)
        const agyResult = await deps.runAgy(currentPrompt);
        const currentCode = agyResult.stdout;

        // 2. Immediate exit on environment errors (do NOT run checks)
        if (agyResult.failureClass === 'environment') {
            const report: EscalationReport = {
                goal,
                iterations: iter + 1,
                bestAttemptScore: bestScore >= 0 ? bestScore : 0,
                bestCodeState: bestCode || currentCode,
                history: trace.map(t => `[iter ${t.iteration}] phase=${t.decision.phase} score=${t.decision.score} reasons=${t.decision.reasons.join(', ')}`)
            };
            report.history.push(`[iter ${iter + 1}] environment error: ${agyResult.stderr || 'Command not found or environment issue'}`);

            return {
                success: false,
                reason: 'environment_error',
                iterations: iter + 1,
                bestScore: Math.max(0, bestScore),
                bestCode: bestCode || currentCode,
                escalationReport: report,
                trace
            };
        }

        // 3. Run checks on generated code
        const checks = await deps.runChecks(currentCode);

        // 4. Compute error signature
        const rawErrors = agyResult.stderr ? [agyResult.stderr] : [];
        const currentErrorSignature = signatureOf(agyResult.stderr || (checks.buildOk ? '' : 'build_failed'));

        // 5. Build state payload and evaluate Tier 0
        const payload: StatePayload = {
            goal,
            iterationCount: iter + 1,
            currentCodeState: currentCode,
            executionErrors: rawErrors,
            errorSignature: currentErrorSignature,
            previousErrorSignature,
            failureClass: agyResult.failureClass,
            checks,
            verifiedRequirements
        };

        let decision = deps.evaluateTier0(payload);

        // 6. Escalate to Tier 1 ONLY if Tier 0 is ambiguous
        if (decision.ambiguous) {
            decision = await deps.tier1Judge(payload, decision);
        }

        // 7. Stuck detection: track repeating error signatures
        if (currentErrorSignature && currentErrorSignature === previousErrorSignature) {
            consecutiveRepeatCount++;
            if (consecutiveRepeatCount >= STUCK_AFTER_REPEATS) {
                // Escalate as stuck
                trace.push({
                    iteration: iter + 1,
                    promptSent: currentPrompt,
                    agyResult,
                    checks,
                    errorSignature: currentErrorSignature,
                    decision
                });

                const report: EscalationReport = {
                    goal,
                    iterations: iter + 1,
                    bestAttemptScore: Math.max(bestScore, decision.score),
                    bestCodeState: bestCode || currentCode,
                    history: trace.map(t => `[iter ${t.iteration}] phase=${t.decision.phase} score=${t.decision.score} reasons=${t.decision.reasons.join(', ')}`)
                };

                return {
                    success: false,
                    reason: 'stuck',
                    iterations: iter + 1,
                    bestScore: Math.max(bestScore, decision.score),
                    bestCode: bestCode || currentCode,
                    escalationReport: report,
                    trace
                };
            } else {
                // Rewrite fix instruction to steer away from repeated error
                decision.fixInstruction = `Repeated error detected: "${currentErrorSignature}". Try an alternative implementation strategy to solve: ${goal}`;
            }
        } else {
            consecutiveRepeatCount = 0;
        }

        previousErrorSignature = currentErrorSignature;

        // 8. Hysteresis (dead-band): hold done if previous iteration was done and score is in [0.85, 0.90]
        let hysteresisApplied = false;
        const currentProb = decision.passingProbability ?? decision.score;

        if (iter > 0 && previousPhase === 'done' && currentProb >= HYSTERESIS_FLOOR && currentProb <= DONE_THRESHOLD) {
            decision.phase = 'done';
            hysteresisApplied = true;
            decision.reasons.push(`Hysteresis applied: held 'done' phase for score ${currentProb} in [${HYSTERESIS_FLOOR}, ${DONE_THRESHOLD}]`);
        }

        // Track best attempt so far
        if (decision.score > bestScore) {
            bestScore = decision.score;
            bestCode = currentCode;
        }

        // Log iteration
        trace.push({
            iteration: iter + 1,
            promptSent: currentPrompt,
            agyResult,
            checks,
            errorSignature: currentErrorSignature,
            decision
        });

        // 9. Enforcement check: return done only if phase is done AND probability > 0.90 (or held by hysteresis)
        if (decision.phase === 'done' && (currentProb > DONE_THRESHOLD || hysteresisApplied)) {
            return {
                success: true,
                reason: 'done',
                finalCode: currentCode,
                iterations: iter + 1,
                bestScore: Math.max(bestScore, decision.score),
                bestCode: currentCode,
                trace
            };
        }

        // Prepare next prompt from fix instruction
        previousPhase = decision.phase;
        currentPrompt = decision.fixInstruction || `The previous attempt failed. Please fix the code to meet the goal: ${goal}`;
    }

    // 10. Maximum iterations reached -> Escalate with best attempt
    const escalationReport: EscalationReport = {
        goal,
        iterations: MAX_ITERATIONS,
        bestAttemptScore: bestScore >= 0 ? bestScore : 0,
        bestCodeState: bestCode,
        history: trace.map(t => `[iter ${t.iteration}] phase=${t.decision.phase} score=${t.decision.score} reasons=${t.decision.reasons.join(', ')}`)
    };

    return {
        success: false,
        reason: 'max_iterations',
        iterations: MAX_ITERATIONS,
        bestScore: Math.max(0, bestScore),
        bestCode,
        escalationReport,
        trace
    };
}
