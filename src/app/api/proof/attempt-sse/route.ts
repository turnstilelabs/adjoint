import { NextRequest } from 'next/server';
import { appRoute } from '@genkit-ai/next';
import {
    attemptProofCompositeOrchestrator,
    attemptProofCompositeFlow,
} from '@/ai/flows/attempt-proof-composite';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function sseEvent(name: string, data?: unknown) {
    const payload = data !== undefined ? `data: ${JSON.stringify(data)}\n` : '';
    return `event: ${name}\n${payload}\n`;
}

function sseComment(comment: string) {
    return `:${comment}\n\n`;
}

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const problem = searchParams.get('problem')?.toString() ?? '';

    if (!problem.trim()) {
        return new Response('Missing problem', { status: 400 });
    }

    const encoder = new TextEncoder();
    let keepalive: ReturnType<typeof setInterval> | undefined;

    const stream = new ReadableStream<Uint8Array>({
        start: async (controller) => {
            const write = (chunk: string) => controller.enqueue(encoder.encode(chunk));
            const close = () => controller.close();
            const error = (e: unknown) => controller.error(e);

            try {
                keepalive = setInterval(() => {
                    try {
                        write(sseComment('keepalive'));
                    } catch {
                        // no-op
                    }
                }, 15000);

                // STREAM: attempt start (progress)
                // Orchestrate using Genkit-based composite flow, mapping typed chunks back to SSE events.
                const { attempt, decompose } = await attemptProofCompositeOrchestrator(
                    { problem },
                    {
                        onChunk: (chunk) => {
                            switch (chunk.type) {
                                case 'progress': {
                                    write(
                                        sseEvent('progress', {
                                            phase: chunk.phase,
                                            ts: chunk.ts,
                                        }),
                                    );
                                    break;
                                }
                                case 'attempt': {
                                    write(
                                        sseEvent('attempt', {
                                            success: chunk.payload.success,
                                            status: chunk.payload.status,
                                            finalStatement: chunk.payload.finalStatement,
                                            variantType: chunk.payload.variantType,
                                            rawProofLen: chunk.payload.rawProofLen,
                                            explanation: chunk.payload.explanation,
                                        }),
                                    );
                                    break;
                                }
                                case 'decompose': {
                                    write(
                                        sseEvent('decompose', {
                                            success: chunk.payload.success,
                                            sublemmasCount: chunk.payload.sublemmasCount,
                                            provedLen: chunk.payload.provedLen,
                                            normLen: chunk.payload.normLen,
                                        }),
                                    );
                                    break;
                                }
                                case 'server-error': {
                                    write(
                                        sseEvent('server-error', {
                                            success: false,
                                            error: chunk.error,
                                            detail: (chunk as any).detail,
                                            code: (chunk as any).code,
                                        }),
                                    );
                                    break;
                                }
                            }
                        },
                    },
                );

                write(
                    sseEvent('done', {
                        success: true,
                        attempt,
                        decompose,
                    }),
                );
                close();
            } catch (e: any) {
                try {
                    write(
                        sseEvent('server-error', {
                            success: false,
                            error: e?.message || 'Unexpected error in proof attempt.',
                        }),
                    );
                } catch {
                    // ignore
                }
                error(e);
            }
        },
        cancel: () => {
            if (keepalive) clearInterval(keepalive);
        },
    });

    req.signal.addEventListener('abort', () => {
        if (keepalive) clearInterval(keepalive);
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
        },
    });
}

export const POST = appRoute(attemptProofCompositeFlow);
