'use client';

import type * as React from 'react';

/**
 * Shared top-level viewport wrapper.
 *
 * Keeping this in one place ensures that starting a proof attempt from any
 * entry point (/ or legacy /explore redirect) results in identical centering/layout.
 */
export function AppViewport({ children }: { children: React.ReactNode }) {
    return (
        <main className="flex min-h-screen bg-background items-center justify-center">
            {children}
        </main>
    );
}
