import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { attemptProof, type AttemptProofOutput } from './attempt-proof';
import { decomposeRawProof, type DecomposeRawProofOutput } from './decompose-raw-proof';
import { SublemmaSchema } from './schemas';
import { normalizeModelError } from '@/lib/model-error-core';

/**
 * Composite flow for the "attempt-sse" endpoint behavior:
 * - Runs attemptProof (non-streaming)
 * - If success, runs decomposeRawProof
 * - Streams progress/attempt/decompose events when used via appRoute(streamFlow)
 * - Returns final { attempt, decompose } output
 */

/** Input */
export const AttemptCompositeInputSchema = z.object({
    problem: z.string().describe('The original statement the user asked to prove.'),
});
export type AttemptCompositeInput = z.infer<typeof AttemptCompositeInputSchema>;

/** Output */
export const AttemptCompositeOutputSchema = z.object({
    attempt: z.object({
        status: z.enum(['PROVED_AS_IS', 'PROVED_VARIANT', 'FAILED']),
        finalStatement: z.string().nullable(),
        variantType: z.enum(['WEAKENING', 'OPPOSITE']).nullable(),
        rawProof: z.string().nullable(),
        explanation: z.string(),
    }),
    decompose: z
        .object({
            provedStatement: z.string(),
            sublemmas: z.array(SublemmaSchema),
            normalizedProof: z.string(),
        })
        .nullable(),
});
export type AttemptCompositeOutput = z.infer<typeof AttemptCompositeOutputSchema>;

/** Streamed chunk variants emitted during the composite flow */
export const AttemptCompositeChunkSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('progress'),
        phase: z.enum(['attempt.start', 'decompose.start']),
        ts: z.number(),
    }),
    z.object({
        type: z.literal('attempt'),
        payload: z.object({
            success: z.boolean(),
            status: z.enum(['PROVED_AS_IS', 'PROVED_VARIANT', 'FAILED']),
            finalStatement: z.string().nullable(),
            variantType: z.enum(['WEAKENING', 'OPPOSITE']).nullable(),
            rawProofLen: z.number(),
            explanation: z.string(),
        }),
    }),
    z.object({
        type: z.literal('decompose'),
        payload: z.object({
            success: z.boolean(),
            sublemmasCount: z.number(),
            provedLen: z.number(),
            normLen: z.number(),
        }),
    }),
    z.object({
        type: z.literal('server-error'),
        error: z.string(),
        detail: z.string().optional(),
        code: z.string().optional(),
    }),
]);
export type AttemptCompositeChunk = z.infer<typeof AttemptCompositeChunkSchema>;

type CompositeOrchestratorOptions = {
    onChunk?: (c: AttemptCompositeChunk) => void;
};

/**
 * Orchestrator used by both GET SSE adapter and the Genkit flow.
 * Emits typed chunks via onChunk and returns the final output.
 */
export async function attemptProofCompositeOrchestrator(
    { problem }: AttemptCompositeInput,
    opts?: CompositeOrchestratorOptions
): Promise<AttemptCompositeOutput> {
    const onChunk = opts?.onChunk ?? (() => { });

    // STREAM: attempt start
    onChunk({ type: 'progress', phase: 'attempt.start', ts: Date.now() });

    // Perform attempt
    let attempt: AttemptProofOutput;
    try {
        attempt = await attemptProof({ problem });
    } catch (e: any) {
        const norm = normalizeModelError(e);
        onChunk({ type: 'server-error', error: norm.message || 'Unexpected error during attempt.', detail: norm.detail, code: norm.code || undefined });
        // Mirror the route's behavior: FAILED result when classification/attempt fails
        return {
            attempt: {
                status: 'FAILED',
                finalStatement: null,
                variantType: null,
                rawProof: null,
                explanation: 'Attempt step failed unexpectedly.',
            },
            decompose: null,
        };
    }

    onChunk({
        type: 'attempt',
        payload: {
            success: true,
            status: attempt.status,
            finalStatement: attempt.finalStatement,
            variantType: attempt.variantType,
            rawProofLen: attempt.rawProof?.length ?? 0,
            explanation: attempt.explanation,
        },
    });

    if (attempt.status === 'FAILED') {
        return { attempt, decompose: null };
    }

    // STREAM: decompose start
    onChunk({ type: 'progress', phase: 'decompose.start', ts: Date.now() });

    let decomp: DecomposeRawProofOutput | null = null;
    try {
        decomp = await decomposeRawProof({ rawProof: attempt.rawProof || '' });
        onChunk({
            type: 'decompose',
            payload: {
                success: true,
                sublemmasCount: decomp.sublemmas?.length ?? 0,
                provedLen: decomp.provedStatement?.length ?? 0,
                normLen: decomp.normalizedProof?.length ?? 0,
            },
        });
    } catch (e: any) {
        const norm = normalizeModelError(e);
        onChunk({
            type: 'server-error',
            error: 'Failed to decompose raw proof.',
            detail: norm.detail,
            code: norm.code || undefined,
        });
    }

    return { attempt, decompose: decomp };
}

/**
 * Genkit flow exposing the same composite behavior with minimal stream chunks.
 */
export const attemptProofCompositeFlow = ai.defineFlow(
    {
        name: 'attemptProofCompositeFlow',
        inputSchema: AttemptCompositeInputSchema,
        outputSchema: AttemptCompositeOutputSchema,
        streamSchema: AttemptCompositeChunkSchema,
    },
    async ({ problem }, { sendChunk }) => {
        const { attempt, decompose } = await attemptProofCompositeOrchestrator(
            { problem },
            { onChunk: (c) => sendChunk(c) }
        );
        return { attempt, decompose };
    }
);
