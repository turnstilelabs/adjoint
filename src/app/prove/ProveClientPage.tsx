'use client';

import { useEffect, useRef } from 'react';
import { useAppStore } from '@/state/app-store';
import ProofView from '@/components/features/proof/proof-view';
import { AppViewport } from '@/components/app-viewport';
import { RouteViewSync } from '@/components/route-view-sync';

/**
 * Client-side Prove route body.
 *
 * Routing:
 * - /prove?q=... starts a fresh proof run for that statement (small payloads).
 * - /prove?sid=... loads the statement from sessionStorage (large payloads, in-app navigation).
 * - /prove (no q/sid) resumes the current in-memory proof state if present.
 */
export default function ProveClientPage({ q, sid }: { q?: string; sid?: string }) {
    const startProof = useAppStore((s) => s.startProof);
    const resumeProof = useAppStore((s) => s.resumeProof);

    // Avoid restarting on re-render.
    const startedRef = useRef<string | null>(null);

    useEffect(() => {
        const trimmed = (q || '').trim();
        const sidTrimmed = (sid || '').trim();

        // Large payload path: load the actual statement from sessionStorage.
        // This is local-only (per-tab) and is intended for in-app navigation.
        if (!trimmed && sidTrimmed) {
            try {
                // Dynamic import keeps this file minimal and avoids SSR pitfalls.
                // (This is a client component, but we still want to keep boundaries clean.)
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                (async () => {
                    const { loadRoutePayload } = await import('@/lib/route-payload');
                    const fromStorage = loadRoutePayload(sidTrimmed);
                    const statement = (fromStorage || '').trim();
                    if (!statement) {
                        // Payload missing/expired: just ensure view is set; ProofView will handle empty state.
                        try {
                            useAppStore.setState({ view: 'proof' });
                        } catch {
                            // ignore
                        }
                        return;
                    }
                    // Mirror normal q=... path.
                    if (startedRef.current === statement) return;
                    startedRef.current = statement;
                    void startProof(statement);
                })();
            } catch {
                // ignore
            }
            return;
        }

        if (trimmed) {
            // Idempotent hydration:
            // When navigating back/forward, the page remounts but we want to keep the existing
            // in-memory proof session instead of re-running the prover.
            const snapshot = useAppStore.getState();
            const alreadyHaveSessionForThisQuery =
                (snapshot.problem || '').trim() === trimmed &&
                (snapshot.loading ||
                    (snapshot.proofHistory?.length ?? 0) > 0 ||
                    !!snapshot.pendingSuggestion ||
                    !!snapshot.pendingRejection);

            if (alreadyHaveSessionForThisQuery) {
                resumeProof();
                return;
            }

            // If we already started for this exact query in this component instance, no-op.
            if (startedRef.current === trimmed) return;
            startedRef.current = trimmed;
            void startProof(trimmed);
            return;
        }

        // No query param: just ensure we're in proof mode.
        // If we have no existing proof state, ProofView will show its empty/loading state.
        const snapshot = useAppStore.getState();
        if ((snapshot.problem || '').trim() || (snapshot.proofHistory?.length ?? 0) > 0) {
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
        // Intentionally do NOT depend on proof state (problem/history/etc.) to avoid re-triggering
        // startProof due to state changes during the run.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [q, sid, resumeProof, startProof]);

    return (
        <AppViewport>
            <RouteViewSync view="proof" />
            <ProofView />
        </AppViewport>
    );
}

