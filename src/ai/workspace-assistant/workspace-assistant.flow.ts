import {
    WorkspaceAssistantEventSchema,
    WorkspaceAssistantInputSchema,
} from '@/ai/workspace-assistant/workspace-assistant.schemas';
import { workspaceAssistantPrompt } from '@/ai/workspace-assistant/workspace-assistant.prompt';
import { ai, llmId } from '@/ai/genkit';
import { normalizeModelError } from '@/lib/model-error-core';

export const workspaceAssistantFlow = ai.defineFlow(
    {
        name: 'workspaceAssistantFlow',
        inputSchema: WorkspaceAssistantInputSchema,
        streamSchema: WorkspaceAssistantEventSchema,
    },
    async (input, { sendChunk }) => {
        try {
            const { stream } = workspaceAssistantPrompt.stream(input, {
                maxTurns: 1,
                model: llmId,
            } as any);

            for await (const evt of stream) {
                if (evt.role === 'model' && evt.text) {
                    sendChunk({ type: 'text', content: evt.text });
                }
            }
            return { done: true };
        } catch (e: any) {
            const norm = normalizeModelError(e);
            sendChunk({ type: 'error', message: norm.message || 'Workspace request failed.' } as any);
            return { done: true };
        }
    },
);
