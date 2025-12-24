/**
 * Server-safe core for classifying and normalizing model/provider errors.
 * No React imports here so it can be used in server flows and API routes.
 */

export type ModelErrorCode =
    | 'MODEL_TIMEOUT'
    | 'MODEL_RATE_LIMIT'
    | 'MODEL_STREAM_INTERRUPTED'
    | 'MODEL_OUTPUT_UNPARSABLE'
    | 'CONTEXT_WINDOW_EXCEEDED'
    | 'MODEL_AUTH_INVALID';

const FRIENDLY_MESSAGES: Record<ModelErrorCode, string> = {
    MODEL_TIMEOUT:
        'The model request timed out. Please try again.',
    MODEL_RATE_LIMIT:
        'The model is at capacity. Please try again in a moment.',
    MODEL_STREAM_INTERRUPTED:
        'The streaming connection was interrupted. Please try again.',
    MODEL_OUTPUT_UNPARSABLE:
        'The model’s reply could not be parsed. Please retry.',
    CONTEXT_WINDOW_EXCEEDED:
        'This step exceeds the model’s context window. Please simplify or split the argument.',
    MODEL_AUTH_INVALID:
        'Model credentials are invalid or missing. Please check your API key and try again.',
};

export function getFriendlyMessage(code: ModelErrorCode): string {
    return FRIENDLY_MESSAGES[code];
}

/**
 * Core classifier that maps raw provider/network/server messages into a ModelErrorCode.
 * Accepts raw Error objects, HTTP-like error responses, or plain strings.
 */
export function classifyModelCommErrorCore(errLike: unknown): ModelErrorCode | null {
    try {
        let msg = '';
        let status: number | undefined;
        let code: string | number | undefined;

        if (typeof errLike === 'string') {
            msg = errLike;
        } else if (errLike && typeof errLike === 'object') {
            const e: any = errLike as any;
            code = e.code;
            status =
                typeof e.status === 'number'
                    ? e.status
                    : typeof e.statusCode === 'number'
                        ? e.statusCode
                        : undefined;
            if (typeof e.message === 'string') msg = e.message;
            else if (typeof e.error === 'string') msg = e.error;
            else if (typeof e.toString === 'function') msg = String(e);
        }

        const text = (msg || '').toLowerCase();

        // Auth / invalid or missing API key
        if (
            status === 401 ||
            status === 403 ||
            /api key not valid|invalid api key|incorrect api key|no api key provided|api_key_invalid|unauthorized|forbidden/.test(
                text,
            )
        ) {
            return 'MODEL_AUTH_INVALID';
        }

        // Context window exceeded
        if (
            status === 413 ||
            /context window|context length|maximum context|too many tokens|max tokens|token limit|context_length_exceeded/.test(
                text,
            )
        ) {
            return 'CONTEXT_WINDOW_EXCEEDED';
        }

        // Rate limit / capacity
        if (status === 429 || /rate limit|too many requests|overloaded|at capacity|capacity|retry after/.test(text)) {
            return 'MODEL_RATE_LIMIT';
        }

        // Timeout / aborted
        if (
            status === 408 ||
            code === 'ETIMEDOUT' ||
            code === 'ECONNABORTED' ||
            /timeout|timed out|aborterror|aborted|took too long|deadline exceeded/.test(text)
        ) {
            return 'MODEL_TIMEOUT';
        }

        // Stream interrupted / network reset / fetch failed
        if (
            /stream|sse|eventsource|connection reset|network error|failed to fetch|body stream|readable stream|broken pipe|socket hang up/.test(
                text,
            )
        ) {
            return 'MODEL_STREAM_INTERRUPTED';
        }

        // Unparsable JSON / malformed structured output
        if (
            /json|parse|malformed|not valid json|no json object|structured output missing|unexpected token/.test(text) ||
            /model output was not valid json/.test(text) ||
            /openai structured output.*failed/.test(text)
        ) {
            return 'MODEL_OUTPUT_UNPARSABLE';
        }

        return null;
    } catch {
        return null;
    }
}

export function normalizeModelError(errLike: unknown): {
    code: ModelErrorCode | null;
    message: string;
    detail?: string;
} {
    const code = classifyModelCommErrorCore(errLike);
    const message = code
        ? getFriendlyMessage(code)
        : 'Adjoint could not contact the model. Please try again.';
    let detail: string | undefined;
    try {
        if (typeof errLike === 'string') detail = errLike;
        else if (errLike && typeof errLike === 'object') {
            const e: any = errLike as any;
            detail = e?.message ? String(e.message) : String(errLike);
        }
    } catch {
        // ignore
    }
    return { code, message, detail };
}
