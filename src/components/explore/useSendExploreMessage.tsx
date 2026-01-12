import { streamFlow } from '@genkit-ai/next/client';
import { explorationAssistantFlow } from '@/ai/exploration-assistant/exploration-assistant.flow';
import { workspaceAssistantFlow } from '@/ai/workspace-assistant/workspace-assistant.flow';
import { useAppStore } from '@/state/app-store';
import type { Message } from '@/components/chat/interactive-chat';
import type { ExploreArtifacts } from '@/ai/exploration-assistant/exploration-assistant.schemas';
import { useToast } from '@/hooks/use-toast';

export const useSendExploreMessage = () => {
    const exploreMessages = useAppStore((s) => s.exploreMessages);
    const seed = useAppStore((s) => s.exploreSeed);

    const setExploreMessages = useAppStore((s) => s.setExploreMessages);
    const setExploreArtifacts = useAppStore((s) => s.setExploreArtifacts);
    const bumpExploreTurnId = useAppStore((s) => s.bumpExploreTurnId);
    const getExploreTurnId = useAppStore((s) => s.getExploreTurnId);
    const setExploreCancelCurrent = useAppStore((s) => s.setExploreCancelCurrent);
    const { toast } = useToast();

    // Basic length threshold to avoid streaming hiccups with huge payloads
    const MAX_BASIS_LEN = 4000;

    const runExtraction = async (input: {
        request: string;
        history?: { role: 'user' | 'assistant'; content: string }[];
        artifacts?: ExploreArtifacts | null;
        seed?: string | null;
        extractOnly?: boolean;
        turnId: number;
        abortSignal?: AbortSignal;
    }) => {
        const runner = streamFlow<typeof explorationAssistantFlow>({
            url: '/api/explore',
            ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
            input: {
                seed: input.seed ?? undefined,
                request: input.request,
                history: input.history ?? [],
                artifacts: input.artifacts ?? undefined,
                extractOnly: input.extractOnly,
                turnId: input.turnId,
            },
        });

        for await (const raw of runner.stream) {
            const chunk: any =
                raw && (raw as any).type
                    ? raw
                    : (raw as any)?.message?.type
                        ? (raw as any).message
                        : raw;

            if (chunk?.type === 'artifacts') {
                if (chunk.turnId === getExploreTurnId()) {
                    setExploreArtifacts(chunk.artifacts as ExploreArtifacts);
                }
            }
            if (chunk?.type === 'error' || chunk?.error || chunk?.code) {
                const msg = chunk?.message || chunk?.error || 'Explore extraction failed.';
                toast({
                    title: 'Explore extraction failed',
                    description: msg,
                    variant: 'destructive',
                });
            }
        }

        await runner.output;
    };

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

        // Cancel previous request if still running.
        // IMPORTANT: do NOT cancel an in-flight chat stream when running an extract-only update
        // (ExploreView may trigger background extraction on message updates).
        if (!isExtractOnly) {
            const cancel = useAppStore.getState().cancelExploreCurrent;
            if (cancel) {
                try {
                    cancel();
                } catch {
                    // ignore
                }
            }
        }

        let newMessages: Message[] = exploreMessages;
        if (!suppressUser) {
            const userMessage: Message = { role: 'user', content: userVisibleText };
            newMessages = [...newMessages, userMessage];
        }

        // For extraction and chat we keep a short history window.
        const history = [...exploreMessages].slice(-10).map((m) => ({ role: m.role, content: m.content }));

        // IMPORTANT: refresh the latest artifacts/seed at send-time.
        // The hook captures store slices at render time; without this, a "prove it" immediately
        // after extraction can see stale/null artifacts and extract from the literal "prove it".
        const liveArtifacts = useAppStore.getState().exploreArtifacts;
        const liveSeed = useAppStore.getState().exploreSeed;

        const turnId = bumpExploreTurnId();

        const controller = new AbortController();

        // Only register the cancel handle for user-visible chat sends.
        // Extract-only runs should not override the cancel handle for an active chat stream.
        if (!isExtractOnly) {
            setExploreCancelCurrent(() => {
                try {
                    if (!controller.signal.aborted) controller.abort();
                } catch {
                    // ignore
                }
            });
        }

        const basisTrimmed = trimmedRequest.length > MAX_BASIS_LEN ? trimmedRequest.slice(0, MAX_BASIS_LEN) : trimmedRequest;

        // Extract-only: just refresh artifacts, no chat response.
        if (isExtractOnly) {
            try {
                await runExtraction({
                    request: basisTrimmed,
                    history,
                    artifacts: liveArtifacts ?? null,
                    seed: seed ?? null,
                    extractOnly: true,
                    turnId,
                    // Don't attach an abortSignal for background extraction.
                    // This prevents cancellation of an active chat stream and avoids dev-server
                    // noise like ResponseAborted.
                });
            } finally {
                // Do not clear cancel handle here; it might belong to an active chat request.
            }
            return;
        }

        // Normal send: show assistant bubble, stream response using the SAME backend as Workspace.
        // (This makes Explore chat freeform and avoids exploration-specific refusals.)
        const typingMessage: Message = { role: 'assistant', content: '', isTyping: true };
        setExploreMessages([...newMessages, typingMessage]);

        let assistantText = '';

        try {
            const runner = streamFlow<typeof workspaceAssistantFlow>({
                url: '/api/workspace-chat',
                abortSignal: controller.signal,
                input: {
                    request: basisTrimmed,
                    history,
                },
            });

            for await (const chunk of runner.stream) {
                // Genkit streamFlow sometimes yields either the chunk directly
                // or nested under `message`.
                const evt: any =
                    (chunk as any)?.type
                        ? chunk
                        : (chunk as any)?.message?.type
                            ? (chunk as any).message
                            : chunk;

                if (evt?.type === 'text') {
                    const delta = String(evt.content ?? evt.text ?? evt.delta ?? '');
                    assistantText += delta;
                    setExploreMessages((prev: Message[]) =>
                        prev.map((msg, idx) =>
                            idx === prev.length - 1
                                ? ({ ...msg, content: msg.content + delta } as Message)
                                : msg,
                        ),
                    );
                }
                if (evt?.type === 'error') {
                    toast({
                        title: 'Explore request failed',
                        description: evt.message || 'Explore request failed.',
                        variant: 'destructive',
                    });
                }
            }

            await runner.output;

            // After the assistant response, update artifacts from the full recent conversation.
            // We do this in the background; chat behavior remains identical to Workspace.
            const convo = [...history, { role: 'user' as const, content: userVisibleText }, { role: 'assistant' as const, content: assistantText }]
                .map((m) => `[${m.role}] ${m.content}`)
                .join('\n');
            const convoTrimmed = convo.length > MAX_BASIS_LEN ? convo.slice(0, MAX_BASIS_LEN) : convo;

            // Run extraction with a separate controller (do not re-use the chat abortSignal).
            // If extraction fails/aborts, it must not affect the chat UI.
            const extractionController = new AbortController();
            await runExtraction({
                request: convoTrimmed,
                history: [],
                artifacts: useAppStore.getState().exploreArtifacts ?? null,
                seed: useAppStore.getState().exploreSeed ?? null,
                extractOnly: true,
                turnId,
                abortSignal: extractionController.signal,
            });
        } catch (e: any) {
            if (!(e && (e.name === 'AbortError' || e.message === 'The operation was aborted.'))) {
                // eslint-disable-next-line no-console
                console.error('[Explore] chat stream error', e);
                toast({
                    title: 'Explore request failed',
                    description: e?.message || 'Unexpected explore streaming error.',
                    variant: 'destructive',
                });
            }
        } finally {
            setExploreMessages((prev: Message[]) =>
                prev.map((msg, idx) => (idx === prev.length - 1 ? ({ ...msg, isTyping: false } as Message) : msg)),
            );
            setExploreCancelCurrent(null);
        }
    };
};
