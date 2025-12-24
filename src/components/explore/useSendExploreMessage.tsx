import { streamFlow } from '@genkit-ai/next/client';
import { explorationAssistantFlow } from '@/ai/exploration-assistant/exploration-assistant.flow';
import { useAppStore } from '@/state/app-store';
import type { Message } from '@/components/chat/interactive-chat';
import type { ExploreArtifacts } from '@/ai/exploration-assistant/exploration-assistant.schemas';
import { useToast } from '@/hooks/use-toast';

type ExploreIntent = 'PROOF_REQUEST' | 'EXPLORE';

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

    const classifyIntent = async (
        request: string,
        history: { role: 'user' | 'assistant'; content: string }[],
    ): Promise<ExploreIntent> => {
        try {
            // NOTE: @genkit-ai/next appRoute expects { data: <input> }.
            const res = await fetch('/api/explore-intent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    data: {
                        request,
                        // Keep this short; classifier should be fast.
                        history: history.slice(-6).map((m) => ({ role: m.role, content: m.content })),
                    },
                }),
            });

            if (!res.ok) return 'EXPLORE';
            const json: any = await res.json();

            // appRoute returns { result: <flow output> }
            const intent = (json?.result?.intent ?? json?.intent) as ExploreIntent | undefined;
            return intent === 'PROOF_REQUEST' ? 'PROOF_REQUEST' : 'EXPLORE';
        } catch {
            return 'EXPLORE';
        }
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

        const trimmedRequest = request.length > MAX_BASIS_LEN ? request.slice(0, MAX_BASIS_LEN) : request;
        const userVisibleText = opts?.displayAs ?? request;

        // Cancel previous request if still running
        const cancel = useAppStore.getState().cancelExploreCurrent;
        if (cancel) {
            try {
                cancel();
            } catch {
                // ignore
            }
        }

        let newMessages: Message[] = exploreMessages;
        if (!suppressUser) {
            const userMessage: Message = { role: 'user', content: userVisibleText };
            newMessages = [...newMessages, userMessage];
        }

        // Show a typing indicator immediately so the UI feels responsive while intent is classified.
        const shouldShowAssistantBubble = !isExtractOnly;
        if (shouldShowAssistantBubble) {
            const typingMessage: Message = { role: 'assistant', content: '', isTyping: true };
            setExploreMessages([...newMessages, typingMessage]);
        }

        // Determine whether this message is a proof request (LLM classifier).
        // Prefer the user-visible text for keyword-based intent (displayAs may differ from the backend request).
        let classified: ExploreIntent | null = null;
        if (!isExtractOnly && !suppressUser) {
            classified = await classifyIntent(trimmedRequest, newMessages);
        }

        const proofIntent = !isExtractOnly && !suppressUser && classified === 'PROOF_REQUEST';

        if (process.env.NODE_ENV !== 'production') {
            try {
                // Useful for debugging and E2E verification.
                // eslint-disable-next-line no-console
                console.debug(
                    '[Explore][Intent]',
                    JSON.stringify({ request: trimmedRequest, visible: userVisibleText, classified, proofIntent }),
                );
            } catch {
                // ignore
            }
        }

        // If the user asked to prove/show something, replace the typing indicator with a minimal message + CTA.
        // IMPORTANT (Option 2 UX): we only open the proof chooser AFTER extract-only completes,
        // so the modal always has candidate statements.
        if (proofIntent && shouldShowAssistantBubble) {
            const actionMessage: Message = {
                role: 'assistant',
                content:
                    "This chat is for exploration (assumptions, examples/counterexamples, reformulations). If you'd like, I can attempt a proof of the current statement:",
                actions: [{ type: 'attempt_proof', label: 'Attempt Proof' }],
                isTyping: false,
            };
            setExploreMessages([...newMessages, actionMessage]);
        }

        // Keep a small history window but EXCLUDE the current user message so the first turn has empty history.
        // This ensures initial artifact extraction is strictly from the user's first message (and optional seed).
        const history = [...exploreMessages]
            .slice(-10)
            .map((m) => ({ role: m.role, content: m.content }));

        // IMPORTANT: refresh the latest artifacts/seed at send-time.
        // The hook captures store slices at render time; without this, a "prove it" immediately
        // after extraction can see stale/null artifacts and extract from the literal "prove it".
        const liveArtifacts = useAppStore.getState().exploreArtifacts;
        const liveSeed = useAppStore.getState().exploreSeed;

        const turnId = bumpExploreTurnId();

        const controller = new AbortController();
        setExploreCancelCurrent(() => {
            try {
                if (!controller.signal.aborted) controller.abort();
            } catch {
                // ignore
            }
        });

        const looksLikeBareProofCommand = (s: string): boolean => {
            const t = (s ?? '').trim().toLowerCase().replace(/[.?!,:;]+$/g, '').trim();
            return (
                t === 'prove it' ||
                t === 'show it' ||
                t === 'prove this' ||
                t === 'show this' ||
                t === 'prove' ||
                t === 'show'
            );
        };

        const openProofChooser = () => {
            // ExploreView registers a window event listener in a useEffect.
            // To avoid races on first load, dispatch now and once on the next tick.
            try {
                window.dispatchEvent(new CustomEvent('explore:open-attempt-proof-chooser'));
            } catch {
                // ignore
            }
            try {
                setTimeout(() => {
                    try {
                        window.dispatchEvent(new CustomEvent('explore:open-attempt-proof-chooser'));
                    } catch {
                        // ignore
                    }
                }, 0);
            } catch {
                // ignore
            }
        };

        // If we rendered a CTA-only response, run extraction in the background so
        // candidate statements stay fresh, but do not stream assistant text.
        const effectiveExtractOnly = proofIntent ? true : (opts?.extractOnly ?? undefined);

        // For "prove it"-style commands, the request is NOT a statement.
        // In that case, we must extract from a meaningful basis.
        const candidateBasisFromStore =
            (liveArtifacts?.candidateStatements ?? []).slice(-1)[0] || (liveSeed ?? '') || '';

        const basisForExtraction = proofIntent
            ? looksLikeBareProofCommand(userVisibleText)
                ? (candidateBasisFromStore || userVisibleText || trimmedRequest)
                : userVisibleText
            : trimmedRequest;

        const basisTrimmed =
            basisForExtraction.length > MAX_BASIS_LEN
                ? basisForExtraction.slice(0, MAX_BASIS_LEN)
                : basisForExtraction;

        const runner = streamFlow<typeof explorationAssistantFlow>({
            url: '/api/explore',
            abortSignal: controller.signal,
            input: {
                seed: seed ?? undefined,
                request: basisTrimmed,
                history,
                artifacts: liveArtifacts ?? undefined,
                extractOnly: effectiveExtractOnly,
                turnId,
            },
        });

        let lastArtifacts: ExploreArtifacts | null = null;
        let openedProofChooser = false;

        try {
            for await (const raw of runner.stream) {
                const chunk: any =
                    raw && (raw as any).type
                        ? raw
                        : (raw as any)?.message?.type
                            ? (raw as any).message
                            : raw;

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
                        lastArtifacts = chunk.artifacts as ExploreArtifacts;
                        setExploreArtifacts(lastArtifacts);

                        // Option 2 UX: open the proof chooser as soon as we have candidate statements.
                        if (
                            proofIntent &&
                            !openedProofChooser &&
                            (lastArtifacts?.candidateStatements?.length ?? 0) > 0
                        ) {
                            openedProofChooser = true;
                            openProofChooser();
                        }
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

            // Option 2 UX: if not opened yet, open after extract-only completes.
            if (proofIntent && !openedProofChooser && (lastArtifacts?.candidateStatements?.length ?? 0) > 0) {
                openedProofChooser = true;
                openProofChooser();
            }
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
