export type Phase = 'generate' | 'refine' | 'done';

export interface Checks {
    buildOk: boolean;
    tests: { passed: number; failed: number; total: number };
    lintErrors: number;
    typeErrors: number;
}

export interface StatePayload {
    goal: string;
    iterationCount: number;
    currentCodeState: string;
    executionErrors: string[];
    errorSignature: string;
    previousErrorSignature: string;
    failureClass?: 'environment' | 'timeout' | 'code_bug';
    checks?: Checks;
    verifiedRequirements: string[];
}

export interface DecisionResult {
    phase: Phase;
    score: number;
    ambiguous: boolean;
    passingProbability?: number;
    reasons: string[];
    fixInstruction?: string;
}

export interface AgyResult {
    stdout: string;
    stderr: string;
    exitCode: number;
    failureClass?: 'environment' | 'timeout' | 'code_bug';
}

export interface EscalationReport {
    goal: string;
    iterations: number;
    bestAttemptScore: number;
    bestCodeState: string;
    history: string[];
}
