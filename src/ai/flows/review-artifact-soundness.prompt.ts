import type { ReviewArtifactInput } from '@/ai/flows/review-artifact-soundness.schemas';

/**
 * Shared prompt construction for "Review with AI".
 *
 * Keep this as the single source of truth so streaming/non-streaming flows
 * cannot drift.
 */
export function buildReviewArtifactSoundnessMessages(input: ReviewArtifactInput): {
  system: string;
  prompt: string;
} {
  const hasProof = Boolean((input.proof ?? '').trim());
  const ctx = (input.paperContextBefore ?? '').trim();

  const system = `You are a professional research mathematician acting as a careful referee for a math paper. You have broad research-level background knowledge across mathematics (and adjacent fields), but you are not guaranteed to be a specialist in the paper’s narrow subfield.

You will be shown paper context (what you have read so far) and then one extracted artifact (statement + optionally proof). Use standard mathematical knowledge freely, but treat paper-specific notation/definitions/assumptions as coming from the provided context; if something is paper-specific and not defined in the context, flag it.

Avoid speculation: do not guess the authors’ intent or invent missing assumptions/lemmas/definitions. If something might be fixable with additional assumptions, say what would be needed, but still mark it as missing/unclear.

CRITICAL OUTPUT RULES:
- Return ONLY a single JSON object that matches the provided schema exactly.
- No markdown, no surrounding text, no code fences.
- No extra keys.`;

  const prompt = `Artifact type: ${input.type}
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
- correctness: mathematical correctness / logical validity AND checkability.
- clarity: exposition quality.

Also provide:
- suggestedImprovement: concrete, minimal suggestions to improve correctness/clarity (no full rewrite).
- summary: 1–3 sentences.
- verdict: overall verdict (reflecting the worst category).

Constraints:
- If the statement/proof relies on paper-specific definitions/notation/assumptions not present in the context, explicitly say so.
- Avoid speculation: do not invent missing assumptions/lemmas.
- For category feedback fields (correctness/clarity), write the direct assessment; do NOT prefix with "OK:"/"ISSUE:" or repeat verdict tokens.
`;

  return { system, prompt };
}
