import { ai, llmModel, llmId } from '@/ai/genkit';
import { z } from 'genkit';
import { classifyProofDraft, ClassifyProofDraftOutputSchema } from './classify-proof-draft';
import { decomposeRawProof } from './decompose-raw-proof';
import { SublemmaSchema } from './schemas';

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

    onChunk({ type: 'model.start', provider, model, ts: Date.now() });

    const t0 = Date.now();
    let fullDraft = '';

    try {
        const system =
            'You are a rigorous mathematician. Produce a complete, self-contained proof. If the original statement is not provable as posed, write a correct proof for the closest provable variant instead. Write narrative paragraphs; LaTeX allowed.';
        const user = `Prove the following statement or the closest provable variant, writing a rigorous proof.\n\n"${problem}"`;

        const { stream, response } = ai.generateStream({
            system,
            prompt: user,
        });

        for await (const chunk of (stream as any)) {
            if (shouldAbort()) break;
            const t = chunk && typeof chunk.text === 'string' ? chunk.text : '';
            if (t) {
                fullDraft += t;
                onChunk({ type: 'model.delta', text: t });
            }
        }

        const finalResp: any = await response;
        if (!fullDraft && finalResp?.text) {
            fullDraft = finalResp.text;
        }
    } catch (e: any) {
        onChunk({
            type: 'server-error',
            error: e?.message || 'Streaming failed.',
        });
        // Return minimal failure outcome; caller can decide how to surface.
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

    const durationMs = Date.now() - t0;
    onChunk({ type: 'model.end', durationMs, length: fullDraft.length });

    // Classification phase
    onChunk({ type: 'classify.start', ts: Date.now() });
    let attempt: AttemptSummary;
    try {
        const result = await classifyProofDraft({ problem, rawProof: fullDraft });
        onChunk({ type: 'classify.result', result });
        attempt = { ...result, rawProof: fullDraft || null };
    } catch (e: any) {
        onChunk({
            type: 'server-error',
            error: 'Failed to classify draft.',
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
        onChunk({
            type: 'server-error',
            error: 'Failed to decompose drafted proof.',
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
