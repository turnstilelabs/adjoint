'use client';

import { useEffect, useRef } from 'react';
import { useAppStore } from '@/state/app-store';
import ExploreView from '@/components/features/explore/explore-view';
import { AppViewport } from '@/components/app-viewport';
import { useSendExploreMessage } from '@/components/explore/useSendExploreMessage';
import { RouteViewSync } from '@/components/route-view-sync';

/**
 * Client-side Explore route body.
 *
 * We keep this separate from `app/explore/page.tsx` so the page itself can be a
 * Server Component (avoids Next.js build-time `useSearchParams()` CSR bailout).
 */
export default function ExploreClientPage({ q, isNew }: { q?: string; isNew?: boolean }) {
    const view = useAppStore((s) => s.view);
    const startExplore = useAppStore((s) => s.startExplore);
    const newExplore = useAppStore((s) => s.newExplore);
    const seed = useAppStore((s) => s.exploreSeed);
    const messagesLen = useAppStore((s) => s.exploreMessages.length);
    const sendMessage = useSendExploreMessage();

    // Prevent auto-send from firing multiple times for the same navigation
    const sentOnce = useRef(false);

    // When landing via /explore?... hydrate state.
    useEffect(() => {
        const snapshot = useAppStore.getState();
        const trimmed = (q || '').trim();

        // IMPORTANT: `?new=1` is a one-shot intent (“start a fresh session”).
        // When navigating back/forward, we may revisit the same URL, but we should
        // NOT wipe an existing thread.
        if (isNew) {
            const hasExistingThread =
                (snapshot.exploreMessages?.length ?? 0) > 0 ||
                Boolean((snapshot.exploreSeed || '').trim()) ||
                snapshot.exploreArtifacts != null;

            if (hasExistingThread) {
                startExplore();
            } else {
                sentOnce.current = false;
                newExplore();
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
    }, [q, isNew, startExplore, newExplore]);

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
