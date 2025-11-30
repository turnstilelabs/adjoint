import { NextRequest } from 'next/server';
import { ai, llmModel, llmId } from '@/ai/genkit';
import { classifyProofDraft } from '@/ai/flows/classify-proof-draft';
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
                keepalive = setInterval(() => {
                    try { write(sseComment('keepalive')); } catch { }
                }, 15000);

                const provider = (llmId.split('/')?.[0]) || 'unknown';
                const model = llmModel;
                write(sseEvent('model.start', { provider, model, ts: Date.now() }));

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
                        const t = chunk && typeof chunk.text === 'string' ? chunk.text : '';
                        if (t) {
                            fullDraft += t;
                            write(sseEvent('model.delta', { text: t }));
                        }
                        if ((req as any).signal?.aborted) break;
                    }

                    const finalResp: any = await response;
                    if (!fullDraft && finalResp?.text) {
                        fullDraft = finalResp.text;
                    }
                } catch (e: any) {
                    write(sseEvent('server-error', { success: false, error: e?.message || 'Streaming failed.' }));
                    close();
                    return;
                }

                const durationMs = Date.now() - t0;
                write(sseEvent('model.end', { durationMs, length: fullDraft.length }));

                // Classification
                write(sseEvent('classify.start', { ts: Date.now() }));
                let attempt: any;
                try {
                    const result = await classifyProofDraft({ problem, rawProof: fullDraft });
                    attempt = { ...result, rawProof: fullDraft };
                    write(sseEvent('classify.result', result));
                } catch (e: any) {
                    write(sseEvent('server-error', { success: false, error: 'Failed to classify draft.' }));
                    write(sseEvent('done', { success: true, attempt: { status: 'FAILED', finalStatement: null, variantType: null, rawProof: fullDraft, explanation: 'Failed to classify drafted proof.' }, decompose: null }));
                    close();
                    return;
                }

                // If failed, end early without decomposition
                if (attempt.status === 'FAILED') {
                    write(sseEvent('done', { success: true, attempt, decompose: null }));
                    close();
                    return;
                }

                // Decomposition
                write(sseEvent('decompose.start', { ts: Date.now() }));
                let decomp: DecomposeRawProofOutput | null = null;
                try {
                    decomp = await decomposeRawProof({ rawProof: fullDraft });
                    write(sseEvent('decompose.result', { sublemmasCount: decomp.sublemmas?.length ?? 0, provedLen: decomp.provedStatement?.length ?? 0, normLen: decomp.normalizedProof?.length ?? 0 }));
                } catch (e) {
                    write(sseEvent('server-error', { success: false, error: 'Failed to decompose drafted proof.' }));
                }

                write(sseEvent('done', { success: true, attempt, decompose: decomp }));
                close();
            } catch (e: any) {
                try { write(sseEvent('server-error', { success: false, error: e?.message || 'Unexpected error in attempt-stream.' })); } catch { }
                error(e);
            }
        },
        cancel: () => {
            if (keepalive) clearInterval(keepalive);
        },
    });

    req.signal.addEventListener('abort', () => { if (keepalive) clearInterval(keepalive); });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
        },
    });
}
