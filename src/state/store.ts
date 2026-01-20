'use client';

import { create } from 'zustand';

import type { AppState } from '@/state/store.types';
import { initialState } from '@/state/store.initial';
import { createUiSlice } from '@/state/slices/ui-slice';
import { createWorkspaceSlice } from '@/state/slices/workspace-slice';
import { createExploreSlice } from '@/state/slices/explore-slice';
import { createProofSlice } from '@/state/slices/proof-slice';

export const useAppStore = create<AppState>((set, get) => ({
  ...initialState,
  ...createUiSlice(set, get),
  ...createWorkspaceSlice(set, get),
  ...createExploreSlice(set, get),
  ...createProofSlice(set, get),

  reset: () => {
    const cancel = get().cancelCurrent || null;
    if (cancel) {
      try {
        cancel();
      } catch {}
    }
    const cancelExplore = get().cancelExploreCurrent || null;
    if (cancelExplore) {
      try {
        cancelExplore();
      } catch {}
    }
    set((state) => ({
      ...initialState,
      // Keep lastProblem for convenience.
      lastProblem: state.lastProblem,
      // Keep workspace doc + chat so reset doesn't feel destructive.
      workspaceDoc: state.workspaceDoc,
      workspaceMessages: state.workspaceMessages,
      workspaceDraft: state.workspaceDraft,
      workspaceDraftNonce: state.workspaceDraftNonce,
      isWorkspaceChatOpen: state.isWorkspaceChatOpen,
      lastViewBeforeWorkspace: state.lastViewBeforeWorkspace,
    }));
  },
}));
