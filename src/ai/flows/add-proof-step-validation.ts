// src/ai/flows/add-proof-step-validation.ts
'use server';
/**
 * @fileOverview Allows users to manually add intermediate steps to the proof and receive feedback from the LLM on their correctness.
 *
 * - addProofStepWithLLMValidation - A function that handles the validation of a user-provided proof step.
 * - AddProofStepInput - The input type for the addProofStepWithLLMValidation function.
 * - AddProofStepOutput - The return type for the addProofStepWithLLMValidation function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const AddProofStepInputSchema = z.object({
  problem: z.string().describe('The original mathematical problem.'),
  currentSteps: z.string().describe('The current steps in the proof.'),
  proposedStep: z.string().describe('The new proof step proposed by the user.'),
});
export type AddProofStepInput = z.infer<typeof AddProofStepInputSchema>;

const AddProofStepOutputSchema = z.object({
  isValid: z.boolean().describe('Whether the proposed step is a valid step in the proof.'),
  feedback: z.string().describe('Feedback from the LLM on the validity of the step.'),
});
export type AddProofStepOutput = z.infer<typeof AddProofStepOutputSchema>;

export async function addProofStepWithLLMValidation(input: AddProofStepInput): Promise<AddProofStepOutput> {
  return addProofStepValidationFlow(input);
}

const prompt = ai.definePrompt({
  name: 'addProofStepValidationPrompt',
  input: {schema: AddProofStepInputSchema},
  output: {schema: AddProofStepOutputSchema},
  prompt: `You are an expert mathematician reviewing a proposed step in a mathematical proof.

Original Problem: {{{problem}}}

Current Steps: {{{currentSteps}}}

Proposed Step: {{{proposedStep}}}

Determine if the proposed step is a valid logical consequence of the current steps, and if it brings us closer to a final proof of the original problem.

Respond with a boolean value indicating whether the step is valid, and provide detailed feedback explaining your reasoning.

Ensure that your feedback is clear, concise, and helpful to a mathematician trying to solve the problem.

Your output must be in JSON format.
`, 
});

const addProofStepValidationFlow = ai.defineFlow(
  {
    name: 'addProofStepValidationFlow',
    inputSchema: AddProofStepInputSchema,
    outputSchema: AddProofStepOutputSchema,
    cache: {
      ttl: 3600, // Cache for 1 hour
    },
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
