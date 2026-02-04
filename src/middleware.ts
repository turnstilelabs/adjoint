import { NextRequest, NextResponse } from 'next/server';

import { isUnlockEnabled } from './lib/unlock';

// Versioned cookie name so older unlock cookies (from previous implementations)
// do not silently bypass the gate.
const UNLOCK_COOKIE_NAME = 'adjoint_unlocked_v2';

// Short-lived cookie for deep-link return after unlocking.
const NEXT_AFTER_UNLOCK_COOKIE_NAME = 'adjoint_next_after_unlock';

// Keep this cookie safely below typical header limits.
// This cookie is only used to redirect after unlocking; if it is too long,
// we fall back to a safe route rather than risking header/cookie overflows.
const MAX_NEXT_AFTER_UNLOCK_CHARS = 1500;

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // DEV DEBUG: help diagnose env visibility differences between Edge (middleware)
    // and Node (API routes). Can be inspected via `curl -I ... | grep x-adjoint`.
    const debugHeaders: Record<string, string> =
        process.env.NODE_ENV === 'development'
            ? {
                'x-adjoint-mw-unlock-enabled': String(isUnlockEnabled()),
            }
            : {};

    // Gate is optional. When disabled (default for local dev), do not intercept routes.
    if (!isUnlockEnabled()) {
        const res = NextResponse.next();
        for (const [k, v] of Object.entries(debugHeaders)) res.headers.set(k, v);
        return res;
    }

    // IMPORTANT: Don't intercept Next.js internal Server Action POSTs.
    // These requests include a `next-action` header and must reach Next's action handler.
    // Redirecting them (e.g. to /unlock) results in:
    // "Failed to find Server Action ... This request might be from an older or newer deployment."
    if (request.method === 'POST' && request.headers.has('next-action')) {
        const res = NextResponse.next();
        for (const [k, v] of Object.entries(debugHeaders)) res.headers.set(k, v);
        return res;
    }

    // Allow the unlock page and its API endpoint without a cookie
    if (pathname.startsWith('/unlock') || pathname.startsWith('/api/unlock')) {
        const res = NextResponse.next();
        for (const [k, v] of Object.entries(debugHeaders)) res.headers.set(k, v);
        return res;
    }

    // Allow Next.js internals and static assets
    if (
        pathname.startsWith('/_next') ||
        pathname.startsWith('/favicon.ico') ||
        pathname.startsWith('/icon.svg') ||
        pathname.startsWith('/assets')
    ) {
        const res = NextResponse.next();
        for (const [k, v] of Object.entries(debugHeaders)) res.headers.set(k, v);
        return res;
    }

    const unlocked = request.cookies.get(UNLOCK_COOKIE_NAME)?.value === '1';

    if (unlocked) {
        const res = NextResponse.next();
        for (const [k, v] of Object.entries(debugHeaders)) res.headers.set(k, v);
        return res;
    }

    // Preserve full path + query string so unlock can return you to the deep link.
    // Use the raw request URL to avoid any NextURL normalization quirks.
    const u = new URL(request.url);
    let next = `${u.pathname}${u.search}` || '/';

    // If the deep link is massive (e.g. /prove?q=<very long>), do not store it in a cookie.
    // Storing huge values can exceed proxy/header limits and break navigation.
    if (next.length > MAX_NEXT_AFTER_UNLOCK_CHARS) {
        // Preserve the route (mode) but drop the massive query string.
        // (Users can re-enter the statement after unlocking.)
        next = u.pathname || '/';
    }

    const url = request.nextUrl.clone();
    url.pathname = '/unlock';
    url.search = '';

    const res = NextResponse.redirect(url);
    res.cookies.set(NEXT_AFTER_UNLOCK_COOKIE_NAME, next, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 60 * 5, // 5 minutes
    });

    for (const [k, v] of Object.entries(debugHeaders)) res.headers.set(k, v);
    return res;
}

// Run on all routes; logic above whitelists assets & unlock endpoints.
// Using the recommended catch-all matcher so we don't miss any entry route.
export const config = {
    matcher: '/:path*',
};

