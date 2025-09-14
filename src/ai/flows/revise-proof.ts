'use server';
/**
 * @fileOverview A flow for revising a mathematical proof based on user instructions.
 *
 * - reviseProof - A function that takes a proof and a user request and returns a revised proof or an answer.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { ReviseProofInputSchema, ReviseProofOutputSchema } from './schemas';

export type ReviseProofInput = z.infer<typeof ReviseProofInputSchema>;
export type ReviseProofOutput = z.infer<typeof ReviseProofOutputSchema>;

export async function reviseProof(input: ReviseProofInput): Promise<ReviseProofOutput> {
  return reviseProofFlow(input);
}

const reviseProofPrompt = ai.definePrompt({
  name: 'reviseProofPrompt',
  input: { schema: ReviseProofInputSchema },
  output: { schema: ReviseProofOutputSchema },
  prompt: `You are an expert mathematician and AI assistant. Your task is to analyze a user's request concerning a mathematical proof and take the appropriate action.

The user has provided a mathematical problem, a set of proof steps (sublemmas), and a request.

**Problem:**
"{{{problem}}}"

**Current Proof Steps:**
{{#each proofSteps}}
- **{{this.title}}**: {{this.content}}
{{/each}}

**User's Request:**
"{{{request}}}"

**Your Task:**

1.  **Analyze the User's Intent**: Determine the nature of the user's request. Classify it into one of three categories and set the 'revisionType' field accordingly:
    *   'DIRECT_REVISION': The user gives a clear, direct command to modify the proof structure (e.g., "Merge steps 1 and 2," "Rephrase lemma 3," "Split the first step into two parts").
    *   'SUGGESTED_REVISION': The user asks a question or makes a statement that implies a potential improvement or correction to the proof, but isn't a direct command (e.g., "Is step 2 correct?", "Can we make the proof more rigorous?", "Explain the gap between lemma 1 and 2."). For these, you should provide an explanation and, if applicable, a set of revised sublemmas that would address the user's point.
    *   'NO_REVISION': The user is asking a general question that does not require any changes to the proof steps (e.g., "What is a finite group?", "Can you explain Lagrange's Theorem in simpler terms?").

2.  **Generate a Response**:
    *   **For 'DIRECT_REVISION'**:
        *   Generate the new set of sublemmas and put them in the 'revisedSublemmas' field.
        *   Write a brief 'explanation' confirming the action (e.g., "I have merged the first two steps as you requested.").
    *   **For 'SUGGESTED_REVISION'**:
        *   Provide a detailed 'explanation' that answers the user's question and describes the potential improvement.
        *   If a change is warranted, generate the new set of sublemmas that reflects this improvement and include it in 'revisedSublemmas'. If no change is needed, leave 'revisedSublemmas' as null.
        *   Your explanation should be phrased as a proposal (e.g., "You've pointed out a potential ambiguity in step 2. We could clarify it by rephrasing it like this. Would you like me to apply this change?").
    *   **For 'NO_REVISION'**:
        *   Provide a comprehensive 'explanation' answering the user's question.
        *   Set 'revisedSublemmas' to null.

**Output Format**: Your entire output must be a single JSON object matching the provided schema. Ensure 'revisedSublemmas' is either an array of sublemmas or null.`,
});

const reviseProofFlow = ai.defineFlow(
  {
    name: 'reviseProofFlow',
    inputSchema: ReviseProofInputSchema,
    outputSchema: ReviseProofOutputSchema,
  },
  async (input) => {
    const { output } = await reviseProofPrompt(input);
    return output!;
  }
);
