import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextRequest } from 'next/server';
import { AI_SETTINGS_COOKIE_NAME, decryptAiSettings, type AiSettingsPayload } from '@/ai/ai-settings-cookie';

export type LlmContext = {
  provider: AiSettingsPayload['provider'];
  model?: string;
  apiKey?: string;
};

const storage = new AsyncLocalStorage<LlmContext | null>();

export function runWithLlmContext<T>(ctx: LlmContext | null, fn: () => Promise<T>): Promise<T> {
  return storage.run(ctx, fn);
}

export function getLlmContext(): LlmContext | null {
  return storage.getStore() ?? null;
}

export function getLlmContextFromCookieValue(value: string | null | undefined): LlmContext | null {
  const settings = decryptAiSettings(value);
  if (!settings) return null;
  return {
    provider: settings.provider,
    model: settings.model,
    apiKey: settings.apiKey,
  };
}

export function getLlmContextFromRequest(req: NextRequest): LlmContext | null {
  const raw = req.cookies.get(AI_SETTINGS_COOKIE_NAME)?.value;
  return getLlmContextFromCookieValue(raw);
}
