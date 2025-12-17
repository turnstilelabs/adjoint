import { env } from '@/env';
import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';
import { openAI } from '@genkit-ai/compat-oai/openai';
import { anthropicWithJsonSupport } from './anthropic-plugin';

const provider = env.LLM_PROVIDER ?? (env.OPENAI_API_KEY ? 'openai' : 'googleai');

function getDefaultModel(provider: string): string {
  switch (provider) {
    case 'openai':
      return 'gpt-4o-mini';
    case 'anthropic':
      return 'claude-4-sonnet';
    default:
      return 'gemini-2.5-flash';
  }
}

const model = env.LLM_MODEL ?? getDefaultModel(provider);

function getPlugin(provider: string) {
  switch (provider) {
    case 'openai':
      return openAI();
    case 'anthropic':
      return anthropicWithJsonSupport();
    default:
      return googleAI();
  }
}

const plugin = getPlugin(provider);

export const llmId = `${provider}/${model}`;
export const llmModel = model;

if (process.env.NODE_ENV !== 'production') {
  try {
    console.info(`[AI] Using provider=${provider} model=${model}`);
  } catch { }
}

export const ai = genkit({
  plugins: [plugin],
  model: llmId,
});
