'use server';
/**
 * @fileOverview Validates a single sublemma/step in context of the whole proof.
 *
 * This is a more local “proof structure” analysis than validate-proof.ts:
 * we ask the model to focus on one step’s statement+proof and how it fits into the chain.
 */

import { ai, llmId } from '@/ai/genkit';
import { z } from 'genkit';
import { SublemmaSchema } from './schemas';
import { env } from '@/env';
import { normalizeModelError } from '@/lib/model-error-core';

const ValidateSublemmaInputSchema = z.object({
    problem: z.string().describe('The original mathematical problem.'),
    proofSteps: z.array(SublemmaSchema).describe('All proof steps, for context.'),
    stepIndex: z
        .number()
        .int()
        .min(0)
        .describe('0-based index of the step to analyze.'),
});
export type ValidateSublemmaInput = z.infer<typeof ValidateSublemmaInputSchema>;

const ValidateSublemmaOutputSchema = z.object({
    isValid: z
        .boolean()
        .describe('Whether this step is correct and appropriately justified in context.'),
    feedback: z
        .string()
        .describe(
            'Feedback focusing on this step: correctness, missing assumptions, unclear reasoning, or why it is valid.',
        ),
});
export type ValidateSublemmaOutput = z.infer<typeof ValidateSublemmaOutputSchema>;

export async function validateSublemma(
    input: ValidateSublemmaInput,
): Promise<ValidateSublemmaOutput> {
    return validateSublemmaFlow(input);
}

const validateSublemmaFlow = ai.defineFlow(
    {
        name: 'validateSublemmaFlow',
        inputSchema: ValidateSublemmaInputSchema,
        outputSchema: ValidateSublemmaOutputSchema,
    },
    async (input: ValidateSublemmaInput) => {
        const provider = llmId.split('/')?.[0] || 'unknown';
        const candidates: string[] = [];

        if (provider === 'googleai') {
            candidates.push(llmId);
            const proId = 'googleai/gemini-2.5-pro';
            if (llmId !== proId) candidates.push(proId);
            if (env.OPENAI_API_KEY) candidates.push('openai/gpt-4o-mini');
        } else {
            candidates.push(llmId);
        }

        const k = input.stepIndex + 1;
        const stepsText = input.proofSteps
            .map(
                (s, i) =>
                    `Step ${i + 1}: ${s.title}\nStatement: ${s.statement}\nProof: ${s.proof}`,
            )
            .join('\n\n');

        const user = `You are a meticulous mathematics professor reviewing a student's proof.

Original Problem:
"${input.problem}"

Tentative Proof Steps (for context):
${stepsText}

Your task: analyze ONLY Step ${k}.

Check for:
1) Correctness of the step's statement.
2) Correctness of the step's proof.
3) Whether the step is appropriately justified given earlier steps and reasonable background facts.
4) If invalid: name what is missing or wrong, and what would fix it.

Return JSON with fields:
- isValid: boolean
- feedback: string
`;

        let lastErr: any = null;
        for (const cand of candidates) {
            try {
                const { output } = await ai.generate({
                    model: cand,
                    prompt: user,
                    output: { schema: ValidateSublemmaOutputSchema },
                });
                if (!output) throw new Error('The AI failed to provide a validation result.');
                return output;
            } catch (e: any) {
                const norm = normalizeModelError(e);
                lastErr = norm;
                if (norm.code === 'MODEL_RATE_LIMIT') continue;
                throw new Error(norm.message);
            }
        }

        throw new Error(
            (lastErr && lastErr.message) || 'The AI failed to provide a validation result.',
        );
    },
);
