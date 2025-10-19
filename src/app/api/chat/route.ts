import { appRoute } from '@genkit-ai/next';
import { interactiveAssistantFlow } from '@/ai/interactive-assistant/interactive-assistant.flow';

export const POST = appRoute(interactiveAssistantFlow);
