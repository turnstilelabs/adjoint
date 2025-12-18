'use client';

import { useEffect, useRef } from 'react';
import { useAppStore } from '@/state/app-store';
import ExploreView from '@/components/features/explore/explore-view';
import ProofView from '@/components/features/proof/proof-view';
import HomeView from '@/components/features/home/home-view';
import { AppViewport } from '@/components/app-viewport';
import { useSendExploreMessage } from '@/components/explore/useSendExploreMessage';

/**
 * Client-side Explore route body.
 *
 * We keep this separate from `app/explore/page.tsx` so the page itself can be a
 * Server Component (avoids Next.js build-time `useSearchParams()` CSR bailout).
 */
export default function ExploreClientPage({ q }: { q?: string }) {
    const view = useAppStore((s) => s.view);
    const startExplore = useAppStore((s) => s.startExplore);
    const seed = useAppStore((s) => s.exploreSeed);
    const messagesLen = useAppStore((s) => s.exploreMessages.length);
    const sendMessage = useSendExploreMessage();

    // Prevent auto-send from firing multiple times for the same navigation
    const sentOnce = useRef(false);

    // When landing via /explore?q=..., hydrate state with that seed
    useEffect(() => {
        const trimmed = (q || '').trim();
        if (trimmed) {
            // New navigation with a query string: start a fresh explore session
            sentOnce.current = false; // allow auto-send for new seed
            startExplore(trimmed);
        } else {
            // No query: just ensure we are in explore view and preserve existing state
            startExplore();
        }
        // startExplore is stable from Zustand; q is our navigation input
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [q]);

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
            {view === 'proof' ? <ProofView /> : view === 'explore' ? <ExploreView /> : <HomeView />}
        </AppViewport>
    );
}
