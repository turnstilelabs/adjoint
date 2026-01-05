import ExploreClientPage from '../../explore/ExploreClientPage';

/**
 * Route alias for Explore.
 *
 * Note: This file is intentionally a Server Component so we can read `searchParams`
 * without triggering Next.js build-time `useSearchParams()` CSR bailout warnings.
 */
export default async function ExplorePage({
    searchParams,
}: {
    searchParams?: Promise<{ q?: string | string[] }>;
}) {
    const sp = (await searchParams) ?? {};
    const qRaw = sp.q;
    const q = Array.isArray(qRaw) ? qRaw[0] : qRaw;

    return <ExploreClientPage q={q} />;
}

