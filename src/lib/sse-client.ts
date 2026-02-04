/**
 * Minimal Server-Sent Events (SSE) parser for streaming `fetch()` responses.
 *
 * Motivation:
 * - EventSource only supports GET and cannot send a request body.
 * - For large payloads we use POST and stream a `text/event-stream` response.
 *
 * This helper reads `response.body` and calls `onEvent` for each parsed SSE event.
 */

export type SSEEvent = {
    event: string;
    data: string;
};

export async function consumeSSEStream(
    res: Response,
    onEvent: (ev: SSEEvent) => void,
    opts?: { signal?: AbortSignal },
): Promise<void> {
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `SSE request failed (status ${res.status})`);
    }

    const body = res.body;
    if (!body) throw new Error('Missing response body for SSE stream.');

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const pump = async (): Promise<void> => {
        while (true) {
            if (opts?.signal?.aborted) {
                try {
                    await reader.cancel();
                } catch {
                    // ignore
                }
                return;
            }

            const { value, done } = await reader.read();
            if (done) return;

            // Normalize CRLF -> LF so we can parse across platforms/proxies.
            buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');

            // SSE messages are separated by a blank line.
            // Process as many complete events as we have.
            while (true) {
                const idx = buffer.indexOf('\n\n');
                if (idx < 0) break;
                const raw = buffer.slice(0, idx);
                buffer = buffer.slice(idx + 2);

                // Ignore comments / keepalives
                if (raw.startsWith(':')) continue;

                let event = 'message';
                let data = '';

                for (const line of raw.split('\n')) {
                    if (line.startsWith('event:')) {
                        event = line.slice('event:'.length).trim() || event;
                    } else if (line.startsWith('data:')) {
                        const d = line.slice('data:'.length).trim();
                        data += (data ? '\n' : '') + d;
                    }
                }

                onEvent({ event, data });
            }
        }
    };

    await pump();
}
