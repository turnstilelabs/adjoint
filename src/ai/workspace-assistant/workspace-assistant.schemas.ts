import { z } from 'genkit';

export const WorkspaceAssistantInputSchema = z.object({
    request: z.string().describe("The user's current message for this thread."),
    selectionText: z
        .string()
        .optional()
        .describe('The exact selected text the thread is anchored to.'),
    contextText: z
        .string()
        .optional()
        .describe('A bounded window of the surrounding document for additional context.'),
    history: z
        .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() }))
        .optional()
        .describe('Recent thread history.'),
});

export type WorkspaceAssistantInput = z.infer<typeof WorkspaceAssistantInputSchema>;

export const WorkspaceAssistantEventSchema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('text'), content: z.string() }),
    z.object({ type: z.literal('error'), message: z.string() }),
]);

export type WorkspaceAssistantEvent = z.infer<typeof WorkspaceAssistantEventSchema>;
