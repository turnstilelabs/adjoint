
/**
 * @fileOverview Attempts to prove a given statement and classifies the result.
 * Folded design: the model both attempts a proof and reports whether it proved
 * the statement as-is, a variant, or failed entirely.
 */

import { ai, llmId } from '@/ai/genkit';
import { z } from 'genkit';
import { env } from '@/env';
import { normalizeModelError } from '@/lib/model-error-core';

const AttemptProofInputSchema = z.object({
    problem: z.string().describe('The original statement the user asked to prove.'),
});
export type AttemptProofInput = z.infer<typeof AttemptProofInputSchema>;

const AttemptProofOutputSchema = z.object({
    status: z.enum(['PROVED_AS_IS', 'PROVED_VARIANT', 'FAILED']).describe('Outcome of the attempt.'),
    finalStatement: z.string().nullable().describe(
        'If PROVED_AS_IS, echoes the input; if PROVED_VARIANT, the exact statement that was proved; null on FAILED.'
    ),
    variantType: z
        .enum(['WEAKENING', 'OPPOSITE'])
        .nullable()
        .describe('For PROVED_VARIANT only: whether the proved statement is a weakening or the opposite.'),
    rawProof: z.string().nullable().describe('Raw continuous proof text when proof succeeded; null on FAILED.'),
    explanation: z
        .string()
        .describe('One-paragraph user-facing explanation: why variant/why failed, concise and precise.'),
});
export type AttemptProofOutput = z.infer<typeof AttemptProofOutputSchema>;

export async function attemptProof(input: AttemptProofInput): Promise<AttemptProofOutput> {
    return attemptProofFlow(input);
}

const attemptProofFlow = ai.defineFlow(
    {
        name: 'attemptProofFlow',
        inputSchema: AttemptProofInputSchema,
        outputSchema: AttemptProofOutputSchema,
    },
    async (input: AttemptProofInput) => {
        const provider = (llmId.split('/')?.[0]) || 'unknown';
        const candidates: string[] = [];
        if (provider === 'googleai') {
            candidates.push(llmId);
            const proId = 'googleai/gemini-2.5-pro';
            if (llmId !== proId) candidates.push(proId);
            if (env.OPENAI_API_KEY) candidates.push('openai/gpt-4o-mini');
        } else {
            candidates.push(llmId);
        }

        const system = 'You are a rigorous mathematician. Return ONLY a single JSON object that matches the required schema. Do not include markdown fences or extra text.';
        const user = `Task: Attempt to prove the following statement. If you must modify it to obtain a correct proof, do so explicitly and classify the modification.\n\nOriginal statement:\n"${input.problem}"\n\nOutcome classification\n- If you can prove the original as-is, set status = PROVED_AS_IS, finalStatement = the original, variantType = null.\n- If you can instead prove a different but closely related statement, set status = PROVED_VARIANT, finalStatement = the exact proved statement, and variantType = one of:\n  • WEAKENING (a weaker claim than the original)\n  • OPPOSITE (close to the negation/opposite of the original)\n- If you cannot provide a correct proof, set status = FAILED and explain succinctly why (explanation). In this case rawProof and finalStatement must be null.\n\nRequirements for rawProof when status ≠ FAILED\n- Provide a complete, self-contained, multi-sentence proof (no outlines or mere sketches). Use clear narrative text; LaTeX is allowed for math ($...$ or $$...$$) but avoid bullet lists.\n- Be explicit: no large logical leaps; include key justifications (algebraic/analytic steps, quantifier reasoning, set/number theoretic details) that establish correctness.\n- If providing a counterexample, construct it explicitly and verify all required properties step by step.\n- Structure guidance: when the argument is non-trivial, naturally organize into 2–6 logical segments (paragraphs). For trivial statements, a concise direct proof is fine.\n\nStrict output shape:\n{"status":"PROVED_AS_IS|PROVED_VARIANT|FAILED","finalStatement":string|null,"variantType":"WEAKENING|OPPOSITE"|null,"rawProof":string|null,"explanation":string}`;

        let lastErr: any = null;
        for (const cand of candidates) {
            try {
                const { output } = await ai.generate({
                    model: cand,
                    system,
                    prompt: user,
                    output: { schema: AttemptProofOutputSchema },
                });
                if (!output) {
                    throw new Error('The AI failed to return an attempt result.');
                }
                return output;
            } catch (e: any) {
                const norm = normalizeModelError(e);
                lastErr = norm;
                if (norm.code === 'MODEL_RATE_LIMIT') continue;
                throw new Error(norm.message);
            }
        }
        throw new Error((lastErr && lastErr.message) || 'The AI failed to return an attempt result.');
    }
);
