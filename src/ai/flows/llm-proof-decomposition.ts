'use server';
/**
 * @fileOverview Decomposes a mathematical problem into a sequence of sublemmas using an LLM.
 *
 * - decomposeProof - A function that handles the proof decomposition process.
 * - DecomposeProofInput - The input type for the decomposeProof function.
 * - DecomposeProofOutput - The return type for the decomposeProof function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { SublemmaSchema } from './schemas';
import { env } from '@/env';
import { decomposeProblemFixture } from '@/app/actions.mocks';

const DecomposeProofInputSchema = z.object({
  problem: z
    .string()
    .describe(
      'The mathematical problem to decompose into sublemmas, in LaTeX or natural language.',
    ),
});
export type DecomposeProofInput = z.infer<typeof DecomposeProofInputSchema>;

const DecomposeProofOutputSchema = z.object({
  sublemmas: z
    .array(SublemmaSchema)
    .describe('A sequence of sublemmas that form a proof of the given problem.'),
});
export type DecomposeProofOutput = z.infer<typeof DecomposeProofOutputSchema>;
export type Sublemma = z.infer<typeof SublemmaSchema>;

export async function decomposeProof(input: DecomposeProofInput): Promise<DecomposeProofOutput> {
  if (env.USE_MOCK_API) {
    return decomposeProblemFixture;
  }

  return decomposeProofFlow(input);
}

const decomposeProofPrompt = ai.definePrompt({
  name: 'decomposeProofPrompt',
  input: { schema: DecomposeProofInputSchema },
  output: { schema: DecomposeProofOutputSchema },
  prompt: `You are a mathematical writing expert specializing in proof structure and clarity. Your task is to analyze a given mathematical problem and decompose it into well-structured lemmas and propositions to maximize readability and logical flow.

Instructions
Input: A mathematical problem (theorem, proposition, or extended argument)
Output: A restructured version with appropriate decomposition. Your output must be a JSON object with a 'sublemmas' key containing an array of objects, where each object has a 'title' and 'content'.

Decomposition Guidelines
1. Identify Decomposition Candidates
Look for proof segments that:
- Establish intermediate results used multiple times.
- Contain substantial sub-arguments (>3-4 logical steps).
- Represent conceptually distinct ideas or techniques.
- Can be stated as standalone mathematical facts.
- Simplify the main proof's logical flow when extracted.

2. Atomic Statement Principle
Each lemma/proposition should:
- Be self-contained: Provable using only stated assumptions and previously established results.
- Have a single focus: Address one mathematical concept or relationship.
- Be genuinely useful: Either used multiple times or significantly simplifies the main argument.
- Have clear interfaces: Inputs (hypotheses) and outputs (conclusions) should be precisely stated.

Problem to Decompose:
"{{{problem}}}"

Decompose the problem into a sequence of sublemmas, each with a title and content.`,
});

const decomposeProofFlow = ai.defineFlow(
  {
    name: 'decomposeProofFlow',
    inputSchema: DecomposeProofInputSchema,
    outputSchema: DecomposeProofOutputSchema,
  },
  async (input) => {
    const { output } = await decomposeProofPrompt(input);
    if (!output || !output.sublemmas) {
      throw new Error('The AI failed to decompose the problem into steps.');
    }
    return output;
  },
);
