import ProveClientPage from '../../prove/ProveClientPage';

/**
 * Route entry for Prove mode.
 *
 * Kept as a Server Component wrapper so we can safely read `searchParams`.
 */
export default async function ProvePage({
    searchParams,
}: {
    searchParams?: Promise<{ q?: string | string[] }>;
}) {
    const sp = (await searchParams) ?? {};
    const qRaw = sp.q;
    const q = Array.isArray(qRaw) ? qRaw[0] : qRaw;

    return <ProveClientPage q={q} />;
}

