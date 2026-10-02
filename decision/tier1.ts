import { DecisionResult, StatePayload } from '../types/index.js';

export const RAW_DONE_THRESHOLD = 0.90;

let modelPromise: Promise<any> | null = null;

/**
 * Lazy loads the Laya System-1 decision model once per process.
 */
export async function getModel(): Promise<any> {
    if (!modelPromise) {
        modelPromise = (async () => {
            const { Laya } = await import('@receptron/laya');
            // Cache model inside .cache/receptron-laya
            return await Laya.load({
                cacheDir: './.cache/receptron-laya'
            });
        })();
    }
    return modelPromise;
}

/**
 * Resets the cached model promise (primarily for testing and mocking).
 */
export function resetModel(): void {
    modelPromise = null;
}

/**
 * Tier 1 Semantic Judge backed by Laya.
 * Only invoked when Tier 0 returns ambiguous: true.
 */
export async function tier1Judge(payload: StatePayload, tier0: DecisionResult): Promise<DecisionResult> {
    const reasons = [...tier0.reasons];

    try {
        const model = await getModel();

        // 1. State compaction: send only goal, diff, and verified requirements to stay within token budget
        const state = {
            goal: payload.goal,
            diff: payload.currentCodeState,
            verifiedRequirements: payload.verifiedRequirements
        };

        // 2. Ask single noul question
        const questions = {
            satisfied: {
                type: 'noul' as const,
                instructions: 'Determine whether the code diff genuinely implements the stated goal. Answer false if the goal describes behavior that the diff does not actually implement or if it is merely an empty stub.',
                criteria: {
                    true: 'The code diff correctly satisfies and implements the requested goal.',
                    false: 'The code diff does not implement the requested goal or only partially implements it.'
                }
            }
        };

        const result = await model.systemOne(state, questions);
        const noul = result?.answers?.satisfied?.noul ?? 0;
        const passed = noul > RAW_DONE_THRESHOLD;

        reasons.push(`tier1 (Laya): noul=${noul.toFixed(3)} (threshold=${RAW_DONE_THRESHOLD})`);

        if (passed) {
            return {
                phase: 'done',
                score: tier0.score,
                ambiguous: false,
                passingProbability: noul,
                reasons
            };
        } else {
            return {
                phase: 'refine',
                score: tier0.score,
                ambiguous: false,
                passingProbability: noul,
                reasons,
                fixInstruction: `The code passed mechanical checks but semantic verification failed (confidence: ${noul.toFixed(2)}). Please ensure the implementation genuinely and completely satisfies the goal: "${payload.goal}".`
            };
        }
    } catch (err: any) {
        reasons.push(`tier1 (Laya) execution failed: ${err.message || String(err)}`);
        // Fall back safely to Tier 0 verdict with ambiguity cleared
        return {
            phase: 'refine',
            score: tier0.score,
            ambiguous: false,
            reasons,
            fixInstruction: `Semantic check could not be completed (${err.message}). Ensure requirement is implemented: "${payload.goal}".`
        };
    }
}
