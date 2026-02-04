import ExploreClientPage from '../../explore/ExploreClientPage';
import { ROUTE_PAYLOAD_MAX_QUERY_CHARS } from '@/lib/route-payload';

/**
 * Route alias for Explore.
 *
 * Note: This file is intentionally a Server Component so we can read `searchParams`
 * without triggering Next.js build-time `useSearchParams()` CSR bailout warnings.
 */
export default async function ExplorePage({
    searchParams,
}: {
    searchParams?: Promise<{ q?: string | string[]; sid?: string | string[]; new?: string | string[] }>;
}) {
    const sp = (await searchParams) ?? {};
    const qRaw = sp.q;
    const qCandidate = Array.isArray(qRaw) ? qRaw[0] : qRaw;
    // Hard guard: never allow huge query payloads to hydrate the client.
    // Very long URLs can crash browsers and exceed proxy/header limits.
    const q =
        typeof qCandidate === 'string' && qCandidate.length <= ROUTE_PAYLOAD_MAX_QUERY_CHARS
            ? qCandidate
            : undefined;

    const sidRaw = sp.sid;
    const sid = Array.isArray(sidRaw) ? sidRaw[0] : sidRaw;

    const newRaw = sp.new;
    const isNew = (Array.isArray(newRaw) ? newRaw[0] : newRaw) === '1';

    return <ExploreClientPage q={q} sid={sid} isNew={isNew} />;
}
