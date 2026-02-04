import { appRoute } from '@genkit-ai/next';
import { interactiveAssistantFlow } from '@/ai/interactive-assistant/interactive-assistant.flow';
import { quietAppRoute } from '@/app/api/_utils/quiet-app-route';

export const POST = quietAppRoute(appRoute(interactiveAssistantFlow) as any);
