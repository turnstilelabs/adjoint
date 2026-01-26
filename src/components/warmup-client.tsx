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

        // In development, the Next.js dev server can be sensitive to early heavy requests.
        // Warming up Genkit flows can momentarily block compilation/chunk delivery and
        // manifest as "Loading chunk app/layout failed".
        if (process.env.NODE_ENV !== 'production') return;
        try {
            // Warmup is helpful for snappier first model call.
            // In production we want it even when the optional unlock gate is disabled.
            // When the unlock gate is enabled and the user isn't unlocked yet, the warmup
            // request might be redirected to /unlock by middleware; we ensure we do NOT
            // follow redirects (so it can't accidentally fetch/render the unlock page).

            // Defer warmup so it never competes with initial route/chunk loading.
            const doWarmup = () => {
                try {
                    void fetch('/api/warmup', {
                        cache: 'no-store',
                        // Avoid following middleware redirects to /unlock.
                        redirect: 'manual',
                        credentials: 'same-origin',
                    });
                } catch {
                    // ignore
                }
            };

            // Prefer running during idle time when available.
            const ric = (window as any).requestIdleCallback as
                | ((cb: () => void, opts?: { timeout?: number }) => number)
                | undefined;

            if (typeof ric === 'function') {
                ric(doWarmup, { timeout: 3000 });
            } else {
                window.setTimeout(doWarmup, 1000);
            }
        } catch {
            // ignore
        }
    }, []);

    return null;
}
