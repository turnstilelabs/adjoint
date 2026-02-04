'use client';

import type { AppState } from '@/state/store.types';

export const createUiSlice = (
  set: any,
  get: any,
): Pick<
  AppState,
  | 'goHome'
  | 'setChatDraft'
  | 'setExploreDraft'
  | 'setChatCancelCurrent'
  | 'setIsChatOpen'
  | 'setProofChatPanelWidth'
  | 'setIsHistoryOpen'
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

  setChatCancelCurrent: (cancel) => set({ cancelChatCurrent: cancel }),

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

  setProofChatPanelWidth: (widthPx) => {
    const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
    const next = clamp(Number(widthPx) || 0, 320, 720);
    set({ proofChatPanelWidth: next });
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('adjoint.proof.chatPanelWidth.v1', String(next));
      }
    } catch {
      // ignore
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
