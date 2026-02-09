import { NextRequest } from 'next/server';
import { appRoute } from '@genkit-ai/next';
import {
  attemptProofStreamOrchestrator,
  attemptProofStreamFlow,
  type AttemptProofStreamChunk,
} from '@/ai/flows/attempt-proof-stream';
import { getLlmContextFromRequest, runWithLlmContext } from '@/ai/llm-context';
import { quietAppRoute } from '@/app/api/_utils/quiet-app-route';
import { getLlmApiKey, getLlmId, getLlmProvider } from '@/ai/genkit';

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
  const ctx = getLlmContextFromRequest(req);
  return runWithLlmContext(ctx, async () => {
    try {
      const provider = getLlmProvider();
      const model = getLlmId();
      const hasKey = Boolean(getLlmApiKey());
      console.info(`[AI][req] source=proof.attempt-stream.get provider=${provider} model=${model} hasKey=${hasKey}`);
    } catch { }
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
              // ignore
            }
          }, 15000);

          let sawModelEnd = false;
          let fatalStreamError = false;

          const onChunk = (chunk: AttemptProofStreamChunk) => {
            switch (chunk.type) {
              case 'model.start':
                write(
                  sseEvent('model.start', {
                    provider: chunk.provider,
                    model: chunk.model,
                    ts: chunk.ts,
                  }),
                );
                break;
              case 'model.delta':
                write(sseEvent('model.delta', { text: chunk.text }));
                break;
              case 'model.end':
                sawModelEnd = true;
                write(
                  sseEvent('model.end', {
                    durationMs: chunk.durationMs,
                    length: chunk.length,
                  }),
                );
                break;
              case 'classify.start':
                write(sseEvent('classify.start', chunk.meta));
                break;
              case 'classify.result':
                write(sseEvent('classify.result', chunk.result));
                break;
              case 'classify.end':
                write(
                  sseEvent('classify.end', {
                    stage: chunk.stage,
                    durationMs: chunk.durationMs,
                    timedOut: chunk.timedOut,
                    ok: chunk.ok,
                    error: (chunk as any).error,
                  }),
                );
                break;
              case 'decompose.start':
                write(sseEvent('decompose.start', { ts: chunk.ts }));
                break;
              case 'decompose.result':
                write(
                  sseEvent('decompose.result', {
                    sublemmasCount: chunk.sublemmasCount,
                    provedLen: chunk.provedLen,
                    normLen: chunk.normLen,
                  }),
                );
                break;
              case 'server-error':
                // If error occurs before model.end, mirror previous behavior: do not emit "done".
                if (!sawModelEnd) fatalStreamError = true;
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
          };

          const { attempt, decompose } = await attemptProofStreamOrchestrator({ problem }, onChunk, {
            shouldAbort: () => req.signal.aborted,
          });

          if (fatalStreamError) {
            close();
            return;
          }

          write(sseEvent('done', { success: true, attempt, decompose }));
          close();
        } catch (e: any) {
          try {
            write(
              sseEvent('server-error', {
                success: false,
                error: e?.message || 'Unexpected error in attempt-stream.',
              }),
            );
          } catch { }
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
  });
}

export const POST = quietAppRoute(appRoute(attemptProofStreamFlow) as any);
