/**
 * Unlock gate enablement helper.
 *
 * Design goals:
 * - Local dev (NODE_ENV !== 'production'): unlock gate OFF by default.
 * - Production (NODE_ENV === 'production'): unlock gate ON by default.
 * - Can be overridden explicitly with APP_UNLOCK_ENABLED.
 *
 * IMPORTANT: This module must remain dependency-free and edge-runtime safe,
 * since it is imported from `middleware.ts`.
 */
export function isUnlockEnabled(): boolean {
    const flag = process.env.APP_UNLOCK_ENABLED;

    // In production deployments, default to enabled (fail closed if password missing).
    if (process.env.NODE_ENV === 'production') {
        return flag !== 'FALSE';
    }

    // In dev/test, default to disabled.
    return flag === 'TRUE';
}

