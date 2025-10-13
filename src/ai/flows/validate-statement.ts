'use server';
/**
 * @fileOverview Validates if a given string is a valid mathematical statement.
 *
 * - validateStatement - A function that handles the validation of a mathematical statement.
 * - ValidateStatementInput - The input type for the validateStatement function.
 * - ValidateStatementOutput - The return type for the validateStatement function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const ValidateStatementInputSchema = z.object({
  statement: z.string().describe('The mathematical statement to validate.'),
});
export type ValidateStatementInput = z.infer<typeof ValidateStatementInputSchema>;

const ValidateStatementOutputSchema = z.object({
  validity: z
    .enum(['VALID', 'INVALID', 'INCOMPLETE'])
    .describe('The validity of the mathematical statement.'),
  reasoning: z.string().describe('A brief explanation for the given validity classification.'),
});
export type ValidateStatementOutput = z.infer<typeof ValidateStatementOutputSchema>;

export async function validateStatement(
  input: ValidateStatementInput,
): Promise<ValidateStatementOutput> {
  return validateStatementFlow(input);
}

const prompt = ai.definePrompt({
  name: 'validateStatementPrompt',
  input: { schema: ValidateStatementInputSchema },
  output: { schema: ValidateStatementOutputSchema },
  prompt: `You are a mathematical expert. Your task is to analyze a given string and determine if it represents a valid mathematical statement that can be proven.

Analyze the following statement:
"{{{statement}}}"

Classify the statement into one of three categories and provide a brief, one-sentence reasoning for your choice.

1.  **VALID**: The statement is a well-formed and complete mathematical assertion that is suitable for a proof attempt.
    *   *Reasoning example*: "This is a standard theorem in group theory."
2.  **INVALID**: The statement is not a mathematical problem to be solved. This includes questions, requests for definitions, or nonsensical text.
    *   *Reasoning example*: "This appears to be a request for a definition, not a problem to be solved." or "This seems to be a general question, not a mathematical statement."
3.  **INCOMPLETE**: The statement is a fragment or is missing context, making it impossible to judge its validity.
    *   *Reasoning example*: "The statement is missing a conclusion."

Your output must be in JSON format.`,
});

const validateStatementFlow = ai.defineFlow(
  {
    name: 'validateStatementFlow',
    inputSchema: ValidateStatementInputSchema,
    outputSchema: ValidateStatementOutputSchema,
  },
  async (input: ValidateStatementInput) => {
    const { output } = await prompt(input);
    if (!output?.validity || !output?.reasoning) {
      throw new Error(
        'The AI failed to return a valid validity assessment. The response was malformed.',
      );
    }
    return output;
  },
);
