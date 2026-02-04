'use client';

import { useEffect, useRef } from 'react';
import { useAppStore } from '@/state/app-store';
import ExploreView from '@/components/features/explore/explore-view';
import { AppViewport } from '@/components/app-viewport';
import { useSendExploreMessage } from '@/components/explore/useSendExploreMessage';
import { RouteViewSync } from '@/components/route-view-sync';
import { useRouter } from 'next/navigation';

/**
 * Client-side Explore route body.
 *
 * We keep this separate from `app/explore/page.tsx` so the page itself can be a
 * Server Component (avoids Next.js build-time `useSearchParams()` CSR bailout).
 */
export default function ExploreClientPage({
    q,
    sid,
    isNew,
}: {
    q?: string;
    sid?: string;
    isNew?: boolean;
}) {
    const router = useRouter();
    const view = useAppStore((s) => s.view);
    const startExplore = useAppStore((s) => s.startExplore);
    const newExplore = useAppStore((s) => s.newExplore);
    const seed = useAppStore((s) => s.exploreSeed);
    const messagesLen = useAppStore((s) => s.exploreMessages.length);
    const sendMessage = useSendExploreMessage();

    // Prevent auto-send from firing multiple times for the same navigation
    const sentOnce = useRef(false);

    // Prevent hydration logic from re-running repeatedly (e.g. when searchParams change
    // due to a local router.replace removing ?new=1).
    const appliedRef = useRef(false);

    // When landing via /explore?... hydrate state.
    useEffect(() => {
        if (appliedRef.current) return;
        appliedRef.current = true;

        const snapshot = useAppStore.getState();
        const trimmed = (q || '').trim();
        const sidTrimmed = (sid || '').trim();

        // IMPORTANT: `?new=1` must always start from a clean empty Explore session.
        // We also immediately strip the one-shot param from the URL.
        if (isNew) {
            sentOnce.current = false;
            newExplore();
            try {
                router.replace('/explore');
            } catch {
                // ignore
            }
            return;
        }

        // Large payload path: load seed from sessionStorage.
        if (!trimmed && sidTrimmed) {
            try {
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                (async () => {
                    const { loadRoutePayload } = await import('@/lib/route-payload');
                    const fromStorage = loadRoutePayload(sidTrimmed);
                    const seed = (fromStorage || '').trim();
                    if (!seed) {
                        startExplore();
                        return;
                    }
                    sentOnce.current = false;
                    startExplore(seed);
                })();
            } catch {
                startExplore();
            }
            return;
        }

        if (trimmed) {
            // Idempotent hydration:
            // This effect must NOT depend on `seed`/`messagesLen`, otherwise it will re-run whenever
            // the chat updates and cancel in-flight streams. Instead, read the current store snapshot.
            const alreadyHaveSessionForThisSeed =
                (snapshot.exploreSeed || '').trim() === trimmed &&
                ((snapshot.exploreMessages?.length ?? 0) > 0 || snapshot.exploreArtifacts != null);

            if (alreadyHaveSessionForThisSeed) {
                startExplore();
                return;
            }

            // Navigation with a query string: start a fresh explore session.
            sentOnce.current = false; // allow auto-send for new seed
            startExplore(trimmed);
            return;
        }

        // No query: preserve existing thread.
        startExplore();
        // startExplore is stable from Zustand; q is our navigation input
        // eslint-disable-next-line react-hooks/exhaustive-deps
        // Intentionally do NOT depend on `seed`/`messagesLen` to avoid cancelling streams mid-flight.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [q, sid, isNew, startExplore, newExplore, router]);

    useEffect(() => {
        // Auto-send a first exploration message when we have a seed and no prior messages.
        // IMPORTANT: only do this while we are actually in explore view; otherwise
        // clicking "Start proof attempt" would still keep running explore side-effects.
        if (view !== 'explore') return;
        if (!sentOnce.current && seed && messagesLen === 0) {
            sentOnce.current = true;
            const request = `Consider the statement: "${seed}"\n\nPlease assess: truth value and assumptions; suggest a better formulation if needed; give a typical example and, if applicable, a counterexample.`;
            const display = seed; // Show only the raw statement in the chat UI
            void sendMessage(request, { displayAs: display });
        }
    }, [view, seed, messagesLen, sendMessage]);

    return (
        <AppViewport>
            <RouteViewSync view="explore" />
            <ExploreView />
        </AppViewport>
    );
}
