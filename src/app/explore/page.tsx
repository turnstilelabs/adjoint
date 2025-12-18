'use client';

import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAppStore } from '@/state/app-store';
import ExploreView from '@/components/features/explore/explore-view';
import { useSendExploreMessage } from '@/components/explore/useSendExploreMessage';

/**
 * Route alias for Explore.
 *
 * The app’s internal navigation is driven by a Zustand view state.
 * We still expose /explore so navigation is robust (and shareable) and so that
 * we can reliably test it via browser navigation.
 */
export default function ExplorePage() {
    const startExplore = useAppStore((s) => s.startExplore);
    const seed = useAppStore((s) => s.exploreSeed);
    const messagesLen = useAppStore((s) => s.exploreMessages.length);
    const sendMessage = useSendExploreMessage();
    const sentOnce = useRef(false);
    const searchParams = useSearchParams();

    // When landing via /explore?q=..., hydrate state with that seed
    useEffect(() => {
        const q = (searchParams?.get('q') || '').trim();
        if (q) {
            // New navigation with a query string: start a fresh explore session
            sentOnce.current = false; // allow auto-send for new seed
            startExplore(q);
        } else {
            // No query: just ensure we are in explore view and preserve existing state
            startExplore();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams]);

    useEffect(() => {
        // Auto-send a first exploration message when we have a seed and no prior messages.
        if (!sentOnce.current && seed && messagesLen === 0) {
            sentOnce.current = true;
            const request = `Consider the statement: "${seed}"\n\nPlease assess: truth value and assumptions; suggest a better formulation if needed; give a typical example and, if applicable, a counterexample.`;
            const display = seed; // Show only the raw statement in the chat UI
            void sendMessage(request, { displayAs: display });
        }
    }, [seed, messagesLen, sendMessage]);

    return <ExploreView />;
}
