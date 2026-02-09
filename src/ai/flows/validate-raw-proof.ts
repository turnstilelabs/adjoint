'use server';

/** @fileOverview Validates a raw (unstructured) proof text against the goal statement. */

import { ai, getLlmId, getLlmProvider, requireLlmApiKey } from '@/ai/genkit';
import { z } from 'genkit';
import { normalizeModelError } from '@/lib/model-error-core';
import { buildLlmCandidates } from '@/ai/llm-candidates';

const ValidateRawProofInputSchema = z.object({
    problem: z.string().describe('The original mathematical problem.'),
    rawProof: z.string().describe('A raw continuous proof text written in natural language/LaTeX.'),
});
export type ValidateRawProofInput = z.infer<typeof ValidateRawProofInputSchema>;

const ValidateRawProofOutputSchema = z.object({
    isValid: z.boolean().describe('Whether the proof is logically sound and complete.'),
    feedback: z
        .string()
        .describe(
            "If invalid: list only the concrete issues/gaps. If valid: a very brief confirmation (1–2 sentences), no suggestions.",
        ),
});
export type ValidateRawProofOutput = z.infer<typeof ValidateRawProofOutputSchema>;

export async function validateRawProof(
    input: ValidateRawProofInput,
): Promise<ValidateRawProofOutput> {
    return validateRawProofFlow(input);
}

const validateRawProofFlow = ai.defineFlow(
    {
        name: 'validateRawProofFlow',
        inputSchema: ValidateRawProofInputSchema,
        outputSchema: ValidateRawProofOutputSchema,
    },
    async (input: ValidateRawProofInput) => {
        const llmId = getLlmId();
        const provider = getLlmProvider();
        const candidates = buildLlmCandidates(provider, llmId);
        const apiKey = requireLlmApiKey();

        const user = `You are a meticulous mathematics professor reviewing a student's proof.

Your job is to determine whether the following raw proof text is a correct proof of the given original problem.

Original problem:
"${input.problem}"

Raw proof:
"""
${input.rawProof}
"""

CRITICAL RESPONSE STYLE REQUIREMENTS
- If the proof is VALID: set isValid=true and set feedback to a *very brief* confirmation (1–2 sentences). Do NOT provide suggestions, improvements, stylistic notes, or extra commentary.
- If the proof is INVALID: set isValid=false and set feedback to ONLY the issues/gaps/errors, referencing the relevant part(s) of the proof.
- Do NOT include headings like "Strengths" / "What is good" / "Summary".
- Do NOT add anything beyond what is needed to justify the verdict.

Return ONLY a single JSON object matching the required schema.`;

        let lastErr: any = null;
        for (const cand of candidates) {
            try {
                const { output } = await ai.generate({
                    model: cand,
                    prompt: user,
                    config: { apiKey },
                    output: { schema: ValidateRawProofOutputSchema },
                });
                if (!output) {
                    throw new Error('The AI failed to provide a validation result.');
                }
                return output;
            } catch (e: any) {
                const norm = normalizeModelError(e);
                lastErr = norm;
                if (norm.code === 'MODEL_RATE_LIMIT') continue;
                throw new Error(norm.message);
            }
        }

        throw new Error((lastErr && lastErr.message) || 'The AI failed to provide a validation result.');
    },
);
