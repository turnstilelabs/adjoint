import { appRoute } from '@genkit-ai/next';
import { explorationAssistantFlow } from '@/ai/exploration-assistant/exploration-assistant.flow';
import { quietAppRoute } from '@/app/api/_utils/quiet-app-route';

export const POST = quietAppRoute(appRoute(explorationAssistantFlow) as any);
