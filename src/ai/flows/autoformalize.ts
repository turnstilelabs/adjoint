'use server';
/**
 * @fileOverview A flow for autoformalizing a natural language mathematical statement into Lean 4 and attempting to prove it.
 *
 * - autoformalizeAndProve - A function that takes a lemma and returns its Lean 4 formalization and a proof attempt.
 * - AutoformalizeInput - The input type for the autoformalizeAndProve function.
 * - AutoformalizeOutput - The return type for the autoformalizeAndProve function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const AutoformalizeInputSchema = z.object({
  lemma: z.string().describe('The mathematical lemma statement in natural language or LaTeX.'),
});
export type AutoformalizeInput = z.infer<typeof AutoformalizeInputSchema>;

const AutoformalizeOutputSchema = z.object({
  formalization: z.string().describe('The formalization of the lemma in Lean 4 code.'),
  proof: z.string().describe('The attempted proof of the formalized lemma in Lean 4.'),
});
export type AutoformalizeOutput = z.infer<typeof AutoformalizeOutputSchema>;

export async function autoformalizeAndProve(
  input: AutoformalizeInput
): Promise<AutoformalizeOutput> {
  return autoformalizeFlow(input);
}

const autoformalizePrompt = ai.definePrompt({
  name: 'autoformalizePrompt',
  input: { schema: AutoformalizeInputSchema },
  output: { schema: AutoformalizeOutputSchema },
  prompt: `You are an expert in formal mathematics and the Lean 4 theorem prover.
Your task is to perform two actions:
1.  Autoformalize the given mathematical lemma into a valid Lean 4 statement.
2.  Provide a detailed proof for the formalized statement in Lean 4.

The user has provided the following lemma:
"{{{lemma}}}"

First, generate the Lean 4 ` + '`lemma`' + ` or ` + '`theorem`' + ` definition.
Then, provide the full proof within a ` + '`begin ... end`' + ` block.

Your output must be a valid JSON object containing the formalization and the proof.`,
});

const autoformalizeFlow = ai.defineFlow(
  {
    name: 'autoformalizeFlow',
    inputSchema: AutoformalizeInputSchema,
    outputSchema: AutoformalizeOutputSchema,
  },
  async (input) => {
    const { output } = await autoformalizePrompt(input);
    return output!;
  }
);
