import { appRoute } from '@genkit-ai/next';
import { explorationAssistantFlow } from '@/ai/exploration-assistant/exploration-assistant.flow';

export const POST = appRoute(explorationAssistantFlow);
