import { streamFlow } from '@genkit-ai/next/client';
import { explorationAssistantFlow } from '@/ai/exploration-assistant/exploration-assistant.flow';
import { workspaceAssistantFlow } from '@/ai/workspace-assistant/workspace-assistant.flow';
import { useAppStore } from '@/state/app-store';
import type { Message } from '@/components/chat/interactive-chat';
import type { ExploreArtifacts } from '@/ai/exploration-assistant/exploration-assistant.schemas';
import type { ExplorationAssistantEvent } from '@/ai/exploration-assistant/exploration-assistant.schemas';
import type { WorkspaceAssistantEvent } from '@/ai/workspace-assistant/workspace-assistant.schemas';
import { useToast } from '@/hooks/use-toast';

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

export const useSendExploreMessage = () => {
    const exploreMessages = useAppStore((s) => s.exploreMessages);
    const seed = useAppStore((s) => s.exploreSeed);

    const setExploreMessages = useAppStore((s) => s.setExploreMessages);
    const setExploreArtifacts = useAppStore((s) => s.setExploreArtifacts);
    const bumpExploreTurnId = useAppStore((s) => s.bumpExploreTurnId);
    const getExploreTurnId = useAppStore((s) => s.getExploreTurnId);
    const setExploreCancelCurrent = useAppStore((s) => s.setExploreCancelCurrent);
    const { toast } = useToast();

    const WAITING_MESSAGES = [
        'Integrating ideas…',
        'Factoring in the details…',
        'Taking it to the next step…',
    ] as const;

    const pickWaitingMessage = () => {
        try {
            return WAITING_MESSAGES[Math.floor(Math.random() * WAITING_MESSAGES.length)];
        } catch {
            return WAITING_MESSAGES[0];
        }
    };

    // Avoid streaming huge payloads.
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
                // Schema expects either a string or omission; never null.
                seed: input.seed == null ? undefined : input.seed,
                request: input.request,
                history: input.history ?? [],
                artifacts: input.artifacts ?? undefined,
                extractOnly: input.extractOnly,
                turnId: input.turnId,
            },
        });

        for await (const raw of runner.stream) {
            const evt = unwrapStreamEvent<ExplorationAssistantEvent>(raw);

            if (evt?.type === 'artifacts') {
                if (evt.turnId === getExploreTurnId()) {
                    setExploreArtifacts(evt.artifacts);
                }
            }

            // Fallback error handling for non-schema error shapes.
            // (Some providers/layers may emit `{ error, code, detail }`.)
            const maybeErr: AnyRecord | null = isRecord(raw)
                ? (raw as AnyRecord)
                : isRecord((raw as AnyRecord | undefined)?.message)
                    ? ((raw as AnyRecord).message as AnyRecord)
                    : null;

            const rawError = maybeErr ? (maybeErr['error'] ?? maybeErr['code']) : null;

            if (evt?.type === 'error' || rawError) {
                const msg =
                    (evt?.type === 'error' && evt.message) ||
                    (maybeErr
                        ? String(maybeErr['message'] ?? maybeErr['error'] ?? 'Explore extraction failed.')
                        : 'Explore extraction failed.');
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

        // Don't cancel an active chat stream when running extract-only updates.
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

        // Use latest store values (hook closure can be stale).
        const liveArtifacts = useAppStore.getState().exploreArtifacts;
        const liveSeed = useAppStore.getState().exploreSeed;

        const turnId = bumpExploreTurnId();

        const controller = new AbortController();

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

        // Extract-only: refresh artifacts, no chat response.
        if (isExtractOnly) {
            try {
                await runExtraction({
                    request: basisTrimmed,
                    history,
                    artifacts: liveArtifacts ?? null,
                    seed: liveSeed ?? undefined,
                    extractOnly: true,
                    turnId,
                    // No abortSignal for background extraction.
                });
            } finally {
                // Do not clear cancel handle here; it might belong to an active chat request.
            }
            return;
        }

        // Normal send: stream response via the same backend as Workspace.
        const typingMessage: Message = {
            role: 'assistant',
            content: '',
            isTyping: true,
            // Nice little line shown before the 3-dot typing indicator.
            // Picked once per request so it doesn't flicker while streaming tokens.
            waitingMessage: pickWaitingMessage(),
        };
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

            for await (const raw of runner.stream) {
                const evt = unwrapStreamEvent<WorkspaceAssistantEvent>(raw);
                if (evt?.type === 'text') {
                    const delta = String(evt.content ?? '');
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
        } catch (e: unknown) {
            if (!(e && typeof e === 'object' && ('name' in e || 'message' in e) && ((e as { name?: unknown }).name === 'AbortError' || (e as { message?: unknown }).message === 'The operation was aborted.'))) {
                // eslint-disable-next-line no-console
                console.error('[Explore] chat stream error', e);
                toast({
                    title: 'Explore request failed',
                    description:
                        (e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string'
                            ? (e as { message: string }).message
                            : null) || 'Unexpected explore streaming error.',
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
