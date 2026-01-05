import { Suspense } from 'react';
import UnlockClient from './UnlockClient';

export default function UnlockPage() {
    // `useSearchParams()` (used inside UnlockClient) triggers a CSR bailout and must be
    // wrapped in a Suspense boundary to satisfy Next.js prerendering constraints.
    return (
        <Suspense fallback={null}>
            <UnlockClient />
        </Suspense>
    );
}

