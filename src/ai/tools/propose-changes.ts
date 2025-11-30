import { SublemmaSchema } from '@/ai/flows/schemas';
import { z } from 'zod';
import { ai } from '@/ai/genkit';
import type { Sublemma } from '@/ai/flows/llm-proof-decomposition';

export const proposeChanges = ai.defineTool(
  {
    name: 'propose_changes',
    description:
      'Return the final revised list of sublemmas for the proof. Do not include commentary; only the structured revised steps.',
    inputSchema: z.object({
      revisedSublemmas: z.array(SublemmaSchema),
    }),
    // We don't apply changes here; just echo back so we can stream it out cleanly.
    outputSchema: z.object({
      revisedSublemmas: z.array(SublemmaSchema),
    }),
  },
  async ({ revisedSublemmas }: { revisedSublemmas: Sublemma[] }) => {
    return { revisedSublemmas };
  },
);
