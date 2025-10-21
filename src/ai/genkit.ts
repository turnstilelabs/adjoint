import { env } from '@/env';
import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';
import { openAI } from '@genkit-ai/compat-oai/openai';

const provider = env.LLM_PROVIDER ?? (env.OPENAI_API_KEY ? 'openai' : 'googleai');
const model = env.LLM_MODEL ?? (provider === 'openai' ? 'gpt-5-mini' : 'gemini-2.5-flash');

const plugin = provider === 'openai' ? openAI() : googleAI();

export const ai = genkit({
  plugins: [plugin],
  model: `${provider}/${model}`,
});
