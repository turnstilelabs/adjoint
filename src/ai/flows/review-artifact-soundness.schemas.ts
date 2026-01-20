import { z } from 'genkit';

export const ReviewArtifactInputSchema = z.object({
  type: z.enum(['theorem', 'lemma', 'proposition', 'corollary', 'claim']),
  envName: z.string().describe('Raw LaTeX environment name (begin{...}).'),
  title: z.string().nullable().optional(),
  label: z.string().nullable().optional(),
  paperContextBefore: z
    .string()
    .optional()
    .describe(
      'Raw LaTeX/prose context from the start of the paper up to (but not including) this artifact.',
    ),
  content: z.string().describe('Statement / environment body.'),
  proof: z.string().nullable().optional().describe('Proof body if available.'),
});
export type ReviewArtifactInput = z.infer<typeof ReviewArtifactInputSchema>;

const ReviewCategorySchema = z.object({
  // Kept for future triage; UI can ignore.
  verdict: z.enum(['OK', 'ISSUE', 'UNCLEAR']),
  feedback: z
    .string()
    .describe('Direct answer for this category (no leading labels like "OK:" or verdict tokens).'),
});

export const ReviewArtifactOutputSchema = z.object({
  /** Overall verdict (should reflect the worst of the category verdicts). */
  verdict: z.enum(['OK', 'ISSUE', 'UNCLEAR']),

  /** 1–3 sentence high-level summary. */
  summary: z.string(),

  /** Mathematical correctness / logical validity + checkability (missing assumptions/steps). */
  correctness: ReviewCategorySchema,

  /** Exposition quality: definitions, notation, readability. */
  clarity: ReviewCategorySchema,

  /** Optional actionable suggestions to improve the artifact/proof (no full rewrite). */
  suggestedImprovement: z
    .string()
    .optional()
    .describe('Concrete, minimal suggestions to improve correctness/clarity.'),
});
export type ReviewArtifactOutput = z.infer<typeof ReviewArtifactOutputSchema>;
