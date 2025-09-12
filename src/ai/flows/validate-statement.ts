'use server';
/**
 * @fileOverview Validates if a given string is a valid mathematical statement.
 *
 * - validateStatement - A function that handles the validation of a mathematical statement.
 * - ValidateStatementInput - The input type for the validateStatement function.
 * - ValidateStatementOutput - The return type for the validateStatement function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ValidateStatementInputSchema = z.object({
  statement: z.string().describe('The mathematical statement to validate.'),
});
export type ValidateStatementInput = z.infer<typeof ValidateStatementInputSchema>;

const ValidateStatementOutputSchema = z.object({
  validity: z.enum(['VALID', 'INVALID', 'INCOMPLETE']).describe('The validity of the mathematical statement.'),
  reasoning: z.string().describe('A brief explanation for the given validity classification.'),
});
export type ValidateStatementOutput = z.infer<typeof ValidateStatementOutputSchema>;


export async function validateStatement(input: ValidateStatementInput): Promise<ValidateStatementOutput> {
  return validateStatementFlow(input);
}

const prompt = ai.definePrompt({
  name: 'validateStatementPrompt',
  input: {schema: ValidateStatementInputSchema},
  output: {schema: ValidateStatementOutputSchema},
  prompt: `You are a mathematical expert. Your task is to analyze a given string and determine if it represents a valid mathematical statement.

Classify the statement into one of three categories:
1.  VALID: The statement is a well-formed and complete mathematical assertion.
2.  INVALID: The statement is mathematically incorrect, nonsensical, or contains errors.
3.  INCOMPLETE: The statement is a fragment or is missing context, making it impossible to judge its validity.

Analyze the following statement:
"{{{statement}}}"

Provide your classification and a brief, one-sentence reasoning for your choice. Your output must be in JSON format.`,
});

const validateStatementFlow = ai.defineFlow(
  {
    name: 'validateStatementFlow',
    inputSchema: ValidateStatementInputSchema,
    outputSchema: ValidateStatementOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
