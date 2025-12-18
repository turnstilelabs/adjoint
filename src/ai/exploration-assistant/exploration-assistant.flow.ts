import {
    ExplorationAssistantEventSchema,
    ExplorationAssistantInputSchema,
} from '@/ai/exploration-assistant/exploration-assistant.schemas';
import { explorationAssistantPrompt } from '@/ai/exploration-assistant/exploration-assistant.prompt';
import { updateArtifactsTool } from '@/ai/exploration-assistant/exploration-assistant.tools';
import { ai } from '@/ai/genkit';

export const explorationAssistantFlow = ai.defineFlow(
    {
        name: 'explorationAssistantFlow',
        inputSchema: ExplorationAssistantInputSchema,
        streamSchema: ExplorationAssistantEventSchema,
    },
    async (input, { sendChunk }) => {
        const { stream } = explorationAssistantPrompt.stream(input, {
            tools: [updateArtifactsTool],
            maxTurns: 1,
        });

        for await (const evt of stream) {
            if (evt.role === 'model' && evt.text) {
                sendChunk({ type: 'text', content: evt.text });
            }

            if (evt.role === 'tool' && evt.content[0].toolResponse?.name === 'update_artifacts') {
                const out = evt.content[0].toolResponse?.output as any;
                sendChunk({
                    type: 'artifacts',
                    turnId: out?.turnId ?? input.turnId,
                    artifacts: out?.artifacts,
                });
                return { done: true };
            }
        }

        return { done: true };
    },
);
