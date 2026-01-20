import { NextRequest } from 'next/server';
import {
  reviewArtifactSoundnessStreamOrchestrator,
  type ReviewArtifactStreamChunk,
} from '@/ai/flows/review-artifact-soundness-stream';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function sseEvent(name: string, data?: unknown) {
  const payload = data !== undefined ? `data: ${JSON.stringify(data)}\n` : '';
  return `event: ${name}\n${payload}\n`;
}
function sseComment(comment: string) {
  return `:${comment}\n\n`;
}

/**
 * POST SSE endpoint for streaming artifact review.
 *
 * Mirrors the proof attempt-stream pattern:
 * - emits model.delta token chunks
 * - emits done with the final validated JSON output
 */
export async function POST(req: NextRequest) {
  const input = await req.json().catch(() => null);
  if (!input) return new Response('Missing JSON body', { status: 400 });

  const encoder = new TextEncoder();
  let keepalive: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start: async (controller) => {
      const write = (chunk: string) => controller.enqueue(encoder.encode(chunk));
      const close = () => controller.close();

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

        const onChunk = (chunk: ReviewArtifactStreamChunk) => {
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
            case 'server-error':
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

        const out = await reviewArtifactSoundnessStreamOrchestrator(input, onChunk, {
          shouldAbort: () => req.signal.aborted,
        });

        if (fatalStreamError) {
          close();
          return;
        }

        write(sseEvent('done', { success: true, ...out }));
        close();
      } catch (e: any) {
        try {
          write(
            sseEvent('server-error', {
              success: false,
              error: e?.message || 'Unexpected error in review-artifact-stream.',
            }),
          );
        } catch {}
        controller.error(e);
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
