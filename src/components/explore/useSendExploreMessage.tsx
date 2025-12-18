import { streamFlow } from '@genkit-ai/next/client';
import { explorationAssistantFlow } from '@/ai/exploration-assistant/exploration-assistant.flow';
import { useAppStore } from '@/state/app-store';
import type { Message } from '@/components/chat/interactive-chat';
import type { ExploreArtifacts } from '@/ai/exploration-assistant/exploration-assistant.schemas';

export const useSendExploreMessage = () => {
    const exploreMessages = useAppStore((s) => s.exploreMessages);
    const artifacts = useAppStore((s) => s.exploreArtifacts);
    const seed = useAppStore((s) => s.exploreSeed);

    const setExploreMessages = useAppStore((s) => s.setExploreMessages);
    const setExploreArtifacts = useAppStore((s) => s.setExploreArtifacts);
    const bumpExploreTurnId = useAppStore((s) => s.bumpExploreTurnId);
    const getExploreTurnId = useAppStore((s) => s.getExploreTurnId);
    const setExploreCancelCurrent = useAppStore((s) => s.setExploreCancelCurrent);

    return async (
        request: string,
        opts?: { displayAs?: string; suppressUser?: boolean },
    ) => {
        if (!request) return;

        // Cancel previous request if still running
        const cancel = useAppStore.getState().cancelExploreCurrent;
        if (cancel) {
            try {
                cancel();
            } catch {
                // ignore
            }
        }

        const userVisibleText = opts?.displayAs ?? request;

        let newMessages: Message[] = exploreMessages;
        if (!opts?.suppressUser) {
            const userMessage: Message = { role: 'user', content: userVisibleText };
            newMessages = [...newMessages, userMessage];
        }
        const typingMessage: Message = { role: 'assistant', content: '', isTyping: true };
        setExploreMessages([...newMessages, typingMessage]);

        // Keep a small history window (reflect what we displayed to the user)
        const history = [...newMessages]
            .slice(-10)
            .map((m) => ({ role: m.role, content: m.content }));

        const turnId = bumpExploreTurnId();

        const controller = new AbortController();
        setExploreCancelCurrent(() => {
            try {
                if (!controller.signal.aborted) controller.abort();
            } catch {
                // ignore
            }
        });

        const runner = streamFlow<typeof explorationAssistantFlow>({
            url: '/api/explore',
            abortSignal: controller.signal,
            // Important: send the full request to the backend (can differ from displayed content)
            input: { seed: seed ?? undefined, request, history, artifacts: artifacts ?? undefined, turnId },
        });

        try {
            for await (const chunk of runner.stream) {
                if (chunk.type === 'text') {
                    setExploreMessages((prev: Message[]) =>
                        prev.map((msg, idx) =>
                            idx === prev.length - 1
                                ? ({ ...msg, content: msg.content + chunk.content } as Message)
                                : msg,
                        ),
                    );
                }

                if (chunk.type === 'artifacts') {
                    // stale-guard
                    if (chunk.turnId === getExploreTurnId()) {
                        setExploreArtifacts(chunk.artifacts as ExploreArtifacts);
                    }
                }
            }

            await runner.output;
        } catch (e: any) {
            // Swallow AbortError triggered by user/system cancellation
            if (!(e && (e.name === 'AbortError' || e.message === 'The operation was aborted.'))) {
                // eslint-disable-next-line no-console
                console.error('[Explore] stream error', e);
            }
        } finally {
            setExploreMessages((prev: Message[]) =>
                prev.map((msg, idx) =>
                    idx === prev.length - 1 ? ({ ...msg, isTyping: false } as Message) : msg,
                ),
            );
            // Clear cancellation handle
            setExploreCancelCurrent(null);
        }
    };
};
