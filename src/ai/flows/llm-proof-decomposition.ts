'use server';
/**
 * @fileOverview Decomposes a mathematical problem into a sequence of sublemmas using an LLM.
 *
 * - decomposeProof - A function that handles the proof decomposition process.
 * - DecomposeProofInput - The input type for the decomposeProof function.
 * - DecomposeProofOutput - The return type for the decomposeProof function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const DecomposeProofInputSchema = z.object({
  problem: z.string().describe('The mathematical problem to decompose into sublemmas, in LaTeX or natural language.'),
});
export type DecomposeProofInput = z.infer<typeof DecomposeProofInputSchema>;

const DecomposeProofOutputSchema = z.object({
  sublemmas: z.array(z.string()).describe('A sequence of sublemmas that form a proof of the given problem.'),
});
export type DecomposeProofOutput = z.infer<typeof DecomposeProofOutputSchema>;

export async function decomposeProof(input: DecomposeProofInput): Promise<DecomposeProofOutput> {
  return decomposeProofFlow(input);
}

const decomposeProofPrompt = ai.definePrompt({
  name: 'decomposeProofPrompt',
  input: {schema: DecomposeProofInputSchema},
  output: {schema: DecomposeProofOutputSchema},
  prompt: `You are an expert mathematician. Your task is to decompose the following mathematical problem into a sequence of sublemmas that lead to a solution.

Problem: {{{problem}}}

Sublemmas:`,
});

const decomposeProofFlow = ai.defineFlow(
  {
    name: 'decomposeProofFlow',
    inputSchema: DecomposeProofInputSchema,
    outputSchema: DecomposeProofOutputSchema,
  },
  async input => {
    const {output} = await decomposeProofPrompt(input);
    return output!;
  }
);
