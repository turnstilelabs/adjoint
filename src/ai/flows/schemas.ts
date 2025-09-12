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
