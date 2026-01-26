'use client';

import { useEffect, useRef } from 'react';
import { useAppStore } from '@/state/app-store';
import WorkspaceView from '@/components/features/workspace/workspace-view';
import { AppViewport } from '@/components/app-viewport';
import { RouteViewSync } from '@/components/route-view-sync';

/**
 * Client-side Workspace route body.
 *
 * Phase 1 routing: URL can optionally seed a doc.
 * - /workspace?new=1 creates a new empty document.
 * - /workspace?seed=... starts workspace and sets doc to seed (best for short snippets).
 */
export default function WorkspaceClientPage({ seed, isNew }: { seed?: string; isNew?: boolean }) {
    const startWorkspace = useAppStore((s) => s.startWorkspace);
    const newWorkspace = useAppStore((s) => s.newWorkspace);

    const appliedRef = useRef(false);

    useEffect(() => {
        if (appliedRef.current) return;
        appliedRef.current = true;

        if (isNew) {
            newWorkspace();
            return;
        }

        const trimmed = (seed || '').trim();
        if (trimmed) {
            startWorkspace(trimmed);
            return;
        }

        // Default: open workspace without destroying existing draft/chat.
        startWorkspace();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [seed, isNew]);

    return (
        <AppViewport>
            <RouteViewSync view="workspace" />
            <WorkspaceView />
        </AppViewport>
    );
}

