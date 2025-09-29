// Interactive Questioning Flow
'use server';

/**
 * @fileOverview A flow for handling interactive questioning with an LLM based on a given mathematical problem and its proof.
 *
 * - interactiveQuestioning - A function that accepts a question and the proof steps, then returns an answer from the LLM.
 * - InteractiveQuestioningInput - The input type for the interactiveQuestioning function.
 * - InteractiveQuestioningOutput - The return type for the interactiveQuestioning function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const InteractiveQuestioningInputSchema = z.object({
  question: z.string().describe('The question asked by the user.'),
  proofSteps: z.array(z.string()).describe('The steps of the mathematical proof.'),
});
export type InteractiveQuestioningInput = z.infer<typeof InteractiveQuestioningInputSchema>;

const InteractiveQuestioningOutputSchema = z.object({
  answer: z.string().describe('The answer from the LLM based on the question and proof.'),
});
export type InteractiveQuestioningOutput = z.infer<typeof InteractiveQuestioningOutputSchema>;

export async function interactiveQuestioning(input: InteractiveQuestioningInput): Promise<InteractiveQuestioningOutput> {
  return interactiveQuestioningFlow(input);
}

const prompt = ai.definePrompt({
  name: 'interactiveQuestioningPrompt',
  input: {schema: InteractiveQuestioningInputSchema},
  output: {schema: InteractiveQuestioningOutputSchema},
  prompt: `You are a helpful AI assistant that answers questions about mathematical proofs.

  You are given a question and a set of proof steps. Use the proof steps and your mathematical knowledge to answer the question as accurately as possible.

  Question: {{{question}}}

  Proof Steps:
  {{#each proofSteps}}
  - {{{this}}}
  {{/each}}
  `,
});

const interactiveQuestioningFlow = ai.defineFlow(
  {
    name: 'interactiveQuestioningFlow',
    inputSchema: InteractiveQuestioningInputSchema,
    outputSchema: InteractiveQuestioningOutputSchema,
    cache: {
      ttl: 3600, // Cache for 1 hour
    },
  },
  async input => {
    const {output} = await prompt(input);
    return {
      answer: output!.answer,
    };
  }
);
