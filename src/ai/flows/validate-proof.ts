'use server';

/** @fileOverview Validates a structured proof (sequence of sublemmas) against the goal. */

import { ai, getLlmId, getLlmProvider, requireLlmApiKey } from '@/ai/genkit';
import { z } from 'genkit';
import { SublemmaSchema } from './schemas';
import { normalizeModelError } from '@/lib/model-error-core';
import { buildLlmCandidates } from '@/ai/llm-candidates';

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

const validateProofFlow = ai.defineFlow(
  {
    name: 'validateProofFlow',
    inputSchema: ValidateProofInputSchema,
    outputSchema: ValidateProofOutputSchema,
  },
  async (input: ValidateProofInput) => {
    const llmId = getLlmId();
    const provider = getLlmProvider();
    const candidates = buildLlmCandidates(provider, llmId);
    const apiKey = requireLlmApiKey();

    const user = `You are a meticulous mathematics professor reviewing a student's proof.

Your job is to determine whether the provided sequence of sublemmas constitutes a valid proof for the original problem.

Original Problem:
"${input.problem}"

Tentative Proof Steps:
${input.proofSteps.map((s) => `- **${s.title}**\n  - Statement: ${s.statement}\n  - Proof: ${s.proof}`).join('\n')}

CRITICAL RESPONSE STYLE REQUIREMENTS
- If the proof is VALID: set isValid=true and set feedback to a *very brief* confirmation (1–2 sentences). Do NOT provide suggestions, improvements, stylistic notes, or extra commentary.
- If the proof is INVALID: set isValid=false and set feedback to ONLY the issues/gaps/errors, referencing the relevant step(s).
- Do NOT include headings like "Strengths" / "What is good" / "Summary".
- Do NOT add anything beyond what is needed to justify the verdict.

Return ONLY a single JSON object matching the required schema.`;

    let lastErr: any = null;
    for (const cand of candidates) {
      try {
        const { output } = await ai.generate({
          model: cand,
          prompt: user,
          config: { apiKey },
          output: { schema: ValidateProofOutputSchema },
        });
        if (!output) {
          throw new Error('The AI failed to provide a validation result.');
        }
        return output;
      } catch (e: any) {
        const norm = normalizeModelError(e);
        lastErr = norm;
        if (norm.code === 'MODEL_RATE_LIMIT') continue;
        throw new Error(norm.message);
      }
    }
    throw new Error((lastErr && lastErr.message) || 'The AI failed to provide a validation result.');
  },
);
