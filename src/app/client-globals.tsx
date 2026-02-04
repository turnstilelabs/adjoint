'use client';

import { WarmupClient } from '@/components/warmup-client';
import { GlobalSelectionOverlay } from '@/components/global-selection-overlay';
import { VerifyDialogController } from '@/components/sympy/verify-dialog';
import FeedbackWidget from '@/components/feedback/feedback-widget';
import { Toaster } from '@/components/ui/toaster';

/**
 * Client-only global UI mounted from the (server) app layout.
 *
 * Keeping these imports out of `src/app/layout.tsx` prevents the app layout
 * from becoming a huge client chunk (which can cause ChunkLoadError timeouts
 * during dev/HMR).
 */
export function ClientGlobals() {
    return (
        <>
            <WarmupClient />
            <GlobalSelectionOverlay />
            <VerifyDialogController />
            {/* Global, non-intrusive feedback widget */}
            <FeedbackWidget />
            <Toaster />
        </>
    );
}
