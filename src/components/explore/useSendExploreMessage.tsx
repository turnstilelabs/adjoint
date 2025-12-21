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

    const isProofIntent = (s: string): boolean => {
        const t = (s ?? '').trim().toLowerCase();
        if (!t) return false;
        // Heuristic: "prove" / "show" requests that are likely asking for a proof.
        // Keep intentionally conservative to avoid hijacking normal exploration prompts.
        return (
            t.startsWith('prove') ||
            t.startsWith('show') ||
            t.includes(' can you prove') ||
            t.includes(' could you prove') ||
            t.includes(' please prove') ||
            t.includes(' can you show') ||
            t.includes(' could you show') ||
            t.includes(' please show')
        );
    };

    // Basic length threshold to avoid streaming hiccups with huge basis
    const MAX_BASIS_LEN = 4000;

    return async (
        request: string,
        opts?: { displayAs?: string; suppressUser?: boolean; extractOnly?: boolean },
    ) => {
        if (!request) return;

        const isExtractOnly = Boolean(opts?.extractOnly);
        // Extract-only runs should never add user/assistant messages to the chat UI.
        const suppressUser = isExtractOnly ? true : Boolean(opts?.suppressUser);

        const proofIntent = !isExtractOnly && !suppressUser && isProofIntent(request);

        // Cancel previous request if still running
        const cancel = useAppStore.getState().cancelExploreCurrent;
        if (cancel) {
            try {
                cancel();
            } catch {
                // ignore
            }
        }

        const trimmedRequest = request.length > MAX_BASIS_LEN ? request.slice(0, MAX_BASIS_LEN) : request;
        const userVisibleText = opts?.displayAs ?? request;

        let newMessages: Message[] = exploreMessages;
        if (!suppressUser) {
            const userMessage: Message = { role: 'user', content: userVisibleText };
            newMessages = [...newMessages, userMessage];
        }

        // If the user asked to prove/show something, keep the assistant response minimal and
        // propose the direct action with a CTA.
        if (proofIntent) {
            const actionMessage: Message = {
                role: 'assistant',
                content: 'Want me to attempt a proof?',
                actions: [{ type: 'attempt_proof', label: 'Attempt Proof' }],
            };
            setExploreMessages([...newMessages, actionMessage]);
        } else if (!isExtractOnly) {
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

        // If we already rendered a CTA-only response, run extraction in the background so
        // candidate statements stay fresh, but do not stream assistant text.
        const effectiveExtractOnly = proofIntent ? true : (opts?.extractOnly ?? undefined);

        const runner = streamFlow<typeof explorationAssistantFlow>({
            url: '/api/explore',
            abortSignal: controller.signal,
            // Important: send the full request to the backend (can differ from displayed content)
            input: {
                seed: seed ?? undefined,
                request: trimmedRequest,
                history,
                artifacts: artifacts ?? undefined,
                extractOnly: effectiveExtractOnly,
                turnId,
            },
        });

        try {
            for await (const raw of runner.stream) {
                const chunk: any = raw && (raw as any).type ? raw : ((raw as any)?.message?.type ? (raw as any).message : raw);

                if (chunk?.type === 'text' && !isExtractOnly && !proofIntent) {
                    setExploreMessages((prev: Message[]) =>
                        prev.map((msg, idx) =>
                            idx === prev.length - 1
                                ? ({ ...msg, content: msg.content + (chunk.content || '') } as Message)
                                : msg,
                        ),
                    );
                }

                if (chunk?.type === 'artifacts') {
                    // stale-guard
                    if (chunk.turnId === getExploreTurnId()) {
                        setExploreArtifacts(chunk.artifacts as ExploreArtifacts);
                    }
                }

                if (chunk?.type === 'error' || chunk?.error || chunk?.code) {
                    const msg = chunk?.message || chunk?.error || 'Adjoint could not extract statements from this text.';
                    const isInterrupted = /interrupted/i.test(String(msg || ''));
                    const baseTitle = isInterrupted ? 'Streaming interrupted' : 'Explore extraction failed';

                    // Show toast with an inline retry
                    toast({
                        title: baseTitle,
                        description: msg,
                        variant: 'destructive',
                    });
                    // Immediately clear typing indicator
                    if (!isExtractOnly && !proofIntent) {
                        setExploreMessages((prev: Message[]) =>
                            prev.map((m, i) => (i === prev.length - 1 ? ({ ...m, isTyping: false } as Message) : m)),
                        );
                    }
                    // Clear cancellation handle early on error
                    setExploreCancelCurrent(null);

                    // Optional silent immediate retry on interruption: comment out if undesired
                    // if (isInterrupted) {
                    //   void (async () => {
                    //     await new Promise((r) => setTimeout(r, 400));
                    //     await useSendExploreMessage()(request, opts);
                    //   })();
                    // }
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
            if (!isExtractOnly && !proofIntent) {
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
