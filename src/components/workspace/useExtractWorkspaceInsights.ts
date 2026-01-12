import { streamFlow } from '@genkit-ai/next/client';
import { explorationAssistantFlow } from '@/ai/exploration-assistant/exploration-assistant.flow';
import { useAppStore } from '@/state/app-store';
import type { ExploreArtifacts } from '@/ai/exploration-assistant/exploration-assistant.schemas';
import type { Message } from '@/components/chat/interactive-chat';
import type { ExplorationAssistantEvent } from '@/ai/exploration-assistant/exploration-assistant.schemas';

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

// Extract Explore-style artifacts for Workspace chat.
export function useExtractWorkspaceInsights() {
    // Avoid streaming huge payloads.
    const MAX_BASIS_LEN = 4000;

    return async (opts: { request: string; history: Message[]; seed?: string }) => {
        const request = String(opts.request ?? '').trim();
        if (!request) return;

        // UI hint (Workspace Insights panel will show an "Extracting…" state)
        try {
            useAppStore.getState().setWorkspaceInsightsExtracting(true);
        } catch {
            // ignore
        }

        // Cancel previous extraction if still running
        const cancel = useAppStore.getState().cancelWorkspaceCurrent;
        if (cancel) {
            try {
                cancel();
            } catch {
                // ignore
            }
        }

        const liveArtifacts = useAppStore.getState().workspaceArtifacts;

        const turnId = useAppStore.getState().bumpWorkspaceTurnId();
        const getTurnId = useAppStore.getState().getWorkspaceTurnId;

        const controller = new AbortController();
        useAppStore.getState().setWorkspaceCancelCurrent(() => {
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

        const runner = streamFlow<typeof explorationAssistantFlow>({
            url: '/api/explore',
            abortSignal: controller.signal,
            input: {
                seed: opts.seed ?? undefined,
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
                        useAppStore.getState().setWorkspaceArtifacts(chunk.artifacts as ExploreArtifacts);
                    }
                }
            }

            await runner.output;
        } catch {
            // ignore (AbortError or stream failure); we keep the previous artifacts.
        } finally {
            useAppStore.getState().setWorkspaceCancelCurrent(null);
            try {
                useAppStore.getState().setWorkspaceInsightsExtracting(false);
            } catch {
                // ignore
            }
        }
    };
}
