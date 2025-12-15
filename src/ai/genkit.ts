import { env } from '@/env';
import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';
import { openAI } from '@genkit-ai/compat-oai/openai';

const provider = env.LLM_PROVIDER ?? (env.OPENAI_API_KEY ? 'openai' : 'googleai');
const model = env.LLM_MODEL ?? (provider === 'openai' ? 'gpt-4o-mini' : 'gemini-2.5-flash');

const plugin = provider === 'openai' ? openAI() : googleAI();

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
