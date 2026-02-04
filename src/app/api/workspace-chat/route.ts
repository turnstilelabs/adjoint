import { appRoute } from '@genkit-ai/next';
import { workspaceAssistantFlow } from '@/ai/workspace-assistant/workspace-assistant.flow';
import { quietAppRoute } from '@/app/api/_utils/quiet-app-route';

export const POST = quietAppRoute(appRoute(workspaceAssistantFlow) as any);
