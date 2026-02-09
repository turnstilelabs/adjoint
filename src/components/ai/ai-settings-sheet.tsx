/* eslint-disable react/no-unescaped-entities */
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

type AiSettingsMode = 'default' | 'custom';
type Provider = 'openai' | 'googleai' | 'anthropic';

type AiSettingsResponse = {
  mode: AiSettingsMode;
  provider: Provider;
  model: string;
  hasKey: boolean;
  savedProvider: Provider | null;
  defaultProvider: Provider;
  defaultModel: string;
};

const SETTINGS_CACHE_TTL_MS = 30_000;
let settingsCache: { value: AiSettingsResponse; at: number } | null = null;

const MODEL_OPTIONS: Record<Provider, string[]> = {
  openai: ['gpt-5-mini-2025-08-07', 'gpt-5.2-2025-12-11', 'gpt-5.2-pro-2025-12-11'],
  googleai: ['gemini-3-flash-preview', 'gemini-2.5-pro', 'gemini-3-pro-preview'],
  anthropic: ['claude-haiku-4-5', 'claude-sonnet-4-5', 'claude-opus-4-6'],
};

export function AiSettingsSheet({ trigger }: { trigger: React.ReactNode }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [state, setState] = useState<AiSettingsResponse | null>(null);
  const [mode, setMode] = useState<AiSettingsMode>('default');
  const [provider, setProvider] = useState<Provider>('openai');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState<string | null>(null);

  const hasKey = Boolean(state?.hasKey);
  const savedProvider = state?.savedProvider ?? null;
  const hasKeyForProvider = hasKey && savedProvider === provider;
  const defaultSummary = state ? `${state.defaultProvider}/${state.defaultModel}` : '—';

  const recommendedModels = useMemo(() => {
    return MODEL_OPTIONS[provider] || [];
  }, [provider]);

  const applySettings = (data: AiSettingsResponse) => {
    setState(data);
    setMode(data.mode);
    if (data.mode === 'custom') {
      setProvider(data.provider);
      setModel(data.model || '');
    } else {
      setProvider(data.defaultProvider);
      setModel(data.defaultModel || MODEL_OPTIONS[data.defaultProvider]?.[0] || '');
    }
  };

  const loadSettings = async (opts?: { preferCache?: boolean }) => {
    const preferCache = opts?.preferCache ?? true;
    const now = Date.now();
    if (preferCache && settingsCache && now - settingsCache.at < SETTINGS_CACHE_TTL_MS) {
      applySettings(settingsCache.value);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/ai/settings');
      const text = await r.text();
      const data = text ? (JSON.parse(text) as AiSettingsResponse) : null;
      if (!data) {
        throw new Error('Empty settings response.');
      }
      settingsCache = { value: data, at: Date.now() };
      applySettings(data);
    } catch (e: any) {
      setError(String(e?.message || e || 'Failed to load settings.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    void loadSettings({ preferCache: true });
  }, [open]);

  useEffect(() => {
    if (mode !== 'custom') return;
    setModel((prev) => (prev.trim() ? prev : MODEL_OPTIONS[provider]?.[0] || ''));
  }, [mode, provider]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload =
        mode === 'default'
          ? { mode }
          : {
            mode,
            provider,
            model: model.trim(),
            apiKey: apiKey.trim() ? apiKey.trim() : undefined,
          };
      const res = await fetch('/api/ai/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error || 'Failed to save AI settings.');
      }
      setState(json);
      settingsCache = { value: json, at: Date.now() };
      setApiKey('');
      toast({ title: 'AI settings saved.' });
    } catch (e: any) {
      setError(String(e?.message || e || 'Failed to save AI settings.'));
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/ai/settings', { method: 'DELETE' });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error || 'Failed to reset AI settings.');
      }
      setState(json);
      settingsCache = { value: json, at: Date.now() };
      setMode('default');
      setApiKey('');
      setModel('');
      toast({ title: 'AI settings reset to default.' });
    } catch (e: any) {
      setError(String(e?.message || e || 'Failed to reset AI settings.'));
    } finally {
      setSaving(false);
    }
  };

  const prefetchProps = {
    onMouseEnter: () => void loadSettings({ preferCache: true }),
    onFocus: () => void loadSettings({ preferCache: true }),
  };

  const triggerNode = (() => {
    if (React.isValidElement(trigger)) {
      return React.cloneElement(trigger as any, prefetchProps);
    }
    return <span {...prefetchProps}>{trigger}</span>;
  })();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{triggerNode}</SheetTrigger>
      <SheetContent side="right" className="w-[440px] max-w-[calc(100vw-2rem)]">
        <SheetHeader>
          <SheetTitle>AI Settings</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-5 text-sm">
          <div className="space-y-1 text-muted-foreground" />

          {loading ? (
            <div className="text-muted-foreground">Loading settings…</div>
          ) : (
            <>
              <div className="space-y-2">
                <RadioGroup
                  value={mode}
                  onValueChange={(v) => setMode(v as AiSettingsMode)}
                  className="gap-3"
                >
                  <label className="flex items-start gap-2 rounded-md border p-3">
                    <RadioGroupItem value="default" id="ai-mode-default" className="mt-0.5" />
                    <div>
                      <div className="text-sm font-medium">Default</div>
                      <div className="text-xs text-muted-foreground">
                        {defaultSummary}
                      </div>
                    </div>
                  </label>
                  <label className="flex items-start gap-2 rounded-md border p-3">
                    <RadioGroupItem value="custom" id="ai-mode-custom" className="mt-0.5" />
                    <div>
                      <div className="text-sm font-medium">Personal API key</div>
                      <div className="text-xs text-muted-foreground">Use your own provider and model.</div>
                    </div>
                  </label>
                </RadioGroup>
              </div>

              {mode === 'custom' && (
                <div className="space-y-3 rounded-md border p-3">
                  <div className="space-y-2">
                    <Label htmlFor="ai-provider">Provider</Label>
                    <select
                      id="ai-provider"
                      className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                      value={provider}
                      onChange={(e) => setProvider(e.target.value as typeof provider)}
                    >
                      <option value="openai">OpenAI</option>
                      <option value="googleai">Google AI</option>
                      <option value="anthropic">Anthropic</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="ai-model">Model</Label>
                    <select
                      id="ai-model"
                      className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                    >
                      {recommendedModels.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="ai-key">API key</Label>
                    <Input
                      id="ai-key"
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder={hasKeyForProvider ? 'Saved (leave blank to keep)' : 'sk-...'}
                    />
                  </div>
                </div>
              )}

              {error ? <div className="text-xs text-destructive">{error}</div> : null}
            </>
          )}
        </div>

        <SheetFooter className="mt-6 gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={reset}
            disabled={saving || loading}
          >
            Reset to Default
          </Button>
          <Button onClick={save} disabled={saving || loading}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
