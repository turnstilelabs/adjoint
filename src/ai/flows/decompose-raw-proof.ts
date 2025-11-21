
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
    prompt: `Instructions
Input: A mathematical proof text (possibly short, counterexample-style, or a full argument)
Output: A JSON object with keys provedStatement, sublemmas, normalizedProof. Use LaTeX delimiters: inline $...$ and display $$...$$.

Decomposition Guidelines
1. Identify Decomposition Candidates
- Intermediate results used multiple times
- Sub-arguments (>3–4 logical steps)
- Conceptually distinct ideas or techniques
- Standalone facts that simplify the main flow

2. Atomic Statement Principle
Each sublemma must:
- Be self-contained with precise hypotheses/conclusions
- Focus on a single mathematical idea
- Be useful (reused or simplifies reasoning)
- Clearly specify inputs/outputs

Additional constraints (critical)
- You must return at least one sublemma. Never return an empty array.
- If the proof is short or a counterexample, return exactly one sublemma:
  • title: 'Counterexample' (or 'Direct proof' if appropriate)
  • statement: the exact proved claim (same as provedStatement)
  • proof: a clear, step-by-step explanation (include the specific counterexample and why it works)
- Prefer 2–6 sublemmas for longer arguments.

Raw proof:
"""
{{{rawProof}}}
"""

Return strictly:
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
