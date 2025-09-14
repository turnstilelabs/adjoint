import {z} from 'genkit';

/**
 * @fileOverview Shared Zod schemas for AI flows.
 */

export const SublemmaSchema = z.object({
  title: z
    .string()
    .describe(
      'A short, descriptive title for the sublemma (e.g., "Lemma 1: Cauchy-Schwarz Inequality").'
    ),
  content: z.string().describe('The detailed content of the sublemma statement.'),
});

export const ReviseProofInputSchema = z.object({
    problem: z.string().describe('The original mathematical problem.'),
    proofSteps: z.array(SublemmaSchema).describe('The current sequence of sublemmas in the proof.'),
    request: z.string().describe("The user's request for revision or a question about the proof."),
});

export const ReviseProofOutputSchema = z.object({
    revisionType: z.enum(['DIRECT_REVISION', 'SUGGESTED_REVISION', 'NO_REVISION']).describe("The type of revision performed, based on the user's intent."),
    revisedSublemmas: z.array(SublemmaSchema).nullable().describe('The new sequence of sublemmas. Null if no changes were made.'),
    explanation: z.string().describe('An explanation of the changes made or an answer to the user\'s question.'),
});
