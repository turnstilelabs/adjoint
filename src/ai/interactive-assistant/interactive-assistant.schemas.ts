import { z } from 'genkit';
import { SublemmaSchema } from '@/ai/flows/schemas';

export const InteractiveAssistantInputSchema = z.object({
  problem: z.string().describe('The original mathematical problem.'),
  proofSteps: z.array(SublemmaSchema).describe('The current sequence of sublemmas in the proof.'),
  request: z.string().describe("The user's request for revision or a question about the proof."),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() }))
    .describe('The history of messages between you (the assistant) and the user')
    .optional(),
});

export const InteractiveAssistantEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), content: z.string() }),
  z.object({
    type: z.literal('proposal'),
    revisedSublemmas: z.array(SublemmaSchema),
  }),
  z.object({ type: z.literal('error'), message: z.string() }),
]);
