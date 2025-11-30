/**
 * @fileOverview Classifies a drafted proof relative to the original statement.
 * Returns AttemptProof-like fields except rawProof (which the caller already has).
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const ClassifyProofDraftInputSchema = z.object({
    problem: z.string().describe('The original statement the user asked to prove.'),
    rawProof: z.string().min(10).describe('The drafted proof text to classify.'),
});
export type ClassifyProofDraftInput = z.infer<typeof ClassifyProofDraftInputSchema>;

export const ClassifyProofDraftOutputSchema = z.object({
    status: z.enum(['PROVED_AS_IS', 'PROVED_VARIANT', 'FAILED']).describe('Outcome of the attempt.'),
    finalStatement: z
        .string()
        .nullable()
        .describe('If PROVED_AS_IS, echo the original; if PROVED_VARIANT, the exact proved statement; null on FAILED.'),
    variantType: z
        .enum(['WEAKENING', 'OPPOSITE'])
        .nullable()
        .describe('For PROVED_VARIANT only: whether the proved statement is a weakening or the opposite.'),
    explanation: z
        .string()
        .describe('One-paragraph user-facing explanation: why variant/why failed, concise and precise.'),
});
export type ClassifyProofDraftOutput = z.infer<typeof ClassifyProofDraftOutputSchema>;

export async function classifyProofDraft(input: ClassifyProofDraftInput): Promise<ClassifyProofDraftOutput> {
    return classifyProofDraftFlow(input);
}

const prompt = ai.definePrompt({
    name: 'classifyProofDraftPrompt',
    input: { schema: ClassifyProofDraftInputSchema },
    output: { schema: ClassifyProofDraftOutputSchema },
    system:
        'You are a rigorous mathematician. Return ONLY a single JSON object that matches the required schema. Do not include markdown fences or extra text.',
    prompt: `Task: You are given an original statement and a drafted proof text. Classify whether the drafted proof proves the statement as-is, proves a closely related variant, or fails.

Original statement:
"{{{problem}}}"

Drafted proof:
"""
{{{rawProof}}}
"""

Classification
- If the draft proves the original as-is, set status = PROVED_AS_IS, finalStatement = the original, variantType = null.
- If the draft instead proves a different but closely related statement, set status = PROVED_VARIANT, finalStatement = the exact proved statement, and variantType = one of:
  • WEAKENING (a weaker claim than the original)
  • OPPOSITE (close to the negation/opposite of the original)
- If you cannot be confident the draft is a correct proof of any specific claim, set status = FAILED and explain succinctly why (explanation). In this case finalStatement must be null.

Strict output shape:
{"status":"PROVED_AS_IS|PROVED_VARIANT|FAILED","finalStatement":string|null,"variantType":"WEAKENING|OPPOSITE"|null,"explanation":string}`,
});

const classifyProofDraftFlow = ai.defineFlow(
    {
        name: 'classifyProofDraftFlow',
        inputSchema: ClassifyProofDraftInputSchema,
        outputSchema: ClassifyProofDraftOutputSchema,
    },
    async (input: ClassifyProofDraftInput) => {
        const { output } = await prompt(input);
        if (!output) {
            throw new Error('The AI failed to classify the drafted proof.');
        }
        return output;
    },
);
