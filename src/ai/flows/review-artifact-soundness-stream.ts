import { ai, llmId } from '@/ai/genkit';
import { z } from 'genkit';
import { env } from '@/env';
import { normalizeModelError } from '@/lib/model-error-core';
import {
  ReviewArtifactInputSchema,
  ReviewArtifactOutputSchema,
  type ReviewArtifactInput,
  type ReviewArtifactOutput,
} from '@/ai/flows/review-artifact-soundness.schemas';
import { buildReviewArtifactSoundnessMessages } from '@/ai/flows/review-artifact-soundness.prompt';

/**
 * Streamed chunk variants emitted during artifact review.
 *
 * For v0 we only stream model token deltas, plus a final done payload.
 */
export const ReviewArtifactStreamChunkSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('model.start'),
    provider: z.string(),
    model: z.string(),
    ts: z.number(),
  }),
  z.object({
    type: z.literal('model.delta'),
    text: z.string(),
  }),
  z.object({
    type: z.literal('model.end'),
    durationMs: z.number(),
    length: z.number(),
  }),
  z.object({
    type: z.literal('server-error'),
    error: z.string(),
    detail: z.string().optional(),
    code: z.string().optional(),
  }),
]);
export type ReviewArtifactStreamChunk = z.infer<typeof ReviewArtifactStreamChunkSchema>;

export type ReviewArtifactStreamOutput = ReviewArtifactOutput;

type OrchestratorOptions = {
  shouldAbort?: () => boolean;
};

export async function reviewArtifactSoundnessStreamOrchestrator(
  input: ReviewArtifactInput,
  onChunk: (chunk: ReviewArtifactStreamChunk) => void,
  options?: OrchestratorOptions,
): Promise<ReviewArtifactStreamOutput> {
  const shouldAbort = options?.shouldAbort ?? (() => false);

  const provider = llmId.split('/')?.[0] || 'unknown';

  // Build candidate model chain: current -> same provider pro -> OpenAI (if configured)
  const candidates: string[] = [];
  if (provider === 'googleai') {
    candidates.push(llmId);
    const proId = 'googleai/gemini-2.5-pro';
    if (llmId !== proId) candidates.push(proId);
    if (env.OPENAI_API_KEY) candidates.push('openai/gpt-4o-mini');
  } else {
    candidates.push(llmId);
  }

  const { system, prompt: user } = buildReviewArtifactSoundnessMessages(input);

  let fullText = '';
  let lastErr: ReturnType<typeof normalizeModelError> | null = null;

  for (let i = 0; i < candidates.length; i++) {
    const cand = candidates[i];
    const [prov, mod] = (cand || '').split('/');
    onChunk({
      type: 'model.start',
      provider: prov || 'unknown',
      model: mod || cand,
      ts: Date.now(),
    });
    const tStart = Date.now();

    try {
      if (env.DEBUG_LLM_PROMPTS) {
        // WARNING: logs full user content. Use only for local debugging.
        console.info(
          `[SA][reviewArtifactSoundnessStream] model=${cand} system=<<<${system}>>> prompt=<<<${user}>>>`,
        );
      }
      const { stream, response } = ai.generateStream({
        model: cand,
        system,
        prompt: user,
      });

      let local = '';
      for await (const chunk of stream as any) {
        if (shouldAbort()) break;
        const t = chunk && typeof chunk.text === 'string' ? chunk.text : '';
        if (t) {
          local += t;
          onChunk({ type: 'model.delta', text: t });
        }
      }

      const finalResp: any = await response;
      if (!local && finalResp?.text) local = finalResp.text;
      fullText = local;

      onChunk({
        type: 'model.end',
        durationMs: Date.now() - tStart,
        length: fullText.length,
      });

      // Parse JSON response (Genkit parsing via schema is not used in stream mode).
      const tryParse = (): any => {
        try {
          return JSON.parse(fullText);
        } catch {
          // attempt to extract JSON object substring
          const start = fullText.indexOf('{');
          const end = fullText.lastIndexOf('}');
          if (start >= 0 && end > start) {
            return JSON.parse(fullText.slice(start, end + 1));
          }
          throw new Error('Model output was not valid JSON.');
        }
      };

      try {
        const parsed = tryParse();
        const out = ReviewArtifactOutputSchema.safeParse(parsed);
        if (!out.success) {
          throw new Error('Model output was not valid JSON.');
        }
        return out.data as ReviewArtifactOutput;
      } catch (e: any) {
        // Retryable: model output unparsable. Try next candidate if any.
        lastErr = normalizeModelError(e);
        continue;
      }
    } catch (e: any) {
      const norm = normalizeModelError(e);
      lastErr = norm;
      // Capacity/rate limit: try next candidate if available
      if (norm.code === 'MODEL_RATE_LIMIT') {
        continue;
      }
      // Other errors: still try next candidate if available.
      continue;
    }
  }

  // Exhausted candidates: return an UNCLEAR result instead of throwing.
  // This prevents SSE route failures (500/pipe errors) and lets the UI show something useful.
  const msg = lastErr?.message || 'The AI failed to return a valid artifact review result.';
  return {
    verdict: 'UNCLEAR',
    summary: msg,
    correctness: { verdict: 'UNCLEAR', feedback: msg },
    clarity: { verdict: 'UNCLEAR', feedback: '' },
  };
}

export const reviewArtifactSoundnessStreamFlow = ai.defineFlow(
  {
    name: 'reviewArtifactSoundnessStreamFlow',
    inputSchema: ReviewArtifactInputSchema,
    outputSchema: ReviewArtifactOutputSchema,
    streamSchema: ReviewArtifactStreamChunkSchema,
  },
  async (input, { sendChunk }) => {
    const out = await reviewArtifactSoundnessStreamOrchestrator(input, (c) => sendChunk(c));
    return out;
  },
);
