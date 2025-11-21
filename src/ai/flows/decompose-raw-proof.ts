
/**
 * @fileOverview Decomposes a raw proof text into a proved statement and sublemmas.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { SublemmaSchema } from './schemas';

const DecomposeRawProofInputSchema = z.object({
    rawProof: z
        .string()
        .min(10)
        .describe('The raw continuous proof text produced by the attempt-proof flow.'),
});
export type DecomposeRawProofInput = z.infer<typeof DecomposeRawProofInputSchema>;

const DecomposeRawProofOutputSchema = z.object({
    provedStatement: z
        .string()
        .describe('The precise mathematical statement that the provided proof text actually establishes.'),
    sublemmas: z.array(SublemmaSchema).describe('A sequence of sublemmas consistent with the proof.'),
    normalizedProof: z
        .string()
        .describe('An optional cleaned/normalized rendering of the full proof for export and display.'),
});
export type DecomposeRawProofOutput = z.infer<typeof DecomposeRawProofOutputSchema>;

export async function decomposeRawProof(
    input: DecomposeRawProofInput,
): Promise<DecomposeRawProofOutput> {
    return decomposeRawProofFlow(input);
}

const prompt = ai.definePrompt({
    name: 'decomposeRawProofPrompt',
    input: { schema: DecomposeRawProofInputSchema },
    output: { schema: DecomposeRawProofOutputSchema },
    system:
        'You are a mathematical writing expert. Return ONLY a single JSON object matching the schema. No markdown fences or extra text.',
    prompt: `Given a raw mathematical proof, extract:
- provedStatement: the exact claim that the proof establishes (LaTeX allowed)
- sublemmas: a list where each element has { title, statement, proof } using LaTeX where appropriate
- normalizedProof: the same proof, cleaned/normalized into a single coherent text block (LaTeX allowed)

Raw proof:
"""
{{{rawProof}}}
"""

Strict output shape:
{"provedStatement":string,"sublemmas":[{"title":string,"statement":string,"proof":string},...],"normalizedProof":string}`,
});

const decomposeRawProofFlow = ai.defineFlow(
    {
        name: 'decomposeRawProofFlow',
        inputSchema: DecomposeRawProofInputSchema,
        outputSchema: DecomposeRawProofOutputSchema,
    },
    async (input: DecomposeRawProofInput) => {
        const { output } = await prompt(input);
        if (!output) {
            throw new Error('The AI failed to decompose the raw proof.');
        }
        return output;
    },
);
