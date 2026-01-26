import { isUnlockEnabled } from '@/lib/unlock';

export default async function ProtectedLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    // IMPORTANT:
    // The unlock gate is enforced at the Edge via `middleware.ts`.
    // Keeping redirect logic here (server components) causes unreliable `next` URLs
    // because request headers can be inconsistent in dev/prod.
    // This layout remains only for grouping protected routes.
    void isUnlockEnabled();
    return children;
}
