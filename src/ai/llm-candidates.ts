import { getLlmId, getLlmProvider, type LlmProvider } from '@/ai/genkit';

export function buildLlmCandidates(provider: LlmProvider, llmId: string): string[] {
  const candidates: string[] = [llmId];
  if (provider === 'googleai') {
    const proId = 'googleai/gemini-2.5-pro';
    if (llmId !== proId) candidates.push(proId);
  } else if (provider === 'openai') {
    const miniId = 'openai/gpt-4o-mini';
    if (llmId !== miniId) candidates.push(miniId);
  }
  return candidates;
}

export function getLlmCandidates(): string[] {
  const llmId = getLlmId();
  const provider = getLlmProvider();
  return buildLlmCandidates(provider, llmId);
}

