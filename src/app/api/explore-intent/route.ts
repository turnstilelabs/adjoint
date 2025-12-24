import { appRoute } from '@genkit-ai/next';
import { classifyExploreIntentFlow } from '@/ai/explore-intent/classify-explore-intent.flow';

export const POST = appRoute(classifyExploreIntentFlow);
