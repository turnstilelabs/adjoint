import { z } from 'genkit';

const PerStatementArtifactsSchema = z.object({
    assumptions: z
        .array(z.string())
        .default([])
        .describe('Assumptions / definitions for this statement.'),
    examples: z
        .array(z.string())
        .default([])
        .describe('Examples supporting understanding for this statement.'),
    counterexamples: z
        .array(z.string())
        .default([])
        .describe('Counterexamples / failure modes for this statement.'),
});

export const ExploreArtifactsSchema = z.object({
    candidateStatements: z
        .array(z.string())
        .describe('Candidate statements discussed in the exploration session.'),

    /**
     * Per-statement scoped artifacts.
     * Keyed by the exact candidate statement string.
     */
    statementArtifacts: z
        .record(z.string(), PerStatementArtifactsSchema)
        .describe('Artifacts scoped to each candidate statement.'),
});

export type ExploreArtifacts = z.infer<typeof ExploreArtifactsSchema>;

export const ExplorationAssistantInputSchema = z.object({
    seed: z
        .string()
        .optional()
        .describe('Optional initial topic / draft statement the user wants to explore.'),
    request: z.string().describe("The user's current message / question."),
    history: z
        .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() }))
        .optional()
        .describe('Recent conversation history (user/assistant).'),
    artifacts: ExploreArtifactsSchema.optional().describe('Current extracted artifacts (if any).'),
    /**
     * When true, the model should skip any natural-language response and ONLY return extracted artifacts.
     * Used for manual re-extraction and server-side fallback if the tool call is missed.
     */
    extractOnly: z.boolean().optional().describe('If true, only extract artifacts (no text response).'),
    turnId: z
        .number()
        .describe('Client-generated monotonic turn id. Used to prevent stale artifact application.'),
});

export type ExplorationAssistantInput = z.infer<typeof ExplorationAssistantInputSchema>;

export const ExplorationAssistantEventSchema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('text'), content: z.string() }),
    z.object({
        type: z.literal('artifacts'),
        turnId: z.number(),
        artifacts: ExploreArtifactsSchema,
    }),
    z.object({ type: z.literal('error'), message: z.string() }),
]);

export type ExplorationAssistantEvent = z.infer<typeof ExplorationAssistantEventSchema>;

