import WorkspaceClientPage from '../../workspace/WorkspaceClientPage';

/**
 * Route entry for Workspace mode.
 */
export default async function WorkspacePage({
    searchParams,
}: {
    searchParams?: Promise<{ seed?: string | string[]; new?: string | string[] }>;
}) {
    const sp = (await searchParams) ?? {};
    const seedRaw = sp.seed;
    const seed = Array.isArray(seedRaw) ? seedRaw[0] : seedRaw;

    const newRaw = sp.new;
    const isNew = (Array.isArray(newRaw) ? newRaw[0] : newRaw) === '1';

    return <WorkspaceClientPage seed={seed} isNew={isNew} />;
}

