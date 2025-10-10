'use client';

import { create } from 'zustand';
import { type Sublemma } from '@/ai/flows/llm-proof-decomposition';
import { type Message } from '@/components/interactive-chat';
import { type GraphData } from '@/components/proof-graph';
import { decomposeProblemAction } from '@/app/actions';

export type View = 'home' | 'proof';

interface AppState {
  // Types colocated for store consumers
  // Validation result for proof review
  // Duplicated minimal types to avoid circular deps

  // State fields
  view: View;
  problem: string | null;
  sublemmas: Sublemma[];
  messages: Message[];
  loading: boolean;
  error: string | null;
  // Proof display UI state
  isChatOpen: boolean;
  isHistoryOpen: boolean;
  viewMode: 'steps' | 'graph';
  graphData: GraphData | null;
  isGraphLoading: boolean;
  // Proof review/history state
  proofHistory: { sublemmas: Sublemma[]; timestamp: Date; isValid?: boolean }[];
  activeVersionIndex: number;
  isProofEdited: boolean;
  proofValidationResult: { isValid: boolean; feedback: string } | null;
  lastValidatedSublemmas: Sublemma[] | null;
  lastReviewStatus: 'ready' | 'reviewed_ok' | 'reviewed_issues' | 'error';
  lastReviewedAt: Date | null;
  // actions
  startProof: (problem: string) => Promise<void>;
  setMessages: (updater: ((prev: Message[]) => Message[]) | Message[]) => void;
  cancelProof: () => void;
  goHome: () => void;
  reset: () => void;
  // UI actions
  setIsChatOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  setIsHistoryOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  setViewMode: (mode: 'steps' | 'graph') => void;
  setGraphData: (data: GraphData | null | ((prev: GraphData | null) => GraphData | null)) => void;
  setIsGraphLoading: (loading: boolean) => void;
  // Proof state setters
  setSublemmas: (updater: ((prev: Sublemma[]) => Sublemma[]) | Sublemma[]) => void;
  setProofHistory: (
    updater:
      | ((
          prev: { sublemmas: Sublemma[]; timestamp: Date; isValid?: boolean }[],
        ) => { sublemmas: Sublemma[]; timestamp: Date; isValid?: boolean }[])
      | { sublemmas: Sublemma[]; timestamp: Date; isValid?: boolean }[],
  ) => void;
  setActiveVersionIndex: (index: number) => void;
  setIsProofEdited: (edited: boolean) => void;
  setProofValidationResult: (val: { isValid: boolean; feedback: string } | null) => void;
  setLastValidatedSublemmas: (val: Sublemma[] | null) => void;
  setLastReviewStatus: (status: 'ready' | 'reviewed_ok' | 'reviewed_issues' | 'error') => void;
  setLastReviewedAt: (date: Date | null) => void;
}

type StoreData = {
  view: View;
  problem: string | null;
  sublemmas: Sublemma[];
  messages: Message[];
  loading: boolean;
  error: string | null;
  isChatOpen: boolean;
  isHistoryOpen: boolean;
  viewMode: 'steps' | 'graph';
  graphData: GraphData | null;
  isGraphLoading: boolean;
  proofHistory: { sublemmas: Sublemma[]; timestamp: Date; isValid?: boolean }[];
  activeVersionIndex: number;
  isProofEdited: boolean;
  proofValidationResult: { isValid: boolean; feedback: string } | null;
  lastValidatedSublemmas: Sublemma[] | null;
  lastReviewStatus: 'ready' | 'reviewed_ok' | 'reviewed_issues' | 'error';
  lastReviewedAt: Date | null;
};

const initialState: StoreData = {
  view: 'home',
  problem: null,
  sublemmas: [],
  messages: [],
  loading: false,
  error: null,
  // proof display UI defaults
  isChatOpen: false,
  isHistoryOpen: false,
  viewMode: 'steps',
  graphData: null,
  isGraphLoading: false,
  // proof review/history defaults
  proofHistory: [],
  activeVersionIndex: 0,
  isProofEdited: true,
  proofValidationResult: null,
  lastValidatedSublemmas: null,
  lastReviewStatus: 'ready',
  lastReviewedAt: null,
};

export const useAppStore = create<AppState>((set, get) => ({
  ...initialState,

  startProof: async (problem: string) => {
    const trimmed = problem.trim();
    if (!trimmed) return;

    // Initialize state for a new proof run
    set({
      view: 'proof',
      problem: trimmed,
      sublemmas: [],
      messages: [],
      loading: true,
      error: null,
    });

    try {
      // small delay to allow UI to render
      await new Promise((r) => setTimeout(r, 50));
      const result = await decomposeProblemAction(trimmed);
      if (result.success && result.sublemmas) {
        const assistantMessage: Message = {
          role: 'assistant',
          content:
            `Of course. I've broken down the problem into the following steps:\n\n` +
            result.sublemmas
              .map((s: Sublemma, i: number) => `**${s.title}:** ${s.content}`)
              .join('\n\n'),
        };
        set({
          sublemmas: result.sublemmas,
          messages: [assistantMessage],
          loading: false,
          error: null,
        });
      } else {
        set({
          loading: false,
          error: result.error || 'Failed to decompose the problem.',
        });
      }
    } catch (e) {
      set({
        loading: false,
        error: e instanceof Error ? e.message : 'Unexpected error.',
      });
    }
  },

  setMessages: (updater) => {
    if (typeof updater === 'function') {
      set((state) => ({
        messages: (updater as (prev: Message[]) => Message[])(state.messages),
      }));
    } else {
      set({ messages: updater });
    }
  },

  cancelProof: () => {
    set({
      view: 'home',
      problem: null,
      sublemmas: [],
      messages: [],
      loading: false,
      error: null,
    });
  },

  goHome: () => {
    set({ view: 'home' });
  },

  reset: () => {
    set(initialState);
  },

  // UI actions
  setIsChatOpen: (open) => {
    if (typeof open === 'function') {
      set((state) => ({
        isChatOpen: (open as (prev: boolean) => boolean)(state.isChatOpen),
      }));
    } else {
      set({ isChatOpen: open });
    }
  },
  setIsHistoryOpen: (open) => {
    if (typeof open === 'function') {
      set((state) => ({
        isHistoryOpen: (open as (prev: boolean) => boolean)(state.isHistoryOpen),
      }));
    } else {
      set({ isHistoryOpen: open });
    }
  },
  setViewMode: (mode) => set({ viewMode: mode }),
  setGraphData: (data) => {
    if (typeof data === 'function') {
      set((state) => ({
        graphData: (data as (prev: GraphData | null) => GraphData | null)(state.graphData),
      }));
    } else {
      set({ graphData: data });
    }
  },
  setIsGraphLoading: (loading) => set({ isGraphLoading: loading }),

  // Proof state setters
  setSublemmas: (updater) => {
    if (typeof updater === 'function') {
      set((state) => ({
        sublemmas: (updater as (prev: Sublemma[]) => Sublemma[])(state.sublemmas),
      }));
    } else {
      set({ sublemmas: updater });
    }
  },
  setProofHistory: (updater) => {
    if (typeof updater === 'function') {
      set((state) => ({
        proofHistory: (
          updater as (
            prev: {
              sublemmas: Sublemma[];
              timestamp: Date;
              isValid?: boolean;
            }[],
          ) => { sublemmas: Sublemma[]; timestamp: Date; isValid?: boolean }[]
        )(state.proofHistory),
      }));
    } else {
      set({ proofHistory: updater });
    }
  },
  setActiveVersionIndex: (index) => set({ activeVersionIndex: index }),
  setIsProofEdited: (edited) => set({ isProofEdited: edited }),
  setProofValidationResult: (val) => set({ proofValidationResult: val }),
  setLastValidatedSublemmas: (val) => set({ lastValidatedSublemmas: val }),
  setLastReviewStatus: (status) => set({ lastReviewStatus: status }),
  setLastReviewedAt: (date) => set({ lastReviewedAt: date }),
}));
