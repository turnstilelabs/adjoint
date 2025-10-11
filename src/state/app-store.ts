'use client';

import { create } from 'zustand';
import { type Sublemma } from '@/ai/flows/llm-proof-decomposition';
import { type Message } from '@/components/interactive-chat';
import { type GraphData } from '@/components/proof-graph';
import { decomposeProblemAction } from '@/app/actions';

export type View = 'home' | 'proof';

export type ProofVersion = {
  sublemmas: Sublemma[];
  timestamp: Date;
  validationResult?: ProofValidationResult;
  graphData?: GraphData;
};
export type ProofValidationResult = {
  isError?: boolean;
  isValid?: boolean;
  feedback: string;
  timestamp: Date;
};

type StoreData = {
  view: View;
  problem: string | null;
  messages: Message[];
  loading: boolean;
  error: string | null;
  isChatOpen: boolean;
  isHistoryOpen: boolean;
  viewMode: 'steps' | 'graph';
  proofHistory: ProofVersion[];
  activeVersionIdx: number;
};

interface AppState extends StoreData {
  reset: () => void;

  startProof: (problem: string) => Promise<void>;
  setMessages: (updater: ((prev: Message[]) => Message[]) | Message[]) => void;

  // UI actions
  setIsChatOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  setIsHistoryOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  setViewMode: (mode: 'steps' | 'graph') => void;

  // Proof version management
  setActiveVersionIndex: (index: number) => void;
  addProofVersion: (version: Omit<ProofVersion, 'timestamp'>) => void;
  updateCurrentProofVersion: (updates: Partial<ProofVersion>) => void;

  proof: () => ProofVersion;
}

const initialState: StoreData = {
  view: 'home',
  problem: null,
  messages: [],
  loading: false,
  error: null,
  // proof display UI defaults
  isChatOpen: false,
  isHistoryOpen: false,
  viewMode: 'steps',
  // proof review/history defaults
  proofHistory: [],
  activeVersionIdx: 0,
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
            `I've broken down the problem into the following steps:\n\n` +
            result.sublemmas
              .map((s: Sublemma, i: number) => `**${s.title}:** ${s.content}`)
              .join('\n\n'),
        };
        set({
          messages: [assistantMessage],
          loading: false,
          error: null,
          proofHistory: [{ sublemmas: result.sublemmas, timestamp: new Date() }],
          activeVersionIdx: 0,
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

  reset: () => {
    set(initialState);
  },

  // UI actions
  setIsChatOpen: (open) => {
    if (typeof open === 'function') {
      set((state) => ({
        isChatOpen: open(state.isChatOpen),
      }));
    } else {
      set({ isChatOpen: open });
    }
  },
  setIsHistoryOpen: (open) => {
    if (typeof open === 'function') {
      set((state) => ({
        isHistoryOpen: open(state.isHistoryOpen),
      }));
    } else {
      set({ isHistoryOpen: open });
    }
  },
  setViewMode: (mode) => set({ viewMode: mode }),

  setActiveVersionIndex: (index) => set({ activeVersionIdx: index }),

  addProofVersion: (version) =>
    set((state) => ({
      proofHistory: [...state.proofHistory, { ...version, timestamp: new Date() }],
      activeVersionIdx: state.proofHistory.length,
    })),
  updateCurrentProofVersion: (updates: Partial<ProofVersion>) =>
    set((state) => ({
      proofHistory: state.proofHistory.map((version, idx) =>
        idx === state.activeVersionIdx ? { ...version, ...updates } : version,
      ),
    })),

  proof: () => get().proofHistory[get().activeVersionIdx],
}));
