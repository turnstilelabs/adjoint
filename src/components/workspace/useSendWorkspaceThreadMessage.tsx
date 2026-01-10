import { streamFlow } from '@genkit-ai/next/client';
import { workspaceAssistantFlow } from '@/ai/workspace-assistant/workspace-assistant.flow';

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

/**
 * Streams a response for a workspace thread.
 *
 * UI is responsible for:
 * - appending a typing message before calling
 * - streaming into that message (or similar)
 */
export function useSendWorkspaceThreadMessage() {
    return async (input: WorkspaceThreadSendInput, handlers?: WorkspaceThreadSendHandlers) => {
        try {
            const runner = streamFlow<typeof workspaceAssistantFlow>({
                url: '/api/workspace-chat',
                // appRoute expects the flow input shape directly (see /api/chat and /api/explore usage).
                input,
            });

            for await (const chunk of runner.stream) {
                if ((chunk as any)?.type === 'text') {
                    handlers?.onDelta?.((chunk as any).content || '');
                }
                if ((chunk as any)?.type === 'error') {
                    handlers?.onError?.((chunk as any).message || 'Workspace request failed.');
                }
            }

            await runner.output;
            handlers?.onDone?.();
        } catch (e: any) {
            handlers?.onError?.(e?.message || 'Workspace request failed.');
        }
    };
}
