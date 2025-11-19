'use server';

import { decomposeProof, type Sublemma } from '@/ai/flows/llm-proof-decomposition';
import { validateStatement } from '@/ai/flows/validate-statement';
import { validateProof } from '@/ai/flows/validate-proof';
import { generateProofGraph } from '@/ai/flows/generate-proof-graph';
import type { GenerateProofGraphOutput } from '@/ai/flows/generate-proof-graph';
import { createHash, randomUUID } from 'node:crypto';

const isDev = process.env.NODE_ENV !== 'production';
const IDEMPOTENCY_TTL_MS = 2 * 60 * 1000; // 2 minutes

type CacheEntry<T> = { pending?: Promise<T>; value?: T; ts: number };

export type DecomposeResult =
  | { success: true; sublemmas: Sublemma[] }
  | { success: false; error: string };

export type GraphActionResult =
  | ({ success: true } & GenerateProofGraphOutput)
  | { success: false; error: string };

// Decompose and Graph caches (dev-only)
const decomposeCache: Map<string, CacheEntry<DecomposeResult>> = new Map();

const graphCache: Map<string, CacheEntry<GraphActionResult>> = new Map();

function hashPayload(payload: unknown): string {
  try {
    return createHash('sha1').update(JSON.stringify(payload)).digest('hex').slice(0, 8);
  } catch {
    return 'na';
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
        const errorMessage = error instanceof Error ? error.message : String(error);
        const result = {
          success: false as const,
          error: `Failed to decompose the problem with AI: ${errorMessage}`,
        };
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
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false as const,
      error: `Failed to decompose the problem with AI: ${errorMessage}`,
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
    return { success: true, ...result };
  } catch (error) {
    logError('validateStatement', reqId, hash, error);
    return {
      success: false,
      error: 'Failed to validate the statement with AI.',
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
    return { success: true as const, ...result };
  } catch (error) {
    logError('validateProof', reqId, hash, error);
    return { success: false as const, error: 'Failed to validate the proof with AI.' };
  }
}

export async function generateProofGraphAction(proofSteps: Sublemma[]): Promise<GraphActionResult> {
  const { reqId, hash } = logStart('generateProofGraph', { steps: proofSteps?.length });
  if (proofSteps.length === 0) {
    return {
      success: false,
      error: 'There are no proof steps to generate a graph from.',
    };
  }

  // Normalize to satisfy SublemmaSchema (some upstream steps may only have { title, content })
  const normalizedSteps: Sublemma[] = proofSteps.map((s: any) => ({
    title: s?.title ?? '',
    statement: s?.statement ?? s?.content ?? '',
    proof: s?.proof ?? s?.content ?? '',
  }));

  if (isDev) {
    const now = Date.now();
    const key = hashPayload(normalizedSteps);

    const existing = graphCache.get(key);
    if (existing?.pending) {
      console.info(`[SA][generateProofGraph] dedupe pending reqId=${reqId} hash=${hash}`);
      return existing.pending;
    }
    if (existing?.value && now - existing.ts < IDEMPOTENCY_TTL_MS) {
      console.info(`[SA][generateProofGraph] cache hit reqId=${reqId} hash=${hash}`);
      return existing.value;
    }

    const pending = (async () => {
      try {
        const result = await generateProofGraph({ proofSteps: normalizedSteps });
        const out = { success: true as const, ...result };
        logSuccess('generateProofGraph', reqId, hash);
        graphCache.set(key, { value: out, ts: Date.now() });
        return out;
      } catch (error) {
        logError('generateProofGraph', reqId, hash, error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        const out = {
          success: false as const,
          error: `Failed to generate proof graph with AI: ${errorMessage}`,
        };
        graphCache.delete(key);
        return out;
      }
    })();

    graphCache.set(key, { pending, ts: now });
    return pending;
  }

  // Production: normal execution
  try {
    const result = await generateProofGraph({ proofSteps: normalizedSteps });
    logSuccess('generateProofGraph', reqId, hash);
    return { success: true as const, ...result };
  } catch (error) {
    logError('generateProofGraph', reqId, hash, error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false as const,
      error: `Failed to generate proof graph with AI: ${errorMessage}`,
    };
  }
}
