'use client';

import { streamFlow } from '@genkit-ai/next/client';
import { explorationAssistantFlow } from '@/ai/exploration-assistant/exploration-assistant.flow';
import { useAppStore } from '@/state/app-store';
import type { ExploreArtifacts } from '@/ai/exploration-assistant/exploration-assistant.schemas';
import type { ExplorationAssistantEvent } from '@/ai/exploration-assistant/exploration-assistant.schemas';
import type { Message } from '@/components/chat/interactive-chat';

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

const isAbortLike = (e: unknown): boolean => {
    if (!e || typeof e !== 'object') return false;
    const anyE = e as any;
    const name = String(anyE?.name ?? '');
    const msg = String(anyE?.message ?? '');
    return (
        name === 'AbortError' ||
        msg === 'The operation was aborted.' ||
        /aborted|aborterror/i.test(msg)
    );
};

// Background extraction for Explore (candidate statements + artifacts).
// Designed to be independent from the chat streaming request and to keep
// running across in-app route changes.
export function useExtractExploreArtifacts() {
    // Avoid streaming huge payloads.
    const MAX_BASIS_LEN = 4000;

    return async (opts: { request: string; history: Message[]; seed?: string | null }) => {
        const request = String(opts.request ?? '').trim();
        if (!request) return;

        // If paused, no-op.
        if (useAppStore.getState().exploreExtractionPaused) return;

        // Cancel previous extraction if still running.
        const cancel = useAppStore.getState().cancelExploreExtractionCurrent;
        if (cancel) {
            try {
                cancel();
            } catch {
                // ignore
            }
        }

        const liveArtifacts = useAppStore.getState().exploreArtifacts;

        const turnId = useAppStore.getState().bumpExploreTurnId();
        const getTurnId = useAppStore.getState().getExploreTurnId;

        const controller = new AbortController();
        useAppStore.getState().setExploreExtractionCancelCurrent(() => {
            try {
                if (!controller.signal.aborted) controller.abort();
            } catch {
                // ignore
            }
        });

        const trimmedRequest = request.length > MAX_BASIS_LEN ? request.slice(0, MAX_BASIS_LEN) : request;

        const history = (opts.history ?? [])
            .slice(-10)
            .map((m) => ({ role: m.role, content: String(m.content ?? '') }));

        useAppStore.getState().setExploreIsExtracting(true);

        const runner = streamFlow<typeof explorationAssistantFlow>({
            url: '/api/explore',
            abortSignal: controller.signal,
            input: {
                seed: opts.seed == null ? undefined : String(opts.seed ?? ''),
                request: trimmedRequest,
                history,
                artifacts: liveArtifacts ?? undefined,
                extractOnly: true,
                turnId,
            },
        });

        try {
            for await (const raw of runner.stream) {
                const chunk = unwrapStreamEvent<ExplorationAssistantEvent>(raw);

                if (chunk?.type === 'artifacts') {
                    // stale-guard
                    if (chunk.turnId === getTurnId()) {
                        useAppStore.getState().setExploreArtifacts(chunk.artifacts as ExploreArtifacts);
                    }
                }
            }

            await runner.output;
        } catch (e: unknown) {
            // Abort and stream interruptions are expected; don't toast.
            if (!isAbortLike(e)) {
                // Keep previous artifacts; just stop extracting.
                // eslint-disable-next-line no-console
                console.warn('[Explore] extraction stream error', e);
            }
        } finally {
            useAppStore.getState().setExploreExtractionCancelCurrent(null);
            useAppStore.getState().setExploreIsExtracting(false);
        }
    };
}
