'use server';

import { decomposeProof, type Sublemma } from '@/ai/flows/llm-proof-decomposition';
import { validateStatement, validateProofExcerptInContext } from '@/ai/flows/validate-statement';
import { validateProof } from '@/ai/flows/validate-proof';
import { validateRawProof } from '@/ai/flows/validate-raw-proof';
import { validateSublemma } from '@/ai/flows/validate-sublemma';
import { generateProofGraph } from '@/ai/flows/generate-proof-graph';
import type { GenerateProofGraphOutput } from '@/ai/flows/generate-proof-graph';
import { reviewArtifactSoundness } from '@/ai/flows/review-artifact-soundness';
import type { ReviewArtifactInput } from '@/ai/flows/review-artifact-soundness.schemas';
import { attemptProof, type AttemptProofOutput } from '@/ai/flows/attempt-proof';
import { decomposeRawProof, type DecomposeRawProofOutput } from '@/ai/flows/decompose-raw-proof';
import { llmModel } from '@/ai/genkit';
import { normalizeModelError } from '@/lib/model-error-core';
import { createHash, randomUUID } from 'node:crypto';
import { convertSelectionToSympySpec, type SymPySpec } from '@/ai/flows/convert-selection-to-sympy-spec';

const isDev = process.env.NODE_ENV !== 'production';
const IDEMPOTENCY_TTL_MS = 2 * 60 * 1000; // 2 minutes

type CacheEntry<T> = { pending?: Promise<T>; value?: T; ts: number };

export type DecomposeResult =
  | { success: true; sublemmas: Sublemma[] }
  | { success: false; error: string };

export type GraphActionResult =
  | ({ success: true } & GenerateProofGraphOutput)
  | { success: false; error: string };

export type AttemptProofActionResult =
  | ({ success: true } & AttemptProofOutput)
  | { success: false; error: string };

export type DecomposeRawProofActionResult =
  | ({ success: true } & DecomposeRawProofOutput)
  | { success: false; error: string };

export type ValidateRawProofActionResult =
  | ({ success: true } & { isValid: boolean; feedback: string; model: string })
  | { success: false; error: string };

export type ReviewArtifactSoundnessActionResult =
  | ({ success: true } & {
    verdict: 'OK' | 'ISSUE' | 'UNCLEAR';
    summary: string;
    correctness: { verdict: 'OK' | 'ISSUE' | 'UNCLEAR'; feedback: string };
    clarity: { verdict: 'OK' | 'ISSUE' | 'UNCLEAR'; feedback: string };
    suggestedImprovement?: string;
    model: string;
  })
  | { success: false; error: string };

// Decompose and Graph caches (dev-only)
const decomposeCache: Map<string, CacheEntry<DecomposeResult>> = new Map();

const graphCache: Map<string, CacheEntry<GraphActionResult>> = new Map();

// Attempt/decompose caches (dev-only, short-lived to avoid duplicate calls)
const attemptCache: Map<string, CacheEntry<AttemptProofActionResult>> = new Map();
const decomposeRawCache: Map<string, CacheEntry<DecomposeRawProofActionResult>> = new Map();

// Convert-selection cache (dev-only, short-lived)
const sympySpecCache: Map<string, CacheEntry<{ success: true; spec: SymPySpec } | { success: false; error: string }>> =
  new Map();

function hashPayload(payload: unknown): string {
  try {
    return createHash('sha1').update(JSON.stringify(payload)).digest('hex').slice(0, 8);
  } catch {
    return 'na';
  }
}

export async function convertSelectionToSympySpecAction(input: {
  selectionLatex: string;
  selectionText: string;
}): Promise<{ success: true; spec: SymPySpec } | { success: false; error: string }> {
  const { reqId, hash } = logStart('convertSelectionToSympySpec', {
    selectionLatexLen: input?.selectionLatex?.length ?? 0,
    selectionTextLen: input?.selectionText?.length ?? 0,
  });

  const payloadKey = hashPayload(input);

  if (isDev) {
    const now = Date.now();
    const existing = sympySpecCache.get(payloadKey);
    if (existing?.pending) {
      console.info(`[SA][convertSelectionToSympySpec] dedupe pending reqId=${reqId} hash=${hash}`);
      return existing.pending;
    }
    if (existing?.value && now - existing.ts < IDEMPOTENCY_TTL_MS) {
      console.info(`[SA][convertSelectionToSympySpec] cache hit reqId=${reqId} hash=${hash}`);
      return existing.value;
    }

    const pending = (async () => {
      try {
        const spec = await convertSelectionToSympySpec(input);
        const result = { success: true as const, spec };
        logSuccess('convertSelectionToSympySpec', reqId, hash);
        sympySpecCache.set(payloadKey, { value: result, ts: Date.now() });
        return result;
      } catch (error) {
        logError('convertSelectionToSympySpec', reqId, hash, error);
        sympySpecCache.delete(payloadKey);
        const norm = normalizeModelError(error);
        return { success: false as const, error: norm.message };
      }
    })();

    sympySpecCache.set(payloadKey, { pending, ts: now });
    return pending;
  }

  try {
    const spec = await convertSelectionToSympySpec(input);
    logSuccess('convertSelectionToSympySpec', reqId, hash);
    return { success: true as const, spec };
  } catch (error) {
    logError('convertSelectionToSympySpec', reqId, hash, error);
    const norm = normalizeModelError(error);
    return { success: false as const, error: norm.message };
  }
}

export async function attemptProofAction(problem: string): Promise<AttemptProofActionResult> {
  const { reqId, hash } = logStart('attemptProof', { problem });
  const key = problem.trim();

  if (isDev) {
    const now = Date.now();
    const existing = attemptCache.get(key);
    if (existing?.pending) {
      console.info(`[SA][attemptProof] dedupe pending reqId=${reqId} hash=${hash}`);
      return existing.pending;
    }
    if (existing?.value && now - existing.ts < IDEMPOTENCY_TTL_MS) {
      console.info(`[SA][attemptProof] cache hit reqId=${reqId} hash=${hash}`);
      return existing.value;
    }

    const pending = (async () => {
      try {
        const out = await attemptProof({ problem });
        const result = { success: true as const, ...out };
        logSuccess('attemptProof', reqId, hash);
        attemptCache.set(key, { value: result, ts: Date.now() });
        return result;
      } catch (error) {
        logError('attemptProof', reqId, hash, error);
        attemptCache.delete(key);
        return { success: false as const, error: 'Failed to attempt proof with AI.' };
      }
    })();

    attemptCache.set(key, { pending, ts: now });
    return pending;
  }

  try {
    const out = await attemptProof({ problem });
    logSuccess('attemptProof', reqId, hash);
    return { success: true as const, ...out };
  } catch (error) {
    logError('attemptProof', reqId, hash, error);
    return { success: false as const, error: 'Failed to attempt proof with AI.' };
  }
}

// Force path: bypass dev cache to re-run attempt immediately
export async function attemptProofActionForce(problem: string): Promise<AttemptProofActionResult> {
  const { reqId, hash } = logStart('attemptProof(force)', { problem });
  try {
    const out = await attemptProof({ problem });
    logSuccess('attemptProof(force)', reqId, hash);
    return { success: true as const, ...out };
  } catch (error) {
    logError('attemptProof(force)', reqId, hash, error);
    return { success: false as const, error: 'Failed to attempt proof with AI.' };
  }
}

export async function decomposeRawProofAction(
  rawProof: string,
): Promise<DecomposeRawProofActionResult> {
  const { reqId, hash } = logStart('decomposeRawProof', { len: rawProof?.length ?? 0 });
  const key = hashPayload(rawProof);

  if (isDev) {
    const now = Date.now();
    const existing = decomposeRawCache.get(key);
    if (existing?.pending) {
      console.info(`[SA][decomposeRawProof] dedupe pending reqId=${reqId} hash=${hash}`);
      return existing.pending;
    }
    if (existing?.value && now - existing.ts < IDEMPOTENCY_TTL_MS) {
      console.info(`[SA][decomposeRawProof] cache hit reqId=${reqId} hash=${hash}`);
      return existing.value;
    }

    const pending = (async () => {
      try {
        const out = await decomposeRawProof({ rawProof });
        const result = { success: true as const, ...out };
        logSuccess('decomposeRawProof', reqId, hash);
        decomposeRawCache.set(key, { value: result, ts: Date.now() });
        return result;
      } catch (error) {
        logError('decomposeRawProof', reqId, hash, error);
        decomposeRawCache.delete(key);
        return { success: false as const, error: 'Failed to decompose raw proof with AI.' };
      }
    })();

    decomposeRawCache.set(key, { pending, ts: now });
    return pending;
  }

  try {
    const out = await decomposeRawProof({ rawProof });
    logSuccess('decomposeRawProof', reqId, hash);
    return { success: true as const, ...out };
  } catch (error) {
    logError('decomposeRawProof', reqId, hash, error);
    return { success: false as const, error: 'Failed to decompose raw proof with AI.' };
  }
}

function logStart(action: string, payload: unknown) {
  const reqId = randomUUID();
  const hash = hashPayload(payload);
  const at = new Date().toISOString();
  console.info(`[SA][${action}] start reqId=${reqId} hash=${hash} at=${at}`);
  return { reqId, hash, at };
}

function logSuccess(action: string, reqId: string, hash: string) {
  const at = new Date().toISOString();
  console.info(`[SA][${action}] ok    reqId=${reqId} hash=${hash} at=${at}`);
}

function logError(action: string, reqId: string, hash: string, err: unknown) {
  const at = new Date().toISOString();
  console.error(
    `[SA][${action}] error reqId=${reqId} hash=${hash} at=${at} msg=${err instanceof Error ? err.message : String(err)
    }`,
  );
}

export async function decomposeProblemAction(problem: string): Promise<DecomposeResult> {
  const { reqId, hash } = logStart('decomposeProblem', { problem });
  if (!problem) {
    return { success: false, error: 'Problem statement cannot be empty.' };
  }

  const key = problem.trim();

  if (isDev) {
    const now = Date.now();
    const existing = decomposeCache.get(key);
    if (existing?.pending) {
      console.info(`[SA][decomposeProblem] dedupe pending reqId=${reqId} hash=${hash}`);
      return existing.pending;
    }
    if (existing?.value && now - existing.ts < IDEMPOTENCY_TTL_MS) {
      console.info(`[SA][decomposeProblem] cache hit reqId=${reqId} hash=${hash}`);
      return existing.value;
    }

    const pending = (async () => {
      try {
        const { sublemmas } = await decomposeProof({ problem });
        const result = { success: true, sublemmas } as const;
        logSuccess('decomposeProblem', reqId, hash);
        // Store value with fresh timestamp for TTL window
        decomposeCache.set(key, { value: result, ts: Date.now() });
        return result;
      } catch (error) {
        logError('decomposeProblem', reqId, hash, error);
        // On error, do not cache failures
        const norm = normalizeModelError(error);
        const result = { success: false as const, error: norm.message };
        // Clear pending entry so subsequent attempts can retry
        decomposeCache.delete(key);
        return result;
      }
    })();

    // Save pending promise so concurrent or immediate replays reuse it
    decomposeCache.set(key, { pending, ts: now });
    return pending;
  }

  // Production: normal execution
  try {
    const { sublemmas } = await decomposeProof({ problem });
    logSuccess('decomposeProblem', reqId, hash);
    return { success: true, sublemmas };
  } catch (error) {
    logError('decomposeProblem', reqId, hash, error);
    const norm = normalizeModelError(error);
    return {
      success: false as const,
      error: norm.message,
    };
  }
}

export async function validateStatementAction(statement: string) {
  const { reqId, hash } = logStart('validateStatement', { statement });
  if (!statement) {
    return { success: false, error: 'Statement cannot be empty.' };
  }
  try {
    const result = await validateStatement({ statement });
    logSuccess('validateStatement', reqId, hash);
    return { success: true, ...result, model: llmModel };
  } catch (error) {
    logError('validateStatement', reqId, hash, error);
    return {
      success: false,
      error: 'Failed to validate the statement with AI.',
    };
  }
}

// New: Check-again for proof excerpts with lemma context
export async function checkAgainProofAction(excerpt: string, lemmaStatement: string) {
  const { reqId, hash } = logStart('checkAgainProof', {
    excerptLen: excerpt?.length ?? 0,
    lemmaLen: lemmaStatement?.length ?? 0,
  });
  if (!excerpt || !lemmaStatement) {
    return { success: false, error: 'Excerpt and lemma statement cannot be empty.' };
  }
  try {
    const result = await validateProofExcerptInContext({ excerpt, lemmaStatement });
    logSuccess('checkAgainProof', reqId, hash);
    return { success: true, ...result, model: llmModel };
  } catch (error) {
    logError('checkAgainProof', reqId, hash, error);
    return {
      success: false,
      error: 'Failed to validate the proof excerpt against the lemma statement.',
    };
  }
}

export async function validateProofAction(problem: string, proofSteps: Sublemma[]) {
  const { reqId, hash } = logStart('validateProof', { problem, steps: proofSteps?.length });
  if (proofSteps.length === 0) {
    return { success: false as const, error: 'There are no proof steps to validate.' };
  }
  try {
    const result = await validateProof({ problem, proofSteps });
    logSuccess('validateProof', reqId, hash);
    return { success: true as const, ...result, model: llmModel };
  } catch (error) {
    logError('validateProof', reqId, hash, error);
    return { success: false as const, error: 'Failed to validate the proof with AI.' };
  }
}

export async function validateRawProofAction(
  problem: string,
  rawProof: string,
): Promise<ValidateRawProofActionResult> {
  const { reqId, hash } = logStart('validateRawProof', {
    problem,
    rawLen: rawProof?.length ?? 0,
  });
  if (!rawProof?.trim()) {
    return { success: false as const, error: 'Raw proof cannot be empty.' };
  }
  try {
    const result = await validateRawProof({ problem, rawProof });
    logSuccess('validateRawProof', reqId, hash);
    return { success: true as const, ...result, model: llmModel };
  } catch (error) {
    logError('validateRawProof', reqId, hash, error);
    return { success: false as const, error: 'Failed to validate the raw proof with AI.' };
  }
}

export async function reviewArtifactSoundnessAction(
  input: ReviewArtifactInput,
): Promise<ReviewArtifactSoundnessActionResult> {
  const { reqId, hash } = logStart('reviewArtifactSoundness', {
    type: input?.type,
    label: input?.label,
    contentLen: input?.content?.length ?? 0,
    hasProof: Boolean((input?.proof ?? '').trim()),
  });
  try {
    const out = await reviewArtifactSoundness(input);
    logSuccess('reviewArtifactSoundness', reqId, hash);
    return { success: true as const, ...out, model: llmModel };
  } catch (error) {
    logError('reviewArtifactSoundness', reqId, hash, error);
    const norm = normalizeModelError(error);
    return { success: false as const, error: norm.message };
  }
}

export async function validateSublemmaAction(
  problem: string,
  proofSteps: Sublemma[],
  stepIndex: number,
) {
  const { reqId, hash } = logStart('validateSublemma', {
    problem,
    steps: proofSteps?.length,
    stepIndex,
  });
  if (proofSteps.length === 0) {
    return { success: false as const, error: 'There are no proof steps to validate.' };
  }
  if (stepIndex < 0 || stepIndex >= proofSteps.length) {
    return { success: false as const, error: 'Invalid step index.' };
  }
  try {
    const result = await validateSublemma({ problem, proofSteps, stepIndex });
    logSuccess('validateSublemma', reqId, hash);
    return { success: true as const, ...result, model: llmModel };
  } catch (error) {
    logError('validateSublemma', reqId, hash, error);
    return { success: false as const, error: 'Failed to validate the step with AI.' };
  }
}

export async function generateProofGraphAction(
  goalStatement: string,
  proofSteps: Sublemma[],
): Promise<GraphActionResult> {
  // Backward-compatible API name: callers should pass the goal statement.
  return generateProofGraphForGoalAction(goalStatement, proofSteps);
}

export async function generateProofGraphForGoalAction(
  goalStatement: string,
  proofSteps: Sublemma[],
): Promise<GraphActionResult> {
  const goal = (goalStatement || '').trim();
  const { reqId, hash } = logStart('generateProofGraph(goal)', {
    goalLen: goal.length,
    steps: proofSteps?.length,
  });
  if (!goal) {
    return { success: false as const, error: 'Goal statement cannot be empty.' };
  }
  if (proofSteps.length === 0) {
    return {
      success: false as const,
      error: 'There are no proof steps to generate a graph from.',
    };
  }

  // Normalize to satisfy SublemmaSchema and to ensure we only use lemma statements (not proofs).
  const normalizedSteps: Sublemma[] = proofSteps.map((s: any) => ({
    title: s?.title ?? '',
    statement: s?.statement ?? s?.content ?? '',
    // The graph prompt should ignore proofs; keep empty to avoid leakage.
    proof: '',
  }));

  const payload = { goalStatement: goal, proofSteps: normalizedSteps };

  if (isDev) {
    const now = Date.now();
    const key = hashPayload(payload);

    const existing = graphCache.get(key);
    if (existing?.pending) {
      console.info(`[SA][generateProofGraph(goal)] dedupe pending reqId=${reqId} hash=${hash}`);
      return existing.pending;
    }
    if (existing?.value && now - existing.ts < IDEMPOTENCY_TTL_MS) {
      console.info(`[SA][generateProofGraph(goal)] cache hit reqId=${reqId} hash=${hash}`);
      return existing.value;
    }

    const pending = (async () => {
      try {
        const result = await generateProofGraph(payload as any);
        const out = { success: true as const, ...result };
        logSuccess('generateProofGraph(goal)', reqId, hash);
        graphCache.set(key, { value: out, ts: Date.now() });
        return out;
      } catch (error) {
        logError('generateProofGraph(goal)', reqId, hash, error);
        const norm = normalizeModelError(error);
        const out = { success: false as const, error: norm.message };
        graphCache.delete(key);
        return out;
      }
    })();

    graphCache.set(key, { pending, ts: now });
    return pending;
  }

  try {
    const result = await generateProofGraph(payload as any);
    logSuccess('generateProofGraph(goal)', reqId, hash);
    return { success: true as const, ...result };
  } catch (error) {
    logError('generateProofGraph(goal)', reqId, hash, error);
    const norm = normalizeModelError(error);
    return { success: false as const, error: norm.message };
  }
}
