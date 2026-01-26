/*
 * Keeps Zustand's `view` field consistent with the current route.
 *
 * The app historically used a single route and switched modes via Zustand.
 * We now use real Next.js routes, but still keep `view` around because
 * various UI components branch on it (e.g. SelectionToolbar behavior).
 */

'use client';

import { useEffect } from 'react';

import { useAppStore } from '@/state/app-store';
import type { View } from '@/state/store.types';

export function RouteViewSync({ view }: { view: View }) {
    useEffect(() => {
        // Best-effort: do not reset any other state; only keep the view marker aligned.
        try {
            useAppStore.setState({ view });
        } catch {
            // ignore
        }
    }, [view]);

    return null;
}

