'use client';

import { useEffect } from 'react';
import { useAppStore } from '@/state/app-store';
import ProofView from '@/components/features/proof/proof-view';
import HomeView from '@/components/features/home/home-view';
import ExploreView from '@/components/features/explore/explore-view';
import WorkspaceView from '@/components/features/workspace/workspace-view';
import { AppViewport } from '@/components/app-viewport';

export default function HomePage() {
    const view = useAppStore((s) => s.view);

    // Integrate browser Back/Forward with our internal in-app view state.
    // This preserves the current proof/explore/workspace sessions, because all
    // state lives in Zustand (we only switch which view is rendered).
    useEffect(() => {
        try {
            const cur = window.history.state as any;
            if (!cur?.adjointInternal) {
                window.history.replaceState(
                    {
                        ...(cur || {}),
                        adjointInternal: true,
                        adjointView: useAppStore.getState().view,
                        adjointLastViewBeforeWorkspace: useAppStore.getState().lastViewBeforeWorkspace,
                    },
                    '',
                    window.location.href,
                );
            }
        } catch {
            // ignore
        }

        const onPopState = (ev: PopStateEvent) => {
            const st = (ev.state || {}) as any;
            const nextView = st?.adjointView as any;
            if (st?.adjointInternal && (nextView === 'home' || nextView === 'proof' || nextView === 'explore' || nextView === 'workspace')) {
                useAppStore.setState({
                    view: nextView,
                    lastViewBeforeWorkspace: st?.adjointLastViewBeforeWorkspace ?? useAppStore.getState().lastViewBeforeWorkspace,
                });
                return;
            }

            // Fallback: if history entry wasn't created by us, just go home.
            useAppStore.setState({ view: 'home' });
        };

        window.addEventListener('popstate', onPopState);
        return () => window.removeEventListener('popstate', onPopState);
    }, []);

    return (
        <AppViewport>
            {view === 'proof' ? (
                <ProofView />
            ) : view === 'workspace' ? (
                <WorkspaceView />
            ) : view === 'explore' ? (
                <ExploreView />
            ) : (
                <HomeView />
            )}
        </AppViewport>
    );
}
