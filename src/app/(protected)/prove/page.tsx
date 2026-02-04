import ProveClientPage from '../../prove/ProveClientPage';
import { ROUTE_PAYLOAD_MAX_QUERY_CHARS } from '@/lib/route-payload';

/**
 * Route entry for Prove mode.
 *
 * Kept as a Server Component wrapper so we can safely read `searchParams`.
 */
export default async function ProvePage({
    searchParams,
}: {
    searchParams?: Promise<{ q?: string | string[]; sid?: string | string[] }>;
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

    return <ProveClientPage q={q} sid={sid} />;
}

