'use server';

import { ai, getLlmId, getLlmProvider, requireLlmApiKey } from '@/ai/genkit';
import {
  ReviewArtifactInputSchema,
  ReviewArtifactOutputSchema,
  type ReviewArtifactInput,
  type ReviewArtifactOutput,
} from '@/ai/flows/review-artifact-soundness.schemas';
import { buildReviewArtifactSoundnessMessages } from '@/ai/flows/review-artifact-soundness.prompt';
import { env } from '@/env';
import { normalizeModelError } from '@/lib/model-error-core';
import { buildLlmCandidates } from '@/ai/llm-candidates';

export async function reviewArtifactSoundness(
  input: ReviewArtifactInput,
): Promise<ReviewArtifactOutput> {
  return reviewArtifactSoundnessFlow(input);
}

const reviewArtifactSoundnessFlow = ai.defineFlow(
  {
    name: 'reviewArtifactSoundnessFlow',
    inputSchema: ReviewArtifactInputSchema,
    outputSchema: ReviewArtifactOutputSchema,
  },
  async (input: ReviewArtifactInput) => {
    const llmId = getLlmId();
    const provider = getLlmProvider();
    const candidates = buildLlmCandidates(provider, llmId);
    const apiKey = requireLlmApiKey();

    const { system, prompt: user } = buildReviewArtifactSoundnessMessages(input);

    let lastErr: any = null;
    for (const cand of candidates) {
      try {
        if (env.DEBUG_LLM_PROMPTS) {
          // WARNING: logs full user content. Use only for local debugging.
          console.info(
            `[SA][reviewArtifactSoundness] model=${cand} system=<<<${system}>>> prompt=<<<${user}>>>`,
          );
        }
        const { output } = await ai.generate({
          model: cand,
          system,
          prompt: user,
          config: { apiKey },
          output: { schema: ReviewArtifactOutputSchema },
        });
        if (!output?.verdict || !output?.summary || !output?.correctness || !output?.clarity) {
          throw new Error('The AI failed to return a valid artifact review result.');
        }
        return output;
      } catch (e: any) {
        const norm = normalizeModelError(e);
        lastErr = norm;
        // Retry on transient/provider issues and on structured-output parsing failures.
        if (
          norm.code === 'MODEL_RATE_LIMIT' ||
          norm.code === 'MODEL_TIMEOUT' ||
          norm.code === 'MODEL_STREAM_INTERRUPTED' ||
          norm.code === 'MODEL_OUTPUT_UNPARSABLE'
        ) {
          continue;
        }
        throw new Error(norm.message);
      }
    }
    throw new Error(
      (lastErr && lastErr.message) || 'The AI failed to return a valid artifact review result.',
    );
  },
);
