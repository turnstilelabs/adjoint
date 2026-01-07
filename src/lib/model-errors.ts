import React from 'react';
import { ToastAction } from '@/components/ui/toast';

// Centralized LLM-communication-focused error codes and messages

export type ModelErrorCode =
    | 'MODEL_TIMEOUT'
    | 'MODEL_RATE_LIMIT'
    | 'MODEL_STREAM_INTERRUPTED'
    | 'MODEL_OUTPUT_UNPARSABLE'
    | 'CONTEXT_WINDOW_EXCEEDED'
    | 'MODEL_AUTH_INVALID';

const MODEL_ERROR_MESSAGES: Record<ModelErrorCode, string> = {
    MODEL_TIMEOUT: 'Adjoint timed out contacting the model, please go back and try again.',
    MODEL_RATE_LIMIT:
        'The AI service is currently overloaded. Please wait a few seconds and try again.',
    MODEL_STREAM_INTERRUPTED: 'Adjoint’s connection to the model was interrupted, please go back and retry.',
    MODEL_OUTPUT_UNPARSABLE: 'The model’s reply could not be parsed reliably on Adjoint’s side, please go back or retry.',
    CONTEXT_WINDOW_EXCEEDED: 'This step exceeds the model’s context window, please go back and split the argument.',
    MODEL_AUTH_INVALID: 'Model credentials are invalid or missing. Please check your API key and try again.',
};

export function getModelErrorMessage(code: ModelErrorCode): string {
    return MODEL_ERROR_MESSAGES[code];
}

// Heuristic classifier to map provider/network/server messages to one of the 5 model error codes.
// Accepts raw Error objects, HTTP responses, or plain strings from server actions.
export function classifyModelCommError(errLike: unknown): ModelErrorCode | null {
    try {
        // Normalize to string and metadata
        let msg = '';
        let status: number | undefined;
        let code: string | number | undefined;

        if (typeof errLike === 'string') {
            msg = errLike;
        } else if (errLike && typeof errLike === 'object') {
            const e: any = errLike as any;
            code = e.code;
            status = typeof e.status === 'number' ? e.status : (typeof e.statusCode === 'number' ? e.statusCode : undefined);
            if (typeof e.message === 'string') msg = e.message;
            else if (typeof e.error === 'string') msg = e.error;
            else if (typeof e.toString === 'function') msg = String(e);
        }

        const text = (msg || '').toLowerCase();

        // Auth / invalid or missing API key
        if (
            status === 401 ||
            status === 403 ||
            /api key not valid|invalid api key|incorrect api key|no api key provided|api_key_invalid|unauthorized|forbidden/.test(text)
        ) {
            return 'MODEL_AUTH_INVALID';
        }

        // Context window exceeded
        if (
            (status === 413) ||
            /context window|context length|maximum context|too many tokens|max tokens|token limit|context_length_exceeded/.test(text)
        ) {
            return 'CONTEXT_WINDOW_EXCEEDED';
        }

        // Rate limit / capacity
        if (
            status === 429 ||
            /rate limit|too many requests|overloaded|at capacity|capacity|retry after/.test(text)
        ) {
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
            /model output was not valid json/.test(text)
        ) {
            return 'MODEL_OUTPUT_UNPARSABLE';
        }

        // OpenAI shim-specific hints
        if (/openai structured output.*failed/i.test(text)) {
            return 'MODEL_OUTPUT_UNPARSABLE';
        }

        return null;
    } catch {
        return null;
    }
}

// Helper to show a standardized toast with a "Go back" action.
// Pass the toast function from useToast(), the original error-like value,
// and an onGoBack callback that restores the previous step for the user.
export function showModelError(
    toastFn: (props: any) => any,
    errLike: unknown,
    onGoBack: () => void,
    title = 'Error',
): ModelErrorCode | null {
    const code = classifyModelCommError(errLike);
    if (!code) return null;

    toastFn({
        title,
        description: getModelErrorMessage(code),
        variant: 'destructive',
        action: React.createElement(ToastAction, { altText: "Go back", onClick: onGoBack }, "Go back"),
    });

    return code;
}
