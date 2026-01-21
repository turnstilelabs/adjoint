'use client';

import { useEffect, useRef } from 'react';

/**
 * Best-effort warm-up hook mounted near the root of the app.
 *
 * Runs once per page load and hits `/api/warmup` to force server-side module
 * initialization (Genkit providers, flows, etc.) before the user opens Explore.
 */
export function WarmupClient() {
    const didWarmup = useRef(false);

    useEffect(() => {
        if (didWarmup.current) return;
        didWarmup.current = true;
        try {
            void fetch('/api/warmup', { cache: 'no-store' });
        } catch {
            // ignore
        }
    }, []);

    return null;
}

