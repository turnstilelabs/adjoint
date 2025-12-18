import { z } from 'genkit';

export const ExploreArtifactsSchema = z.object({
    candidateStatements: z
        .array(z.string())
        .describe('Candidate statements discussed in the exploration session.'),
    assumptions: z.array(z.string()).describe('Assumptions / definitions extracted from discussion.'),
    examples: z.array(z.string()).describe('Examples supporting understanding.'),
    counterexamples: z.array(z.string()).describe('Counterexamples / failure modes raised.'),
    openQuestions: z.array(z.string()).describe('Open questions to investigate next.'),
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
