import { Suspense } from 'react';
import { redirect } from 'next/navigation';

import { isUnlockEnabled } from '@/lib/unlock';

import UnlockClient from './UnlockClient';

export default async function UnlockPage({
    searchParams,
}: {
    // Next.js 15 types App Router `searchParams` as a Promise.
    searchParams?: Promise<{ next?: string }>;
}) {
    // When the gate is disabled (default for local dev), the unlock page should
    // not be reachable.
    if (!isUnlockEnabled()) {
        const sp = (await searchParams) ?? {};
        redirect(sp.next || '/');
    }

    // `useSearchParams()` (used inside UnlockClient) triggers a CSR bailout and must be
    // wrapped in a Suspense boundary to satisfy Next.js prerendering constraints.
    return (
        <Suspense fallback={null}>
            <UnlockClient />
        </Suspense>
    );
}
