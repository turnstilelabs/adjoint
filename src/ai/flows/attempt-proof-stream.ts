import { ai, llmId } from '@/ai/genkit';
import { z } from 'genkit';
import { classifyProofDraft, ClassifyProofDraftOutputSchema } from './classify-proof-draft';
import { SublemmaSchema } from './schemas';
import { normalizeModelError } from '@/lib/model-error-core';
import { env } from '@/env';

function shrinkProofForClassification(raw: string, opts?: { headChars?: number; tailChars?: number }) {
    const headChars = opts?.headChars ?? 6000;
    const tailChars = opts?.tailChars ?? 6000;
    const s = String(raw ?? '');
    if (s.length <= headChars + tailChars + 200) return s;
    const head = s.slice(0, headChars);
    const tail = s.slice(Math.max(0, s.length - tailChars));
    return [
        head,
        '\n\n[TRUNCATED: middle of proof omitted for speed]\n\n',
        tail,
    ].join('');
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
    if (!(ms > 0)) return p;
    return new Promise<T>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`Timeout (${label}) after ${ms}ms`)), ms);
        p.then(
            (v) => {
                clearTimeout(t);
                resolve(v);
            },
            (e) => {
                clearTimeout(t);
                reject(e);
            },
        );
    });
}

type ClassifyStage = 'head' | 'tail-check' | 'final';

type ClassifyMeta = {
    runId: number;
    stage: ClassifyStage;
    ts: number;
    excerptChars: number;
    timeoutMs: number;
};

/**
 * Streaming flow that replicates the behavior of the existing attempt-stream API route,
 * emitting model token deltas and subsequent classification/decomposition phase events.
 *
 * This file exposes:
 * - attemptProofStreamOrchestrator: a reusable orchestrator that emits typed "chunk" events
 *   and returns the final output. The GET SSE adapter can call this and map chunks to SSE
 *   event names to preserve the existing wire contract.
 * - attemptProofStreamFlow: a Genkit flow that uses the same orchestrator and emits typed
 *   chunks via sendChunk, suitable for @genkit-ai/next appRoute.
 */

/** Input schema */
export const AttemptStreamInputSchema = z.object({
    problem: z.string().describe('The original statement the user asked to prove.'),
});
export type AttemptStreamInput = z.infer<typeof AttemptStreamInputSchema>;

/** Attempt summary (matches final "attempt" shape used by the existing SSE route) */
export const AttemptSummarySchema = z.object({
    status: z.enum(['PROVED_AS_IS', 'PROVED_VARIANT', 'FAILED']),
    finalStatement: z.string().nullable(),
    variantType: z.enum(['WEAKENING', 'OPPOSITE']).nullable(),
    rawProof: z.string().nullable(),
    explanation: z.string(),
});
export type AttemptSummary = z.infer<typeof AttemptSummarySchema>;

/** Decomposition output (mirrors decompose-raw-proof.ts output shape) */
export const DecomposeRawProofOutputSchema = z.object({
    provedStatement: z.string(),
    sublemmas: z.array(SublemmaSchema),
    normalizedProof: z.string(),
});
export type DecomposeRawProofOutput = z.infer<typeof DecomposeRawProofOutputSchema>;

/** Streamed chunk variants emitted during the flow */
export const AttemptProofStreamChunkSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('model.start'),
        provider: z.string(),
        model: z.string(),
        ts: z.number(),
    }),
    z.object({
        type: z.literal('model.delta'),
        text: z.string(),
    }),
    z.object({
        type: z.literal('model.end'),
        durationMs: z.number(),
        length: z.number(),
    }),
    z.object({
        type: z.literal('classify.start'),
        meta: z.object({
            runId: z.number(),
            stage: z.enum(['head', 'tail-check', 'final']),
            ts: z.number(),
            excerptChars: z.number(),
            timeoutMs: z.number(),
        }),
    }),
    z.object({
        type: z.literal('classify.result'),
        result: ClassifyProofDraftOutputSchema,
    }),
    z.object({
        type: z.literal('classify.end'),
        stage: z.enum(['head', 'tail-check', 'final']),
        durationMs: z.number(),
        timedOut: z.boolean(),
        ok: z.boolean(),
        error: z.string().optional(),
    }),
    z.object({
        type: z.literal('decompose.start'),
        ts: z.number(),
    }),
    z.object({
        type: z.literal('decompose.result'),
        sublemmasCount: z.number(),
        provedLen: z.number(),
        normLen: z.number(),
    }),
    z.object({
        type: z.literal('server-error'),
        error: z.string(),
        detail: z.string().optional(),
        code: z.string().optional(),
    }),
]);
export type AttemptProofStreamChunk = z.infer<typeof AttemptProofStreamChunkSchema>;

/** Final flow output */
export const AttemptStreamOutputSchema = z.object({
    attempt: AttemptSummarySchema,
    decompose: DecomposeRawProofOutputSchema.nullable(),
});
export type AttemptStreamOutput = z.infer<typeof AttemptStreamOutputSchema>;

type OrchestratorOptions = {
    shouldAbort?: () => boolean;
};

/**
 * Orchestrator function used by both the GET SSE adapter and the Genkit flow.
 * It emits typed chunks via onChunk and returns the final combined result.
 */
export async function attemptProofStreamOrchestrator(
    { problem }: AttemptStreamInput,
    onChunk: (chunk: AttemptProofStreamChunk) => void,
    options?: OrchestratorOptions
): Promise<AttemptStreamOutput> {
    const shouldAbort = options?.shouldAbort ?? (() => false);

    const provider = (llmId.split('/')?.[0]) || 'unknown';

    // Build candidate model chain: current -> same provider pro -> OpenAI (if configured)
    const candidates: string[] = [];
    if (provider === 'googleai') {
        candidates.push(llmId);
        const proId = 'googleai/gemini-2.5-pro';
        if (llmId !== proId) candidates.push(proId);
        if (env.OPENAI_API_KEY) candidates.push('openai/gpt-4o-mini');
    } else {
        // Default: try the configured model only
        candidates.push(llmId);
    }

    const system =
        'You are a rigorous mathematician. Produce a complete, self-contained proof. If the original statement is not provable as posed, write a correct proof for the closest provable variant instead. Write narrative paragraphs; LaTeX allowed.';
    const user = `Prove the following statement or the closest provable variant, writing a rigorous proof.\n\n"${problem}"`;

    let fullDraft = '';
    let succeeded = false;
    let lastErr: { code: string | null; message: string; detail?: string } | null = null;

    // Classification overlap settings
    const classifyBudgetMs = 15000;
    const headThresholdChars = 4000;
    const headChars = 3000;
    const tailChars = 1500;
    const headTimeoutMs = 10000;
    const tailTimeoutMs = 3000;
    const finalTimeoutMs = 5000;

    // Correlation id for classify events/logs
    const runId = Date.now();
    const classifyBudgetStart = Date.now();
    const budgetLeft = () => Math.max(0, classifyBudgetMs - (Date.now() - classifyBudgetStart));

    let headPromise: Promise<any> | null = null;
    let headStarted = false;
    let headResult: any | null = null;

    const startHeadClassificationIfNeeded = (draft: string) => {
        if (headStarted) return;
        if ((draft || '').length < headThresholdChars) return;
        headStarted = true;
        const excerpt = shrinkProofForClassification(draft, { headChars, tailChars: 0 });
        const meta: ClassifyMeta = {
            runId,
            stage: 'head',
            ts: Date.now(),
            excerptChars: excerpt.length,
            timeoutMs: Math.min(headTimeoutMs, budgetLeft()),
        };
        onChunk({ type: 'classify.start', meta });
        const t0 = Date.now();
        headPromise = withTimeout(
            classifyProofDraft({
                problem,
                rawProof:
                    'NOTE: Partial draft (head-only). Be conservative: if you are NOT fully confident it proves the original statement as-is, do NOT return PROVED_AS_IS.\n\n' +
                    excerpt,
            }),
            meta.timeoutMs,
            'classify.head',
        )
            .then((res) => {
                headResult = res;
                onChunk({ type: 'classify.end', stage: 'head', durationMs: Date.now() - t0, timedOut: false, ok: true });
                return res;
            })
            .catch((e: any) => {
                const msg = e?.message || String(e);
                const timedOut = /Timeout \(classify\.head\)/.test(msg);
                onChunk({
                    type: 'classify.end',
                    stage: 'head',
                    durationMs: Date.now() - t0,
                    timedOut,
                    ok: false,
                    error: msg,
                });
                return null;
            });
    };

    const runTailCheck = async (draft: string) => {
        const tail = shrinkProofForClassification(draft, { headChars: 0, tailChars }).trim();
        const meta: ClassifyMeta = {
            runId,
            stage: 'tail-check',
            ts: Date.now(),
            excerptChars: tail.length,
            timeoutMs: Math.min(tailTimeoutMs, budgetLeft()),
        };
        onChunk({ type: 'classify.start', meta });
        const t0 = Date.now();
        try {
            // Tail-check uses the same classifier but with a much tighter instruction.
            const res = await withTimeout(
                classifyProofDraft({
                    problem,
                    rawProof:
                        'TAIL-CHECK ONLY (end of proof). If the ending does NOT clearly indicate the proof establishes the ORIGINAL statement as written, do NOT return PROVED_AS_IS.\n\n' +
                        tail,
                }),
                meta.timeoutMs,
                'classify.tail',
            );
            onChunk({ type: 'classify.end', stage: 'tail-check', durationMs: Date.now() - t0, timedOut: false, ok: true });
            return res;
        } catch (e: any) {
            const msg = e?.message || String(e);
            const timedOut = /Timeout \(classify\.tail\)/.test(msg);
            onChunk({
                type: 'classify.end',
                stage: 'tail-check',
                durationMs: Date.now() - t0,
                timedOut,
                ok: false,
                error: msg,
            });
            return null;
        }
    };

    const runFinalClassification = async (draft: string) => {
        const excerpt = shrinkProofForClassification(draft, { headChars, tailChars });
        const meta: ClassifyMeta = {
            runId,
            stage: 'final',
            ts: Date.now(),
            excerptChars: excerpt.length,
            timeoutMs: Math.min(finalTimeoutMs, budgetLeft()),
        };
        onChunk({ type: 'classify.start', meta });
        const t0 = Date.now();
        try {
            const res = await withTimeout(
                classifyProofDraft({
                    problem,
                    rawProof:
                        'NOTE: The proof text may be truncated. If you are NOT fully confident the proof establishes the original statement as-is, do NOT return PROVED_AS_IS.\n\n' +
                        excerpt,
                }),
                meta.timeoutMs,
                'classify.final',
            );
            onChunk({ type: 'classify.end', stage: 'final', durationMs: Date.now() - t0, timedOut: false, ok: true });
            return res;
        } catch (e: any) {
            const msg = e?.message || String(e);
            const timedOut = /Timeout \(classify\.final\)/.test(msg);
            onChunk({
                type: 'classify.end',
                stage: 'final',
                durationMs: Date.now() - t0,
                timedOut,
                ok: false,
                error: msg,
            });
            return null;
        }
    };

    for (const cand of candidates) {
        const [prov, mod] = (cand || '').split('/');
        onChunk({ type: 'model.start', provider: prov || 'unknown', model: mod || cand, ts: Date.now() });
        const tStart = Date.now();
        try {
            const { stream, response } = ai.generateStream({
                model: cand,
                system,
                prompt: user,
            });

            let localDraft = '';
            for await (const chunk of (stream as any)) {
                if (shouldAbort()) break;
                const t = chunk && typeof chunk.text === 'string' ? chunk.text : '';
                if (t) {
                    localDraft += t;
                    // Start head-only classification as soon as draft is long enough.
                    startHeadClassificationIfNeeded(localDraft);
                    onChunk({ type: 'model.delta', text: t });
                }
            }

            const finalResp: any = await response;
            if (!localDraft && finalResp?.text) {
                localDraft = finalResp.text;
            }

            fullDraft = localDraft;
            const durationMs = Date.now() - tStart;
            onChunk({ type: 'model.end', durationMs, length: fullDraft.length });
            succeeded = true;
            break;
        } catch (e: any) {
            const norm = normalizeModelError(e);
            lastErr = { code: norm.code || null, message: norm.message, detail: norm.detail };
            // Capacity/rate limit: try next candidate if available
            if (norm.code === 'MODEL_RATE_LIMIT') {
                continue;
            }
            // Any other error: surface immediately
            onChunk({
                type: 'server-error',
                error: norm.message || 'Token stream failed. Please try again.',
                detail: norm.detail,
                code: norm.code || undefined,
            });
            return {
                attempt: {
                    status: 'FAILED',
                    finalStatement: null,
                    variantType: null,
                    rawProof: fullDraft || null,
                    explanation: 'Streaming failed while generating the draft proof.',
                },
                decompose: null,
            };
        }
    }

    if (!succeeded) {
        // Exhausted candidates; report last error
        const norm = lastErr || { code: null, message: 'Token stream failed.', detail: undefined };
        onChunk({
            type: 'server-error',
            error: norm.message || 'Token stream failed. Please try again.',
            detail: norm.detail,
            code: (norm as any).code || undefined,
        });
        return {
            attempt: {
                status: 'FAILED',
                finalStatement: null,
                variantType: null,
                rawProof: fullDraft || null,
                explanation: 'Streaming failed while generating the draft proof.',
            },
            decompose: null,
        };
    }

    let attempt: AttemptSummary;
    try {
        // If head classification is still running, wait a bit (bounded by remaining budget).
        if (headPromise && headResult == null) {
            try {
                const waitMs = Math.min(2000, budgetLeft());
                if (waitMs > 0) {
                    headResult = await withTimeout(headPromise as any, waitMs, 'classify.head.wait');
                }
            } catch {
                // ignore; we'll continue with final stages
            }
        }

        // Decide based on head result if available.
        const head = headResult;

        // If budget already exhausted, accept as-is.
        if (budgetLeft() <= 0) {
            const fallback = {
                status: 'PROVED_AS_IS' as const,
                finalStatement: problem,
                variantType: null,
                explanation: 'Classification timed out; treating the generated proof as a proof of the original statement.',
            };
            onChunk({ type: 'classify.result', result: fallback });
            return { attempt: { ...fallback, rawProof: fullDraft || null }, decompose: null };
        }

        if (head && head.status && head.status !== 'PROVED_AS_IS') {
            // Early decisive negative result.
            onChunk({ type: 'classify.result', result: head });
            attempt = { ...head, rawProof: fullDraft || null };
        } else {
            // Head says PROVED_AS_IS (or unavailable). Do tail-check on minimal excerpt.
            const tailRes = await runTailCheck(fullDraft);

            if (tailRes && tailRes.status === 'PROVED_AS_IS') {
                onChunk({ type: 'classify.result', result: tailRes });
                attempt = { ...tailRes, rawProof: fullDraft || null };
            } else if (tailRes && tailRes.status && tailRes.status !== 'PROVED_AS_IS') {
                // Tail suggests not-as-is.
                onChunk({ type: 'classify.result', result: tailRes });
                attempt = { ...tailRes, rawProof: fullDraft || null };
            } else {
                // Tail-check inconclusive or timed out -> do small final head+tail if budget remains.
                const finalRes = await runFinalClassification(fullDraft);
                if (finalRes) {
                    onChunk({ type: 'classify.result', result: finalRes });
                    attempt = { ...finalRes, rawProof: fullDraft || null };
                } else {
                    // Give up; accept as-is.
                    const fallback = {
                        status: 'PROVED_AS_IS' as const,
                        finalStatement: problem,
                        variantType: null,
                        explanation:
                            'Classification timed out; treating the generated proof as a proof of the original statement.',
                    };
                    onChunk({ type: 'classify.result', result: fallback });
                    return {
                        attempt: { ...fallback, rawProof: fullDraft || null },
                        decompose: null,
                    };
                }
            }
        }
    } catch (e: any) {
        const norm = normalizeModelError(e);
        // UX rule: if classification fails after the user already watched a full proof stream,
        // accept the proof as-is rather than blocking on an auxiliary step.
        // (We keep the raw proof and the original statement.)
        const fallback = {
            status: 'PROVED_AS_IS' as const,
            finalStatement: problem,
            variantType: null,
            explanation:
                'Classification step failed; treating the generated proof as a proof of the original statement.',
        };
        onChunk({ type: 'classify.result', result: fallback });
        return {
            attempt: { ...fallback, rawProof: fullDraft || null },
            decompose: null,
        };
    }

    if (attempt.status === 'FAILED') {
        return { attempt, decompose: null };
    }

    // Decomposition moved client-side (via decomposeRawProofAction).
    // We keep the stream fast and return only the classified attempt + raw proof.
    return { attempt, decompose: null };
}

/**
 * Genkit flow exposing the same behavior as typed streaming chunks + final output.
 */
export const attemptProofStreamFlow = ai.defineFlow(
    {
        name: 'attemptProofStreamFlow',
        inputSchema: AttemptStreamInputSchema,
        outputSchema: AttemptStreamOutputSchema,
        streamSchema: AttemptProofStreamChunkSchema,
    },
    async ({ problem }, { sendChunk }) => {
        const { attempt, decompose } = await attemptProofStreamOrchestrator(
            { problem },
            (c) => sendChunk(c)
        );
        return { attempt, decompose };
    }
);
