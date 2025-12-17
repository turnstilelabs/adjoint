import { env } from '@/env';
import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';
import { openAI } from '@genkit-ai/compat-oai/openai';

const provider = env.LLM_PROVIDER ?? (env.OPENAI_API_KEY ? 'openai' : 'googleai');
const model = env.LLM_MODEL ?? (provider === 'openai' ? 'gpt-4o-mini' : 'gemini-2.5-flash');

// Register all available provider plugins so we can switch models at runtime for fallbacks.
const plugins = [
  ...(env.GEMINI_API_KEY || env.GOOGLE_API_KEY || env.GOOGLE_GENAI_API_KEY ? [googleAI()] : []),
  ...(env.OPENAI_API_KEY ? [openAI()] : []),
];

export const llmId = `${provider}/${model}`;
export const llmModel = model;

if (process.env.NODE_ENV !== 'production') {
  try {
    const enabledProviders = [
      (env.GEMINI_API_KEY || env.GOOGLE_API_KEY || env.GOOGLE_GENAI_API_KEY) ? 'googleai' : null,
      env.OPENAI_API_KEY ? 'openai' : null,
    ].filter(Boolean).join(',');
    console.info(`[AI] Using provider=${provider} model=${model} (plugins: ${enabledProviders || 'none'})`);
  } catch { }
}

export const ai = genkit({
  plugins,
  model: llmId,
});
