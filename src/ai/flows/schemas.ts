import { z } from 'genkit';

/**
 * @fileOverview Shared Zod schemas for AI flows.
 */

export const SublemmaSchema = z.object({
  title: z
    .string()
    .describe('A short, descriptive title for the sublemma (e.g., "Lemma 1: Cauchy-Schwarz Inequality").'),
  statement: z.string().describe('The precise mathematical statement of the sublemma (LaTeX or plain text).'),
  proof: z.string().describe('A clear, rigorous proof of the sublemma (LaTeX or plain text).'),
});

export const ReviseProofInputSchema = z.object({
  problem: z.string().describe('The original mathematical problem.'),
  proofSteps: z.array(SublemmaSchema).describe('The current sequence of sublemmas in the proof.'),
  request: z.string().describe("The user's request for revision or a question about the proof."),
});

export const ReviseProofOutputSchema = z.object({
  revisionType: z.enum(['DIRECT_REVISION', 'SUGGESTED_REVISION', 'NO_REVISION', 'OFF_TOPIC']).describe("The type of revision performed, based on the user's intent. Use 'OFF_TOPIC' when the user's request is outside the scope of the current problem/proof."),
  revisedSublemmas: z.array(SublemmaSchema).nullable().describe('The new sequence of sublemmas. Null if no changes were made or when OFF_TOPIC.'),
  explanation: z.string().describe('An explanation of the changes made, an answer to the user\'s question, or a concise decline message when OFF_TOPIC.'),
});
