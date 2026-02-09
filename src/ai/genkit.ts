import { env } from '@/env';
import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';
import { openAI } from '@genkit-ai/compat-oai/openai';
import { anthropic } from '@genkit-ai/anthropic';
import { getLlmContext } from '@/ai/llm-context';

export type LlmProvider = 'googleai' | 'openai' | 'anthropic';

export function getDefaultProvider(): LlmProvider {
  return (env.LLM_PROVIDER ?? (env.OPENAI_API_KEY ? 'openai' : 'googleai')) as LlmProvider;
}

export function getDefaultModel(provider: LlmProvider): string {
  if (env.LLM_MODEL) return env.LLM_MODEL;
  if (provider === 'openai') return 'gpt-4o-mini';
  if (provider === 'anthropic') return 'claude-haiku-4-5';
  return 'gemini-2.5-flash';
}

export function getDefaultLlmId(): string {
  const provider = getDefaultProvider();
  return `${provider}/${getDefaultModel(provider)}`;
}

export function getLlmId(): string {
  const ctx = getLlmContext();
  if (ctx?.provider) {
    const model = ctx.model?.trim() || getDefaultModel(ctx.provider as LlmProvider);
    return `${ctx.provider}/${model}`;
  }
  return getDefaultLlmId();
}

export function getLlmProvider(): LlmProvider {
  const id = getLlmId();
  return (id.split('/')?.[0] || getDefaultProvider()) as LlmProvider;
}

export function getLlmModel(): string {
  return getLlmId().split('/')?.[1] || getDefaultModel(getDefaultProvider());
}

export function getLlmApiKey(): string | undefined {
  const ctx = getLlmContext();
  if (ctx?.apiKey) return ctx.apiKey;
  const provider = ctx?.provider ?? getDefaultProvider();
  if (provider === 'openai') return env.OPENAI_API_KEY;
  if (provider === 'anthropic') return env.ANTHROPIC_API_KEY;
  return env.GEMINI_API_KEY || env.GOOGLE_API_KEY || env.GOOGLE_GENAI_API_KEY;
}

export function requireLlmApiKey(): string {
  const key = getLlmApiKey();
  if (key) return key;
  const provider = getLlmProvider();
  throw new Error(`No API key configured for ${provider}.`);
}

// Register provider plugins unconditionally so BYOK can inject keys per request.
const plugins = [
  googleAI({ apiKey: false }),
  openAI({ apiKey: false }),
  ...(env.ANTHROPIC_API_KEY ? [anthropic({ apiKey: env.ANTHROPIC_API_KEY })] : []),
];

if (process.env.NODE_ENV !== 'production') {
  try {
    if (env.LLM_MODEL?.startsWith('gemini-3')) {
      console.warn('[AI] LLM_MODEL is set to a Gemini 3 preview model. These models require thought_signature for tool calls and updated thinking_config. If you encounter 400 errors, switch to gemini-2.5-flash.');
    }
  } catch { }
}

export const ai = genkit({
  plugins,
  model: getDefaultLlmId(),
});
