import {
  InteractiveAssistantEventSchema,
  InteractiveAssistantInputSchema,
} from '@/ai/interactive-assistant/interactive-assistant.schemas';
import type { Sublemma } from '@/ai/flows/llm-proof-decomposition';
import { proposeChangesTool } from '@/ai/interactive-assistant/interactive-assistant.tools';
import { interactiveAssistantPrompt } from '@/ai/interactive-assistant/interactive-assistant.prompt';
import { ai } from '@/ai/genkit';

export const interactiveAssistantFlow = ai.defineFlow(
  {
    name: 'interactiveAssistantFlow',
    inputSchema: InteractiveAssistantInputSchema,
    streamSchema: InteractiveAssistantEventSchema,
  },
  async (input, { sendChunk }) => {
    const { stream } = interactiveAssistantPrompt.stream(input, {
      tools: [proposeChangesTool],
      maxTurns: 1,
    });

    for await (const evt of stream) {
      if (evt.role === 'tool' && evt.content[0].toolResponse?.name === 'propose_changes') {
        const revisedSublemmas = (evt.content[0].toolResponse?.output as { revisedSublemmas?: Sublemma[] })
          ?.revisedSublemmas;
        sendChunk({
          type: 'proposal',
          revisedSublemmas: Array.isArray(revisedSublemmas) ? revisedSublemmas : [],
        });
        return { done: true };
      }
      if (evt.role === 'model' && evt.text) {
        sendChunk({ type: 'text', content: evt.text });
      }
    }

    return { done: true };
  },
);
