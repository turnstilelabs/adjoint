import { env } from '@/env';
import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';
import { openAI } from '@genkit-ai/compat-oai/openai';
import { anthropic } from '@genkit-ai/anthropic';

const provider = env.LLM_PROVIDER ?? (env.OPENAI_API_KEY ? 'openai' : 'googleai');

const model =
  env.LLM_MODEL ??
  (provider === 'openai'
    ? 'gpt-4o-mini'
    : provider === 'anthropic'
      ? 'claude-haiku-4-5'
      : 'gemini-2.5-flash');

// Register all available provider plugins so we can switch models at runtime for fallbacks.
const plugins = [
  ...(env.GEMINI_API_KEY || env.GOOGLE_API_KEY || env.GOOGLE_GENAI_API_KEY ? [googleAI()] : []),
  ...(env.OPENAI_API_KEY ? [openAI()] : []),
  ...(env.ANTHROPIC_API_KEY ? [anthropic({ apiKey: env.ANTHROPIC_API_KEY })] : []),
];

export const llmId = `${provider}/${model}`;
export const llmModel = model;

if (process.env.NODE_ENV !== 'production') {
  try {
    const enabledProviders = [
      (env.GEMINI_API_KEY || env.GOOGLE_API_KEY || env.GOOGLE_GENAI_API_KEY) ? 'googleai' : null,
      env.OPENAI_API_KEY ? 'openai' : null,
      env.ANTHROPIC_API_KEY ? 'anthropic' : null,
    ].filter(Boolean).join(',');
    console.info(`[AI] Using provider=${provider} model=${model} (plugins: ${enabledProviders || 'none'})`);
    if (provider === 'googleai' && !env.LLM_MODEL) {
      console.info('[AI] Defaulting Google model to gemini-2.5-flash for stable tool-calling.');
    }
    if (env.LLM_MODEL?.startsWith('gemini-3')) {
      console.warn('[AI] LLM_MODEL is set to a Gemini 3 preview model. These models require thought_signature for tool calls and updated thinking_config. If you encounter 400 errors, switch to gemini-2.5-flash.');
    }
  } catch { }
}

export const ai = genkit({
  plugins,
  model: llmId,
});
