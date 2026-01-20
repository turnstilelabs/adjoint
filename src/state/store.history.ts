'use client';

import type { View } from '@/state/store.types';

/**
 * Minimal browser history integration for the in-app view state.
 *
 * Why: our app uses a single Next.js route and switches modes via Zustand state.
 * If users use the browser Back/Forward buttons, we still want to restore the
 * previous in-app view (e.g. Workspace -> Prove) without losing the current
 * proof/explore session.
 */
export const pushAppViewToHistory = (
  view: View,
  extra?: { lastViewBeforeWorkspace?: View | null },
) => {
  if (typeof window === 'undefined') return;
  try {
    const cur = window.history.state as any;
    // Avoid pushing duplicate entries.
    if (cur?.adjointInternal === true && cur?.adjointView === view) return;
    window.history.pushState(
      {
        ...(cur || {}),
        adjointInternal: true,
        adjointView: view,
        adjointLastViewBeforeWorkspace: extra?.lastViewBeforeWorkspace ?? null,
      },
      '',
      window.location.href,
    );
  } catch {
    // ignore
  }
};
