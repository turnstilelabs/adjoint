import { ai, llmModel, llmId } from '@/ai/genkit';
import { z } from 'genkit';
import { classifyProofDraft, ClassifyProofDraftOutputSchema } from './classify-proof-draft';
import { decomposeRawProof } from './decompose-raw-proof';
import { SublemmaSchema } from './schemas';
import { normalizeModelError } from '@/lib/model-error-core';
import { env } from '@/env';

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
        ts: z.number(),
    }),
    z.object({
        type: z.literal('classify.result'),
        result: ClassifyProofDraftOutputSchema,
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
    const model = llmModel;

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

    // Classification phase
    onChunk({ type: 'classify.start', ts: Date.now() });
    let attempt: AttemptSummary;
    try {
        const result = await classifyProofDraft({ problem, rawProof: fullDraft });
        onChunk({ type: 'classify.result', result });
        attempt = { ...result, rawProof: fullDraft || null };
    } catch (e: any) {
        const norm = normalizeModelError(e);
        onChunk({
            type: 'server-error',
            error: 'Failed to classify draft.',
            detail: norm.detail,
            code: norm.code || undefined,
        });
        return {
            attempt: {
                status: 'FAILED',
                finalStatement: null,
                variantType: null,
                rawProof: fullDraft || null,
                explanation: 'Failed to classify drafted proof.',
            },
            decompose: null,
        };
    }

    if (attempt.status === 'FAILED') {
        return { attempt, decompose: null };
    }

    // Decomposition phase
    onChunk({ type: 'decompose.start', ts: Date.now() });
    let decomp: DecomposeRawProofOutput | null = null;
    try {
        decomp = await decomposeRawProof({ rawProof: fullDraft });
        onChunk({
            type: 'decompose.result',
            sublemmasCount: decomp.sublemmas?.length ?? 0,
            provedLen: decomp.provedStatement?.length ?? 0,
            normLen: decomp.normalizedProof?.length ?? 0,
        });
    } catch (e: any) {
        const norm = normalizeModelError(e);
        onChunk({
            type: 'server-error',
            error: 'Failed to decompose drafted proof.',
            detail: norm.detail,
            code: norm.code || undefined,
        });
    }

    return { attempt, decompose: decomp };
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
