import { env } from '@/env';
import { createOpenAIShim } from './openai-shim';

void env;

type AICompat = {
  definePrompt<TIn = any, TOut = any>(config: {
    name: string;
    input: { schema: any };
    output: { schema: any };
    prompt: string;
    system?: string;
  }): (input: TIn) => Promise<{ output: TOut }>;
  defineFlow<TIn = any, TOut = any>(
    config: {
      name: string;
      inputSchema: any;
      outputSchema: any;
      cache?: { ttl?: number };
    },
    handler: (input: any) => Promise<any>,
  ): (input: TIn) => Promise<TOut>;
};

const provider = process.env.LLM_PROVIDER ?? (process.env.OPENAI_API_KEY ? 'openai' : 'googleai');
const model = process.env.LLM_MODEL;

declare global {
  // eslint-disable-next-line no-var
  var __adj_ai: AICompat | undefined;
  // eslint-disable-next-line no-var
  var __adj_genkit_loaded: boolean | undefined;
}

let ai: AICompat;

if (!globalThis.__adj_ai) {
  if (provider === 'openai') {
    console.info(`[AI] Provider=openai model=${model ?? 'gpt-5-mini'}`);
    ai = createOpenAIShim({
      model: model ?? 'gpt-5-mini',
    }) as unknown as AICompat;
  } else {
    // Default: Google AI via Genkit.
    // Guard to avoid registering process signal listeners multiple times in dev/HMR:
    // only initialize Genkit once per process.
    if (globalThis.__adj_genkit_loaded && globalThis.__adj_ai) {
      ai = globalThis.__adj_ai as AICompat;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { genkit } = require('genkit');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { googleAI } = require('@genkit-ai/googleai');

      console.info(`[AI] Provider=googleai model=${model ?? 'gemini-2.5-flash'}`);
      ai = genkit({
        plugins: [googleAI()],
        model: `googleai/${model ?? 'gemini-2.5-flash'}`,
      }) as unknown as AICompat;

      globalThis.__adj_genkit_loaded = true;
    }
  }
  globalThis.__adj_ai = ai;
} else {
  ai = globalThis.__adj_ai as AICompat;
}

export { ai };
