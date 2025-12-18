import { streamFlow } from '@genkit-ai/next/client';
import { explorationAssistantFlow } from '@/ai/exploration-assistant/exploration-assistant.flow';
import { useAppStore } from '@/state/app-store';
import type { Message } from '@/components/chat/interactive-chat';
import type { ExploreArtifacts } from '@/ai/exploration-assistant/exploration-assistant.schemas';
import { useToast } from '@/hooks/use-toast';

export const useSendExploreMessage = () => {
    const exploreMessages = useAppStore((s) => s.exploreMessages);
    const artifacts = useAppStore((s) => s.exploreArtifacts);
    const seed = useAppStore((s) => s.exploreSeed);

    const setExploreMessages = useAppStore((s) => s.setExploreMessages);
    const setExploreArtifacts = useAppStore((s) => s.setExploreArtifacts);
    const bumpExploreTurnId = useAppStore((s) => s.bumpExploreTurnId);
    const getExploreTurnId = useAppStore((s) => s.getExploreTurnId);
    const setExploreCancelCurrent = useAppStore((s) => s.setExploreCancelCurrent);
    const { toast } = useToast();

    return async (
        request: string,
        opts?: { displayAs?: string; suppressUser?: boolean; extractOnly?: boolean },
    ) => {
        if (!request) return;

        const isExtractOnly = Boolean(opts?.extractOnly);
        // Extract-only runs should never add user/assistant messages to the chat UI.
        const suppressUser = isExtractOnly ? true : Boolean(opts?.suppressUser);

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
        if (!suppressUser) {
            const userMessage: Message = { role: 'user', content: userVisibleText };
            newMessages = [...newMessages, userMessage];
        }

        if (!isExtractOnly) {
            const typingMessage: Message = { role: 'assistant', content: '', isTyping: true };
            setExploreMessages([...newMessages, typingMessage]);
        }

        // Keep a small history window but EXCLUDE the current user message so the first turn has empty history.
        // This ensures initial artifact extraction is strictly from the user's first message (and optional seed).
        const history = [...exploreMessages]
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
            input: {
                seed: seed ?? undefined,
                request,
                history,
                artifacts: artifacts ?? undefined,
                extractOnly: opts?.extractOnly ?? undefined,
                turnId,
            },
        });

        try {
            for await (const chunk of runner.stream) {
                if (chunk.type === 'text' && !isExtractOnly) {
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

                if (chunk.type === 'error') {
                    // eslint-disable-next-line no-console
                    console.error('[Explore] server error chunk', chunk);
                    toast({
                        title: 'Explore extraction failed',
                        description: chunk.message || 'Unexpected exploration error.',
                        variant: 'destructive',
                    });
                }
            }

            await runner.output;
        } catch (e: any) {
            // Swallow AbortError triggered by user/system cancellation
            if (!(e && (e.name === 'AbortError' || e.message === 'The operation was aborted.'))) {
                // eslint-disable-next-line no-console
                console.error('[Explore] stream error', e);
                toast({
                    title: 'Explore request failed',
                    description: e?.message || 'Unexpected explore streaming error.',
                    variant: 'destructive',
                });
            }
        } finally {
            if (!isExtractOnly) {
                setExploreMessages((prev: Message[]) =>
                    prev.map((msg, idx) =>
                        idx === prev.length - 1 ? ({ ...msg, isTyping: false } as Message) : msg,
                    ),
                );
            }
            // Clear cancellation handle
            setExploreCancelCurrent(null);
        }
    };
};
