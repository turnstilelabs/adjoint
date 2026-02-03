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

  cancelProofAttempt: () => {
    // Invalidate any in-flight proof attempt callbacks (streaming + fallbacks).
    try {
      set((s) => ({ proofAttemptRunId: (s.proofAttemptRunId || 0) + 1 }));
    } catch { }

    // Abort any in-flight streaming request and cancel any background decomposition.
    try {
      get().cancelCurrent?.();
    } catch { }

    // Cancel any in-flight decomposition (proof-slice uses a module-level run id; calling
    // runDecomposition would be wrong here; instead we reset state that late results check).
    // NOTE: proof-slice also checks a module-level `decomposeRunId`. We can’t bump it here,
    // but we can still clear flags so the UI won’t get stuck.
    // Late arriving decomposition results will append a structured version; that's acceptable,
    // but we also clear `isDecomposing` so the spinner doesn't stick.

    try {
      // This is a module-level run id in proof-slice.ts; bumping it cancels late results.
      // We can’t access it here directly, but we can still clear UI flags so the user isn’t stuck.
    } catch { }

    set((state) => {
      // Keep lastProblem for convenience.
      const lastProblem = state.lastProblem;

      // Keep the workspace doc + chat so canceling a proof doesn’t feel destructive.
      const preserved = {
        workspaceDoc: state.workspaceDoc,
        workspaceMessages: state.workspaceMessages,
        workspaceDraft: state.workspaceDraft,
        workspaceDraftNonce: state.workspaceDraftNonce,
        isWorkspaceChatOpen: state.isWorkspaceChatOpen,
        lastViewBeforeWorkspace: state.lastViewBeforeWorkspace,

        // IMPORTANT: preserve Explore session too.
        // Users often enter Prove from Explore and expect Cancel to return to Explore
        // with the chat + extracted artifacts intact.
        exploreHasSession: state.exploreHasSession,
        exploreSeed: state.exploreSeed,
        exploreMessages: state.exploreMessages,
        exploreArtifacts: state.exploreArtifacts,
        exploreArtifactEdits: state.exploreArtifactEdits,
        exploreTurnId: state.exploreTurnId,
        cancelExploreCurrent: state.cancelExploreCurrent,
      };

      // Return to a safe “home” UI state. (RouteViewSync will set `view` appropriately
      // if the user stays on /prove, but at least we won’t be stuck in loading.)
      return {
        ...initialState,
        ...preserved,
        lastProblem,

        // Ensure we keep the invalidated run id (don't reset back to 0).
        proofAttemptRunId: (state.proofAttemptRunId || 0) + 1,

        loading: false,
        error: null,
        errorDetails: null,
        errorCode: null,
        cancelCurrent: null,
        isDraftStreaming: false,
        liveDraft: '',
        progressLog: [],

        // Proof specific
        isDecomposing: false,
        decomposeError: null,
        pendingSuggestion: null,
        pendingRejection: null,
        attemptSummary: null,
      };
    });
  },

  reset: () => {
    const cancel = get().cancelCurrent || null;
    if (cancel) {
      try {
        cancel();
      } catch { }
    }

    const cancelChat = get().cancelChatCurrent || null;
    if (cancelChat) {
      try {
        cancelChat();
      } catch { }
    }

    const cancelExplore = get().cancelExploreCurrent || null;
    if (cancelExplore) {
      try {
        cancelExplore();
      } catch { }
    }

    const cancelExploreExtraction = get().cancelExploreExtractionCurrent || null;
    if (cancelExploreExtraction) {
      try {
        cancelExploreExtraction();
      } catch { }
    }

    const cancelWorkspace = get().cancelWorkspaceCurrent || null;
    if (cancelWorkspace) {
      try {
        cancelWorkspace();
      } catch { }
    }

    const cancelWorkspaceChat = get().cancelWorkspaceChatCurrent || null;
    if (cancelWorkspaceChat) {
      try {
        cancelWorkspaceChat();
      } catch { }
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
