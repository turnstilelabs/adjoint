import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { isUnlockEnabled } from '@/lib/unlock';

const UNLOCK_COOKIE_NAME = 'adjoint_unlocked_v2';

export default async function ProtectedLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    // Gate is optional. When disabled (default for local dev), do not redirect.
    if (!isUnlockEnabled()) {
        return children;
    }

    const cookieStore = await cookies();
    const unlocked = cookieStore.get(UNLOCK_COOKIE_NAME)?.value === '1';

    if (!unlocked) {
        const hdrs = await headers();
        const nextUrl = hdrs.get('next-url') ?? hdrs.get('x-invoke-path') ?? '/';
        redirect(`/unlock?next=${encodeURIComponent(nextUrl)}`);
    }

    return children;
}
