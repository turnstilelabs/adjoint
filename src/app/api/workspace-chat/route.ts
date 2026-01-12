import { appRoute } from '@genkit-ai/next';
import { workspaceAssistantFlow } from '@/ai/workspace-assistant/workspace-assistant.flow';

export const POST = appRoute(workspaceAssistantFlow);
