import { NextRequest, NextResponse } from 'next/server';

import { isUnlockEnabled } from './src/lib/unlock';

// Versioned cookie name so older unlock cookies (from previous implementations)
// do not silently bypass the gate.
const UNLOCK_COOKIE_NAME = 'adjoint_unlocked_v2';

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Gate is optional. When disabled (default for local dev), do not intercept routes.
    if (!isUnlockEnabled()) {
        return NextResponse.next();
    }

    // IMPORTANT: Don't intercept Next.js internal Server Action POSTs.
    // These requests include a `next-action` header and must reach Next's action handler.
    // Redirecting them (e.g. to /unlock) results in:
    // "Failed to find Server Action ... This request might be from an older or newer deployment."
    if (request.method === 'POST' && request.headers.has('next-action')) {
        return NextResponse.next();
    }

    // Allow the unlock page and its API endpoint without a cookie
    if (pathname.startsWith('/unlock') || pathname.startsWith('/api/unlock')) {
        return NextResponse.next();
    }

    // Allow Next.js internals and static assets
    if (
        pathname.startsWith('/_next') ||
        pathname.startsWith('/favicon.ico') ||
        pathname.startsWith('/icon.svg') ||
        pathname.startsWith('/assets')
    ) {
        return NextResponse.next();
    }

    const unlocked = request.cookies.get(UNLOCK_COOKIE_NAME)?.value === '1';

    if (unlocked) {
        return NextResponse.next();
    }

    const url = request.nextUrl.clone();
    url.pathname = '/unlock';
    url.searchParams.set('next', pathname || '/');

    return NextResponse.redirect(url);
}

// Run on all routes; logic above whitelists assets & unlock endpoints.
// Using the recommended catch-all matcher so we don't miss any entry route.
export const config = {
    matcher: '/:path*',
};
