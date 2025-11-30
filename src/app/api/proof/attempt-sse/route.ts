import { NextRequest } from 'next/server';
import { attemptProof, type AttemptProofOutput } from '@/ai/flows/attempt-proof';
import { decomposeRawProof, type DecomposeRawProofOutput } from '@/ai/flows/decompose-raw-proof';

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
                // Initial headers are already set by returning Response below
                // Heartbeat every 15s to keep connection alive
                keepalive = setInterval(() => {
                    try {
                        write(sseComment('keepalive'));
                    } catch (_) {
                        // no-op
                    }
                }, 15000);

                // STREAM: attempt start
                write(sseEvent('progress', { phase: 'attempt.start', ts: Date.now() }));

                // Perform attempt
                const attempt: AttemptProofOutput = await attemptProof({ problem });

                write(
                    sseEvent('attempt', {
                        success: true,
                        status: attempt.status,
                        finalStatement: attempt.finalStatement,
                        variantType: attempt.variantType,
                        rawProofLen: attempt.rawProof?.length ?? 0,
                        explanation: attempt.explanation,
                    })
                );

                if (attempt.status === 'FAILED') {
                    // Finish early, no decomposition
                    write(
                        sseEvent('done', {
                            success: true,
                            attempt,
                            decompose: null,
                        })
                    );
                    close();
                    return;
                }

                // STREAM: decompose start
                write(sseEvent('progress', { phase: 'decompose.start', ts: Date.now() }));

                let decomp: DecomposeRawProofOutput | null = null;
                try {
                    decomp = await decomposeRawProof({ rawProof: attempt.rawProof || '' });
                    write(
                        sseEvent('decompose', {
                            success: true,
                            sublemmasCount: decomp.sublemmas?.length ?? 0,
                            provedLen: decomp.provedStatement?.length ?? 0,
                            normLen: decomp.normalizedProof?.length ?? 0,
                        })
                    );
                } catch (e) {
                    // Decomposition failed, emit error event but still include attempt in done
                    write(
                        sseEvent('server-error', {
                            success: false,
                            error: 'Failed to decompose raw proof.',
                        })
                    );
                }

                write(
                    sseEvent('done', {
                        success: true,
                        attempt,
                        decompose: decomp,
                    })
                );
                close();
            } catch (e: any) {
                try {
                    write(
                        sseEvent('server-error', {
                            success: false,
                            error: e?.message || 'Unexpected error in proof attempt.',
                        })
                    );
                } catch (_) {
                    // ignore
                }
                error(e);
            }
        },
        cancel: () => {
            if (keepalive) clearInterval(keepalive);
        },
    });

    // If client cancels, abort stream
    const abort = (reason?: any) => {
        if (keepalive) clearInterval(keepalive);
    };
    req.signal.addEventListener('abort', abort);

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            // Make sure proxies don’t buffer
            'X-Accel-Buffering': 'no',
        },
    });
}
