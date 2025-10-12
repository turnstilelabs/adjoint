import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';
import { env } from '@/env';
import { createOpenAIShim } from './openai-shim';

// Ensure env validation runs at module load
void env;

// A minimal compatibility surface so flows keep type context
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
    // Provide contextual typing for handler param to avoid implicit-any errors
    handler: (input: any) => Promise<any>
  ): (input: TIn) => Promise<TOut>;
};

// Select provider/model via env with sensible defaults
const provider = process.env.LLM_PROVIDER ?? 'googleai';
const model = process.env.LLM_MODEL;

let ai: AICompat;

if (provider === 'openai') {
  // Use our lightweight OpenAI shim that mimics Genkit's definePrompt/defineFlow API
  console.info(`[AI] Provider=openai model=${model ?? 'gpt-5-mini'}`);
  ai = createOpenAIShim({
    model: model ?? 'gpt-5-mini',
  }) as unknown as AICompat;
} else {
  // Default: Google AI via Genkit
  console.info(`[AI] Provider=googleai model=${model ?? 'gemini-2.5-flash'}`);
  ai = genkit({
    plugins: [googleAI()],
    model: `googleai/${model ?? 'gemini-2.5-flash'}`,
  }) as unknown as AICompat;
}

export { ai };
