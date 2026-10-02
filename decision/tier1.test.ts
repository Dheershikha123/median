import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tier1Judge, RAW_DONE_THRESHOLD, resetModel } from './tier1.js';
import { DecisionResult, StatePayload } from '../types/index.js';

vi.mock('@receptron/laya', () => {
    return {
        Laya: {
            load: vi.fn()
        }
    };
});

describe('tier1Judge (Laya Semantic Judge)', () => {
    let mockSystemOne: any;

    beforeEach(async () => {
        resetModel();
        vi.clearAllMocks();

        const { Laya } = await import('@receptron/laya');
        mockSystemOne = vi.fn();
        (Laya.load as any).mockResolvedValue({
            systemOne: mockSystemOne
        });
    });

    const basePayload: StatePayload = {
        goal: 'Implement user pagination',
        iterationCount: 1,
        currentCodeState: '+ export function paginate() { ... }',
        executionErrors: [],
        errorSignature: '',
        previousErrorSignature: '',
        checks: {
            buildOk: true,
            tests: { passed: 2, failed: 0, total: 2 },
            lintErrors: 0,
            typeErrors: 0
        },
        verifiedRequirements: ['users API exists']
    };

    const ambiguousTier0: DecisionResult = {
        phase: 'refine',
        score: 0.85,
        ambiguous: true,
        reasons: ['Tier 0 marked ambiguous']
    };

    it('returns done when noul score is above RAW_DONE_THRESHOLD', async () => {
        mockSystemOne.mockResolvedValueOnce({
            model: 'receptron/laya-onnx',
            answers: {
                satisfied: {
                    type: 'noul',
                    noul: 0.95,
                    rl_agent: { act_probability: 0.95 }
                }
            },
            usage: { input_tokens: 120, output_tokens: 10 }
        });

        const result = await tier1Judge(basePayload, ambiguousTier0);

        expect(result.phase).toBe('done');
        expect(result.passingProbability).toBe(0.95);
        expect(result.ambiguous).toBe(false);
        expect(result.fixInstruction).toBeUndefined();
        expect(mockSystemOne).toHaveBeenCalledWith(
            {
                goal: basePayload.goal,
                diff: basePayload.currentCodeState,
                verifiedRequirements: basePayload.verifiedRequirements
            },
            expect.objectContaining({
                satisfied: expect.objectContaining({ type: 'noul' })
            })
        );
    });

    it('returns refine with targeted fix instruction when noul score is <= 0.90', async () => {
        mockSystemOne.mockResolvedValueOnce({
            model: 'receptron/laya-onnx',
            answers: {
                satisfied: {
                    type: 'noul',
                    noul: 0.42,
                    rl_agent: { act_probability: 0.42 }
                }
            },
            usage: { input_tokens: 120, output_tokens: 10 }
        });

        const result = await tier1Judge(basePayload, ambiguousTier0);

        expect(result.phase).toBe('refine');
        expect(result.passingProbability).toBe(0.42);
        expect(result.ambiguous).toBe(false);
        expect(result.fixInstruction).toContain('semantic verification failed (confidence: 0.42)');
    });

    it('handles Laya failure gracefully without throwing', async () => {
        mockSystemOne.mockRejectedValueOnce(new Error('Checkpoint download failed or offline'));

        const result = await tier1Judge(basePayload, ambiguousTier0);

        expect(result.phase).toBe('refine');
        expect(result.ambiguous).toBe(false);
        expect(result.reasons.some(r => r.includes('tier1 (Laya) execution failed'))).toBe(true);
        expect(result.fixInstruction).toContain('Semantic check could not be completed');
    });
});
