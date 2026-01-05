import { NextResponse } from 'next/server';

// Kept for completeness, though the unlock page now sets this cookie directly.
// Must stay in sync with `middleware.ts` and `unlock/page.tsx`.
const UNLOCK_COOKIE_NAME = 'adjoint_unlocked_v2';

export async function POST(request: Request) {
    const contentType = request.headers.get('content-type') || '';
    let password = '';
    let next = '/';

    if (contentType.includes('application/json')) {
        const body = await request.json().catch(() => ({}));
        password = body.password ?? '';
        next = body.next ?? '/';
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
        const formData = await request.formData();
        password = String(formData.get('password') ?? '');
        next = String(formData.get('next') ?? '/') || '/';
    }

    const expected = process.env.APP_UNLOCK_PASSWORD;

    if (!expected) {
        // Gate is always-on in this deployment. If the password is not configured,
        // fail closed rather than silently unlocking the app.
        return NextResponse.json(
            {
                ok: false,
                error: 'Unlock password not configured. Set APP_UNLOCK_PASSWORD on the server.',
            },
            { status: 500 }
        );
    }

    if (password !== expected) {
        return NextResponse.json({ ok: false, error: 'Invalid password' }, { status: 401 });
    }

    const res = NextResponse.json({ ok: true, next });
    res.cookies.set(UNLOCK_COOKIE_NAME, '1', {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 60 * 60 * 24, // 24 hours
    });

    return res;
}
