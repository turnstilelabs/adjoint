import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  AI_SETTINGS_COOKIE_MAX_AGE,
  AI_SETTINGS_COOKIE_NAME,
  decryptAiSettings,
  encryptAiSettings,
} from '@/ai/ai-settings-cookie';
import { getDefaultModel, getDefaultProvider } from '@/ai/genkit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const InputSchema = z.object({
  mode: z.enum(['default', 'custom']),
  provider: z.enum(['openai', 'googleai', 'anthropic']).optional(),
  model: z
    .string()
    .transform((v) => v.trim())
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  apiKey: z
    .string()
    .transform((v) => v.trim())
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
});

function getDefaults() {
  const defaultProvider = getDefaultProvider();
  const defaultModel = getDefaultModel(defaultProvider);
  return { defaultProvider, defaultModel };
}

export async function GET(req: NextRequest) {
  const { defaultProvider, defaultModel } = getDefaults();
  const raw = req.cookies.get(AI_SETTINGS_COOKIE_NAME)?.value;
  const settings = decryptAiSettings(raw);
  if (!settings) {
    const res = NextResponse.json({
      mode: 'default',
      provider: defaultProvider,
      model: defaultModel,
      hasKey: false,
      savedProvider: null,
      defaultProvider,
      defaultModel,
    });
    if (raw) {
      res.cookies.set(AI_SETTINGS_COOKIE_NAME, '', {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 0,
      });
    }
    return res;
  }

  return NextResponse.json({
    mode: 'custom',
    provider: settings.provider,
    model: settings.model,
    hasKey: Boolean(settings.apiKey),
    savedProvider: settings.provider,
    defaultProvider,
    defaultModel,
  });
}

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = InputSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Invalid settings payload.' }, { status: 400 });
  }

  const { defaultProvider, defaultModel } = getDefaults();
  const input = parsed.data;

  if (input.mode === 'default') {
    const res = NextResponse.json({
      ok: true,
      mode: 'default',
      provider: defaultProvider,
      model: defaultModel,
      hasKey: false,
      savedProvider: null,
      defaultProvider,
      defaultModel,
    });
    res.cookies.set(AI_SETTINGS_COOKIE_NAME, '', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 0,
    });
    return res;
  }

  const model = String(input.model || '').trim();
  if (!input.provider || !model) {
    return NextResponse.json({ ok: false, error: 'Provider and model are required.' }, { status: 400 });
  }

  const existing = decryptAiSettings(req.cookies.get(AI_SETTINGS_COOKIE_NAME)?.value);
  const apiKey =
    String(input.apiKey || '').trim() ||
    (existing && existing.provider === input.provider ? existing.apiKey : '');

  if (!apiKey) {
    return NextResponse.json({ ok: false, error: 'API key is required.' }, { status: 400 });
  }

  let token = '';
  try {
    token = encryptAiSettings({
      provider: input.provider,
      model,
      apiKey,
    });
  } catch (e: any) {
    const msg = String(e?.message || e || 'Failed to encrypt settings.');
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }

  const res = NextResponse.json({
    ok: true,
    mode: 'custom',
    provider: input.provider,
    model,
    hasKey: true,
    savedProvider: input.provider,
    defaultProvider,
    defaultModel,
  });
  res.cookies.set(AI_SETTINGS_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: AI_SETTINGS_COOKIE_MAX_AGE,
  });
  return res;
}

export async function DELETE() {
  const { defaultProvider, defaultModel } = getDefaults();
  const res = NextResponse.json({
    ok: true,
    mode: 'default',
    provider: defaultProvider,
    model: defaultModel,
    hasKey: false,
    savedProvider: null,
    defaultProvider,
    defaultModel,
  });
  res.cookies.set(AI_SETTINGS_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  return res;
}
