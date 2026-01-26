'use client';

import { useEffect, useRef } from 'react';
import { useAppStore } from '@/state/app-store';
import ProofView from '@/components/features/proof/proof-view';
import { AppViewport } from '@/components/app-viewport';
import { RouteViewSync } from '@/components/route-view-sync';

/**
 * Client-side Prove route body.
 *
 * Phase 1 routing: URL represents "mode + entry statement".
 * - /prove?q=... starts a fresh proof run for that statement.
 * - /prove (no q) resumes the current in-memory proof state if present.
 */
export default function ProveClientPage({ q }: { q?: string }) {
    const startProof = useAppStore((s) => s.startProof);
    const resumeProof = useAppStore((s) => s.resumeProof);
    const existingProblem = useAppStore((s) => s.problem);
    const proofHistoryLen = useAppStore((s) => s.proofHistory.length);

    // Avoid restarting on re-render.
    const startedRef = useRef<string | null>(null);

    useEffect(() => {
        const trimmed = (q || '').trim();
        if (trimmed) {
            // If we already started for this exact query, no-op.
            if (startedRef.current === trimmed) return;
            startedRef.current = trimmed;
            void startProof(trimmed);
            return;
        }

        // No query param: just ensure we're in proof mode.
        // If we have no existing proof state, ProofView will show its empty/loading state.
        if (existingProblem || proofHistoryLen > 0) {
            resumeProof();
        } else {
            // Still mark the view for UI branching.
            try {
                useAppStore.setState({ view: 'proof' });
            } catch {
                // ignore
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [q]);

    return (
        <AppViewport>
            <RouteViewSync view="proof" />
            <ProofView />
        </AppViewport>
    );
}

