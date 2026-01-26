'use client';

import type { AppState } from '@/state/store.types';

export const createUiSlice = (
  set: any,
  get: any,
): Pick<
  AppState,
  'goHome' | 'setChatDraft' | 'setExploreDraft' | 'setIsChatOpen' | 'setIsHistoryOpen'
> => ({
  goHome: () => {
    set({ view: 'home' });
  },

  setChatDraft: (text, opts) => {
    const t = String(text ?? '');
    set((s: AppState) => ({
      chatDraft: t,
      chatDraftNonce: (s.chatDraftNonce || 0) + 1,
      // In proof mode, optionally open the chat panel.
      isChatOpen: opts?.open ? true : s.isChatOpen,
    }));
  },

  setExploreDraft: (text) => {
    const t = String(text ?? '');
    set((s: AppState) => ({
      exploreDraft: t,
      exploreDraftNonce: (s.exploreDraftNonce || 0) + 1,
    }));
  },

  // UI actions
  setIsChatOpen: (open) => {
    if (typeof open === 'function') {
      set((state: AppState) => ({
        isChatOpen: open(state.isChatOpen),
      }));
    } else {
      set({ isChatOpen: open });
    }
  },
  setIsHistoryOpen: (open) => {
    if (typeof open === 'function') {
      set((state: AppState) => ({
        isHistoryOpen: open(state.isHistoryOpen),
      }));
    } else {
      set({ isHistoryOpen: open });
    }
  },
});
