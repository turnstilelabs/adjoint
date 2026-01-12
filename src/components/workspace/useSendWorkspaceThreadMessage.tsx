import { streamFlow } from '@genkit-ai/next/client';
import { workspaceAssistantFlow } from '@/ai/workspace-assistant/workspace-assistant.flow';
import type { WorkspaceAssistantEvent } from '@/ai/workspace-assistant/workspace-assistant.schemas';

type AnyRecord = Record<string, unknown>;

const isRecord = (v: unknown): v is AnyRecord => typeof v === 'object' && v !== null;

// Unwraps Genkit stream events (sometimes nested under `message`).
const unwrapStreamEvent = <T extends { type: string }>(raw: unknown): T | null => {
    if (!isRecord(raw)) return null;
    if (typeof raw.type === 'string') return raw as T;
    const msg = raw.message;
    if (isRecord(msg) && typeof msg.type === 'string') return msg as T;
    return null;
};

export type WorkspaceThreadSendInput = {
    request: string;
    selectionText?: string;
    contextText?: string;
    history?: { role: 'user' | 'assistant'; content: string }[];
};

export type WorkspaceThreadSendHandlers = {
    onDelta?: (delta: string) => void;
    onDone?: () => void;
    onError?: (message: string) => void;
};

// Streams a response for a workspace thread.
export function useSendWorkspaceThreadMessage() {
    return async (input: WorkspaceThreadSendInput, handlers?: WorkspaceThreadSendHandlers) => {
        try {
            const runner = streamFlow<typeof workspaceAssistantFlow>({
                url: '/api/workspace-chat',
                // appRoute expects the flow input shape directly (see /api/chat and /api/explore usage).
                input,
            });

            for await (const chunk of runner.stream) {
                const evt = unwrapStreamEvent<WorkspaceAssistantEvent>(chunk);
                if (evt?.type === 'text') handlers?.onDelta?.(evt.content || '');
                if (evt?.type === 'error') handlers?.onError?.(evt.message || 'Workspace request failed.');
            }

            await runner.output;
            handlers?.onDone?.();
        } catch (e: unknown) {
            const message =
                e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string'
                    ? (e as { message: string }).message
                    : 'Workspace request failed.';
            handlers?.onError?.(message);
        }
    };
}
