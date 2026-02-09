import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { env } from '@/env';

export const AI_SETTINGS_COOKIE_NAME = 'adjoint_ai_settings_v1';
export const AI_SETTINGS_COOKIE_MAX_AGE = 60 * 60 * 24 * 90; // 90 days

export type AiSettingsPayload = {
  provider: 'openai' | 'googleai' | 'anthropic';
  model: string;
  apiKey: string;
};

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const MAX_KEY_CHARS = 4000;
const MAX_MODEL_CHARS = 200;

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64UrlDecode(s: string): Buffer {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = padded.length % 4 === 0 ? 0 : 4 - (padded.length % 4);
  const pad = padLen ? '='.repeat(padLen) : '';
  return Buffer.from(padded + pad, 'base64');
}

function deriveKey(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}

function normalizeProvider(value: unknown): AiSettingsPayload['provider'] | null {
  const s = String(value || '').toLowerCase();
  if (s === 'openai' || s === 'googleai' || s === 'anthropic') return s;
  return null;
}

export function encryptAiSettings(payload: AiSettingsPayload): string {
  if (!env.AI_SETTINGS_SECRET) {
    throw new Error('AI settings secret is not configured.');
  }
  const iv = randomBytes(IV_BYTES);
  const key = deriveKey(env.AI_SETTINGS_SECRET);
  const cipher = createCipheriv(ALGO, key, iv);
  const plaintext = JSON.stringify(payload);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    'v1',
    base64UrlEncode(iv),
    base64UrlEncode(ciphertext),
    base64UrlEncode(tag),
  ].join('.');
}

export function decryptAiSettings(token: string | null | undefined): AiSettingsPayload | null {
  if (!token) return null;
  if (!env.AI_SETTINGS_SECRET) return null;
  const parts = String(token || '').split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') return null;
  try {
    const iv = base64UrlDecode(parts[1]);
    const ciphertext = base64UrlDecode(parts[2]);
    const tag = base64UrlDecode(parts[3]);
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) return null;
    const key = deriveKey(env.AI_SETTINGS_SECRET);
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    const parsed = JSON.parse(plaintext);
    const provider = normalizeProvider(parsed?.provider);
    const model = String(parsed?.model || '').trim();
    const apiKey = String(parsed?.apiKey || '').trim();
    if (!provider || !model || !apiKey) return null;
    if (model.length > MAX_MODEL_CHARS || apiKey.length > MAX_KEY_CHARS) return null;
    return { provider, model, apiKey };
  } catch {
    return null;
  }
}
