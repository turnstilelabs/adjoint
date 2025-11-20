'use client';

import { create } from 'zustand';
import { type Sublemma } from '@/ai/flows/llm-proof-decomposition';
import { type Message } from '@/components/chat/interactive-chat';
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
  lastProblem: string | null;
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
  retry: () => Promise<void>;
  editProblem: () => void;
  setMessages: (updater: ((prev: Message[]) => Message[]) | Message[]) => void;

  // UI actions
  setIsChatOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  setIsHistoryOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  setViewMode: (mode: 'steps' | 'graph') => void;

  // Proof version management
  setActiveVersionIndex: (index: number) => void;
  addProofVersion: (version: Omit<ProofVersion, 'timestamp'>) => void;
  updateCurrentProofVersion: (updates: Partial<ProofVersion>) => void;

  // Navigation
  goBack: () => void;

  proof: () => ProofVersion;
}

const initialState: StoreData = {
  view: 'home',
  problem: null,
  lastProblem: null,
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
      lastProblem: trimmed,
      messages: [],
      loading: true,
      error: null,
    });

    try {
      // small delay to allow UI to render
      await new Promise((r) => setTimeout(r, 50));
      const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      console.debug('[UI][AppStore] decompose start len=', trimmed.length);
      const result = await decomposeProblemAction(trimmed);
      const t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      console.debug('[UI][AppStore] decompose done ms=', t1 - t0, 'success=', (result as any)?.success);
      if (result.success) {
        // Normalize sublemmas to ensure consistent structure matching Sublemma schema
        const normalizedSublemmas: Sublemma[] = result.sublemmas.map((s: any) => {
          const content = s?.content as string | undefined;
          return {
            title: s?.title ?? '',
            statement: s?.statement ?? content ?? '',
            proof: s?.proof ?? '',
          };
        });

        const assistantMessage: Message = {
          role: 'assistant',
          content:
            `I've broken down the problem into the following steps:\n\n` +
            normalizedSublemmas.map((s: Sublemma) => `**${s.title}:** ${s.statement}`).join('\n\n'),
        };
        set({
          messages: [assistantMessage],
          loading: false,
          error: null,
          proofHistory: [
            {
              sublemmas: normalizedSublemmas,
              timestamp: new Date(),
            },
          ],
          activeVersionIdx: 0,
        });
      } else {
        console.debug('[UI][AppStore] decompose failed error=', (result as any)?.error);
        const err = 'error' in result ? result.error : 'Failed to decompose the problem.';
        set({
          loading: false,
          error: err,
        });
      }
    } catch (e) {
      set({
        loading: false,
        error: e instanceof Error ? e.message : 'Unexpected error.',
        proofHistory: [],
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
    set((state) => ({ ...initialState, lastProblem: state.lastProblem }));
  },

  // Additional actions
  retry: async () => {
    const p = get().lastProblem;
    if (p) {
      await get().startProof(p);
    }
  },
  editProblem: () => {
    set((state) => ({
      ...state,
      view: 'home',
      loading: false,
      error: null,
    }));
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

  // Go back to previous proof version (if any) and ensure steps view
  goBack: () =>
    set((state) => {
      const nextIdx = Math.max(0, state.activeVersionIdx - 1);
      return {
        activeVersionIdx: nextIdx,
        viewMode: 'steps',
      };
    }),

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
