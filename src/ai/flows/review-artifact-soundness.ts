'use server';

import { ai, llmId } from '@/ai/genkit';
import {
  ReviewArtifactInputSchema,
  ReviewArtifactOutputSchema,
  type ReviewArtifactInput,
  type ReviewArtifactOutput,
} from '@/ai/flows/review-artifact-soundness.schemas';
import { env } from '@/env';
import { normalizeModelError } from '@/lib/model-error-core';

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
    const provider = llmId.split('/')?.[0] || 'unknown';
    const candidates: string[] = [];
    if (provider === 'googleai') {
      candidates.push(llmId);
      const proId = 'googleai/gemini-2.5-pro';
      if (llmId !== proId) candidates.push(proId);
      if (env.OPENAI_API_KEY) candidates.push('openai/gpt-4o-mini');
    } else {
      candidates.push(llmId);
    }

    const system =
      'You are a precise JSON API. Return ONLY a single JSON object matching the schema. No markdown, no extra keys.';

    const hasProof = Boolean((input.proof ?? '').trim());
    const ctx = (input.paperContextBefore ?? '').trim();
    const user = `You are a meticulous mathematics referee reviewing a single artifact extracted from a LaTeX article.

Artifact type: ${input.type}
Environment: ${input.envName}
Title: ${input.title ?? ''}
Label: ${input.label ?? ''}

Context (paper content before this artifact):
"""
${ctx || '[no context provided]'}
"""

Statement (as LaTeX/prose):
"""
${input.content}
"""

${hasProof ? `Proof (as LaTeX/prose):\n"""\n${input.proof}\n"""\n` : 'No proof is provided.'}

Task:
Return a structured review with two categories:
- correctness: mathematical correctness / logical validity AND checkability (missing assumptions/steps that prevent verification).
- clarity: exposition quality (definitions, notation, readability).

Also provide:
- suggestedImprovement: concrete, minimal suggestions to improve correctness/clarity (no full rewrite).

Also provide:
- summary: 1–3 sentences.
- verdict: overall verdict (reflecting the worst category).

Output requirements:
- Use the provided JSON schema exactly.
- Do not propose edits.
- For category feedback fields (correctness/clarity), write the direct assessment. Do NOT prefix with "OK:"/"ISSUE:" or repeat the verdict.
`;

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
