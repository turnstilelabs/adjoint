'use client';

import { create } from 'zustand';
import { type Sublemma } from '@/ai/flows/llm-proof-decomposition';
import { type Message } from '@/components/chat/interactive-chat';
import { type GraphData } from '@/components/proof-graph';
import { attemptProofAction, attemptProofActionForce, decomposeRawProofAction } from '@/app/actions';

export type View = 'home' | 'proof';

export type ProofVersion = {
  sublemmas: Sublemma[];
  timestamp: Date;
  validationResult?: ProofValidationResult;
  graphData?: GraphData;
};

export type PendingSuggestion = {
  suggested: string; // model-proposed final statement
  variantType: 'WEAKENING' | 'OPPOSITE';
  provedStatement: string; // extracted from raw proof decomposition
  sublemmas: Sublemma[]; // pre-decomposed steps for instant accept
  explanation: string;
  normalizedProof?: string; // full normalized proof text for fallback rendering
  rawProof?: string; // original raw proof text for fallback rendering
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
  pendingSuggestion: PendingSuggestion | null;
  pendingRejection: { explanation: string } | null;
};

interface AppState extends StoreData {
  reset: () => void;

  startProof: (problem: string, opts?: { force?: boolean }) => Promise<void>;
  retry: () => Promise<void>;
  editProblem: () => void;
  setMessages: (updater: ((prev: Message[]) => Message[]) | Message[]) => void;

  // Variant handling
  acceptSuggestedChange: () => void;
  clearSuggestion: () => void;
  clearRejection: () => void;

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
  pendingSuggestion: null,
  pendingRejection: null,
};

export const useAppStore = create<AppState>((set, get) => ({
  ...initialState,

  startProof: async (problem: string, opts?: { force?: boolean }) => {
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
      pendingSuggestion: null,
      pendingRejection: null,
      proofHistory: [],
      activeVersionIdx: 0,
    });

    try {
      await new Promise((r) => setTimeout(r, 50));
      const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      console.debug('[UI][AppStore] attemptProof start len=', trimmed.length);
      const attempt = opts?.force
        ? await attemptProofActionForce(trimmed)
        : await attemptProofAction(trimmed);
      const t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      console.debug('[UI][AppStore] attemptProof done ms=', t1 - t0, 'success=', (attempt as any)?.success);

      if (!attempt.success) {
        set({ loading: false, error: attempt.error || 'Failed to attempt proof.' });
        return;
      }

      if (attempt.status === 'FAILED') {
        set({
          loading: false,
          error: null,
          pendingRejection: { explanation: attempt.explanation || 'No details provided.' },
          proofHistory: [],
          activeVersionIdx: 0,
        });
        return;
      }

      // We have some proof text; decompose it
      const d0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      const decomp = await decomposeRawProofAction(attempt.rawProof || '');
      const d1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      console.debug('[UI][AppStore] decomposeRawProof done ms=', d1 - d0, 'success=', (decomp as any)?.success);
      if (decomp && (decomp as any).success) {
        console.debug('[UI][AppStore] decomposeRawProof lengths', {
          provedLen: (decomp as any).provedStatement?.length ?? 0,
          steps: (decomp as any).sublemmas?.length ?? 0,
          normLen: (decomp as any).normalizedProof?.length ?? 0,
          rawLen: attempt.rawProof?.length ?? 0,
        });
      }

      if (!decomp.success) {
        set({
          loading: false,
          error: 'Failed to parse the proof produced by AI.',
          proofHistory: [],
        });
        return;
      }

      if (attempt.status === 'PROVED_AS_IS') {
        const steps: Sublemma[] = (decomp.sublemmas && decomp.sublemmas.length > 0)
          ? (decomp.sublemmas as Sublemma[])
          : ([{
            title: 'Proof',
            statement: decomp.provedStatement,
            proof: (decomp as any).normalizedProof || attempt.rawProof || 'Proof unavailable.',
          }] as Sublemma[]);
        console.debug('[UI][AppStore] provedAsIs steps', steps.length);
        const assistantMessage: Message = {
          role: 'assistant',
          content:
            `I've broken down the proof into the following steps:\n\n` +
            steps.map((s: Sublemma) => `**${s.title}:** ${s.statement}`).join('\n\n'),
        };
        set({
          messages: [assistantMessage],
          loading: false,
          error: null,
          proofHistory: [
            {
              sublemmas: steps,
              timestamp: new Date(),
            },
          ],
          activeVersionIdx: 0,
        });
        return;
      }

      // PROVED_VARIANT: hold suggestion, do not show proof until accept
      set({
        loading: false,
        error: null,
        pendingSuggestion: {
          suggested: attempt.finalStatement || decomp.provedStatement,
          variantType: (attempt.variantType as 'WEAKENING' | 'OPPOSITE') || 'WEAKENING',
          provedStatement: decomp.provedStatement,
          sublemmas: decomp.sublemmas as Sublemma[],
          explanation: attempt.explanation,
          normalizedProof: (decomp as any).normalizedProof,
          rawProof: attempt.rawProof || undefined,
        },
        // Keep an empty proof version to avoid crashes; review button will be disabled
        proofHistory: [
          {
            sublemmas: [],
            timestamp: new Date(),
          },
        ],
        activeVersionIdx: 0,
      });
      try {
        console.debug('[UI][AppStore] pendingSuggestion set', {
          variantType: attempt.variantType,
          steps: (decomp as any).sublemmas?.length ?? 0,
          provedLen: (decomp as any).provedStatement?.length ?? 0,
        });
      } catch { }
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
      await get().startProof(p, { force: true });
    }
  },
  editProblem: () => {
    set((state) => ({
      ...state,
      view: 'home',
      loading: false,
      error: null,
      pendingSuggestion: null,
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

  acceptSuggestedChange: () => {
    const s = get().pendingSuggestion;
    if (!s) return;
    const steps: Sublemma[] = (s.sublemmas && s.sublemmas.length > 0)
      ? s.sublemmas
      : ([{
        title: 'Proof',
        statement: s.provedStatement,
        proof: s.normalizedProof || s.rawProof || s.explanation || 'Proof unavailable.',
      }] as Sublemma[]);
    try {
      console.debug('[UI][AppStore] acceptSuggestedChange', {
        stepsBefore: s.sublemmas?.length ?? 0,
        usedFallback: !(s.sublemmas && s.sublemmas.length > 0),
      });
    } catch { }
    set({
      problem: s.provedStatement,
      pendingSuggestion: null,
      proofHistory: [
        {
          sublemmas: steps,
          timestamp: new Date(),
        },
      ],
      activeVersionIdx: 0,
      messages: [
        {
          role: 'assistant',
          content:
            `I've broken down the proof into the following steps:\n\n` +
            steps.map((x) => `**${x.title}:** ${x.statement}`).join('\n\n'),
        } as Message,
      ],
    });
  },

  clearSuggestion: () => set({ pendingSuggestion: null }),
  clearRejection: () => set({ pendingRejection: null }),

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
