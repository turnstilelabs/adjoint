'use server';
/**
 * @fileOverview Validates if a tentative proof is a correct proof of a given mathematical problem.
 *
 * - validateProof - A function that handles the validation of a proof.
 * - ValidateProofInput - The input type for the validateProof function.
 * - ValidateProofOutput - The return type for the validateProof function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { SublemmaSchema } from './schemas';

const ValidateProofInputSchema = z.object({
  problem: z.string().describe('The original mathematical problem.'),
  proofSteps: z
    .array(SublemmaSchema)
    .describe('The sequence of sublemmas that constitute the proof.'),
});
export type ValidateProofInput = z.infer<typeof ValidateProofInputSchema>;

const ValidateProofOutputSchema = z.object({
  isValid: z.boolean().describe('Whether the proof is logically sound and complete.'),
  feedback: z.string().describe('Detailed feedback on the proof, explaining any errors or gaps.'),
});
export type ValidateProofOutput = z.infer<typeof ValidateProofOutputSchema>;

export async function validateProof(input: ValidateProofInput): Promise<ValidateProofOutput> {
  return validateProofFlow(input);
}

const prompt = ai.definePrompt({
  name: 'validateProofPrompt',
  input: { schema: ValidateProofInputSchema },
  output: { schema: ValidateProofOutputSchema },
  prompt: `You are a meticulous mathematics professor reviewing a student's proof. Your task is to determine if the provided sequence of sublemmas constitutes a valid proof for the original problem.

Original Problem:
"{{{problem}}}"

Tentative Proof Steps:
{{#each proofSteps}}
- **{{this.title}}**: {{this.content}}
{{/each}}

Analyze the entire proof structure. Check for:
1.  **Logical Soundness**: Does each step logically follow from the previous ones and the initial assumptions?
2.  **Completeness**: Do the steps, taken together, fully prove the original problem statement?
3.  **Correctness**: Are there any mathematical errors in the sublemmas or the reasoning?

Provide a final verdict ('isValid') and constructive 'feedback' explaining your reasoning. If the proof is invalid, clearly identify the flawed step and explain why it is incorrect. Your output must be in JSON format.`,
});

const validateProofFlow = ai.defineFlow(
  {
    name: 'validateProofFlow',
    inputSchema: ValidateProofInputSchema,
    outputSchema: ValidateProofOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    if (!output) {
      throw new Error('The AI failed to provide a validation result.');
    }
    return output;
  },
);
