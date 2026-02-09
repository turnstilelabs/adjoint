import type { NextRequest } from 'next/server';
import { getLlmContextFromRequest, runWithLlmContext } from '@/ai/llm-context';
import { getLlmApiKey, getLlmId, getLlmProvider } from '@/ai/genkit';

/**
 * Wraps a Genkit `appRoute(flow)` handler to suppress noisy abort errors.
 *
 * When the client clicks “Stop generating”, the browser aborts the HTTP request.
 * Next/Genkit can surface this as `ResponseAborted` / `AbortError` and sometimes
 * it appears as an `unhandledRejection` log in dev.
 *
 * Aborts are expected user actions, so we convert them into a quiet response.
 */
export function quietAppRoute<THandler extends (req: NextRequest, ...rest: any[]) => any>(
    handler: THandler,
): THandler {
    return (async (req: NextRequest, ...rest: any[]) => {
        const ctx = getLlmContextFromRequest(req);
        return runWithLlmContext(ctx, async () => {
            try {
                const provider = getLlmProvider();
                const model = getLlmId();
                const hasKey = Boolean(getLlmApiKey());
                console.info(`[AI][req] source=appRoute provider=${provider} model=${model} hasKey=${hasKey}`);
            } catch { }
            try {
                return await handler(req, ...(rest as any[]));
            } catch (e: any) {
                const msg = String(e?.message || e || '');
                const name = String(e?.name || '');
                const aborted =
                    req?.signal?.aborted ||
                    name === 'AbortError' ||
                    msg.includes('ResponseAborted') ||
                    msg.includes('aborted') ||
                    msg.includes('socket hang up');

                if (aborted) {
                    // 499 is commonly used by proxies for “Client Closed Request”.
                    // It's not a standard HTTP status code, but it keeps logs clean.
                    return new Response(null, { status: 499 }) as any;
                }

                throw e;
            }
        });
    }) as any;
}
