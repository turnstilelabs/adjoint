import { z } from 'zod';
import { ai } from '@/ai/genkit';
import { ExploreArtifactsSchema } from '@/ai/exploration-assistant/exploration-assistant.schemas';

export const updateArtifactsTool = ai.defineTool(
    {
        name: 'update_artifacts',
        description:
            'Return the extracted exploration artifacts. Do not include commentary; only structured artifacts grounded in the conversation.',
        inputSchema: z.object({
            turnId: z.number(),
            artifacts: ExploreArtifactsSchema,
        }),
        outputSchema: z.object({
            turnId: z.number(),
            artifacts: ExploreArtifactsSchema,
        }),
    },
    async ({ turnId, artifacts }) => {
        return { turnId, artifacts };
    },
);
