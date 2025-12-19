'use client';

import { create } from 'zustand';
import { type Sublemma } from '@/ai/flows/llm-proof-decomposition';
import { type Message } from '@/components/chat/interactive-chat';
import { type GraphData } from '@/components/proof-graph';
import type { ExploreArtifacts } from '@/ai/exploration-assistant/exploration-assistant.schemas';
import { attemptProofAction, attemptProofActionForce, decomposeRawProofAction } from '@/app/actions';

export type View = 'home' | 'explore' | 'proof';

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
  model?: string;
};

type StoreData = {
  view: View;
  problem: string | null;
  lastProblem: string | null;
  messages: Message[];

  // Explore mode
  exploreSeed: string | null;
  exploreMessages: Message[];
  exploreArtifacts: ExploreArtifacts | null;
  /**
   * User edits overlay for extracted artifacts.
   * Keyed by the original extracted string -> edited string.
   */
  exploreArtifactEdits: {
    candidateStatements: Record<string, string>;
    /**
     * Non-statement artifacts are scoped per candidate statement (keyed by the original statement string).
     */
    perStatement: Record<
      string,
      {
        assumptions: Record<string, string>;
        examples: Record<string, string>;
        counterexamples: Record<string, string>;
        openQuestions: Record<string, string>;
      }
    >;
  };
  exploreTurnId: number;
  cancelExploreCurrent?: (() => void) | null;

  loading: boolean;
  error: string | null;
  errorDetails: string | null;
  errorCode: string | null;
  isChatOpen: boolean;
  isHistoryOpen: boolean;
  viewMode: 'steps' | 'graph';
  proofHistory: ProofVersion[];
  activeVersionIdx: number;
  pendingSuggestion: PendingSuggestion | null;
  pendingRejection: { explanation: string } | null;
  // Streaming progress
  progressLog: string[];
  // Cancel the current in-flight streaming request (if any)
  cancelCurrent?: (() => void) | null;
  // Live draft streaming (token-level)
  liveDraft: string;
  isDraftStreaming: boolean;
};

interface AppState extends StoreData {
  reset: () => void;

  // Explore navigation / state
  startExplore: (seed?: string) => void;
  setExploreMessages: (updater: ((prev: Message[]) => Message[]) | Message[]) => void;
  setExploreArtifacts: (artifacts: ExploreArtifacts | null) => void;
  setExploreArtifactEdit: (opts: {
    kind: 'candidateStatements' | 'assumptions' | 'examples' | 'counterexamples' | 'openQuestions';
    /** Candidate statement key for non-candidate edits. */
    statementKey?: string;
    original: string;
    edited: string;
  }) => void;
  clearExploreArtifactEdits: () => void;
  bumpExploreTurnId: () => number;
  getExploreTurnId: () => number;
  setExploreCancelCurrent: (cancel: (() => void) | null) => void;
  promoteToProof: (statement: string) => Promise<void>;

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

  exploreSeed: null,
  exploreMessages: [],
  exploreArtifacts: null,
  exploreArtifactEdits: {
    candidateStatements: {},
    perStatement: {},
  },
  exploreTurnId: 0,
  cancelExploreCurrent: null,

  loading: false,
  error: null,
  errorDetails: null,
  errorCode: null,
  // proof display UI defaults
  isChatOpen: false,
  isHistoryOpen: false,
  viewMode: 'steps',
  // proof review/history defaults
  proofHistory: [],
  activeVersionIdx: 0,
  pendingSuggestion: null,
  pendingRejection: null,
  progressLog: [],
  cancelCurrent: null,
  liveDraft: '',
  isDraftStreaming: false,
};

export const useAppStore = create<AppState>((set, get) => ({
  ...initialState,

  startExplore: (seed?: string) => {
    // Cancel any in-flight explore stream
    const cancel = get().cancelExploreCurrent || null;
    if (cancel) {
      try { cancel(); } catch { }
    }

    const trimmed = seed?.trim() ? seed.trim() : null;

    // If a new seed is provided (coming from Home), start a fresh explore session.
    if (trimmed) {
      set({
        view: 'explore',
        exploreSeed: trimmed,
        exploreMessages: [],
        exploreArtifacts: null,
        exploreArtifactEdits: {
          candidateStatements: {},
          perStatement: {},
        },
        exploreTurnId: 0,
      });
      return;
    }

    // Otherwise, preserve any existing thread (direct revisit of /explore).
    set({
      view: 'explore',
      exploreSeed: get().exploreSeed,
      exploreMessages: get().exploreMessages.length ? get().exploreMessages : [],
      exploreArtifacts: get().exploreArtifacts,
    });
  },

  setExploreMessages: (updater) => {
    if (typeof updater === 'function') {
      set((state) => ({
        exploreMessages: (updater as (prev: Message[]) => Message[])(state.exploreMessages),
      }));
    } else {
      set({ exploreMessages: updater });
    }
  },

  setExploreArtifacts: (artifacts) => set({ exploreArtifacts: artifacts }),

  setExploreArtifactEdit: ({ kind, statementKey, original, edited }) => {
    const o = (original ?? '').trim();
    if (!o) return;
    const e = (edited ?? '').trim();

    if (kind === 'candidateStatements') {
      set((state) => ({
        exploreArtifactEdits: {
          ...state.exploreArtifactEdits,
          candidateStatements: {
            ...state.exploreArtifactEdits.candidateStatements,
            [o]: e,
          },
        },
      }));
      return;
    }

    const sk = (statementKey ?? '').trim();
    if (!sk) return;

    set((state) => {
      const prevForStmt = state.exploreArtifactEdits.perStatement[sk] ?? {
        assumptions: {},
        examples: {},
        counterexamples: {},
        openQuestions: {},
      };

      return {
        exploreArtifactEdits: {
          ...state.exploreArtifactEdits,
          perStatement: {
            ...state.exploreArtifactEdits.perStatement,
            [sk]: {
              ...prevForStmt,
              [kind]: {
                ...prevForStmt[kind],
                [o]: e,
              },
            },
          },
        },
      };
    });
  },

  clearExploreArtifactEdits: () =>
    set({
      exploreArtifactEdits: {
        candidateStatements: {},
        perStatement: {},
      },
    }),

  bumpExploreTurnId: () => {
    const next = get().exploreTurnId + 1;
    set({ exploreTurnId: next });
    return next;
  },

  getExploreTurnId: () => get().exploreTurnId,

  setExploreCancelCurrent: (cancel) => set({ cancelExploreCurrent: cancel }),

  promoteToProof: async (statement: string) => {
    const trimmed = statement.trim();
    if (!trimmed) return;
    // Keep explore context in store; switch view to proof via startProof
    await get().startProof(trimmed);
  },

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
      errorDetails: null,
      errorCode: null,
      pendingSuggestion: null,
      pendingRejection: null,
      proofHistory: [],
      activeVersionIdx: 0,
      progressLog: ['Starting proof attempt...'],
      cancelCurrent: null,
      liveDraft: '',
      isDraftStreaming: false,
    });

    const appendLog = (line: string) => set((s) => ({ progressLog: [...s.progressLog, line] }));

    // Fallback non-streaming implementation (existing behavior)
    const runNonStreaming = async () => {
      await new Promise((r) => setTimeout(r, 50));
      const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      console.debug('[UI][AppStore] attemptProof(start, non-stream) len=', trimmed.length);
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

      const d0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      const decomp = await decomposeRawProofAction(attempt.rawProof || '');
      const d1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      console.debug('[UI][AppStore] decomposeRawProof done ms=', d1 - d0, 'success=', (decomp as any)?.success);

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

      set({
        loading: false,
        error: null,
        pendingSuggestion: {
          suggested: attempt.finalStatement || (decomp as any).provedStatement,
          variantType: (attempt.variantType as 'WEAKENING' | 'OPPOSITE') || 'WEAKENING',
          provedStatement: (decomp as any).provedStatement,
          sublemmas: (decomp as any).sublemmas as Sublemma[],
          explanation: attempt.explanation,
          normalizedProof: (decomp as any).normalizedProof,
          rawProof: attempt.rawProof || undefined,
        },
        proofHistory: [
          {
            sublemmas: [],
            timestamp: new Date(),
          },
        ],
        activeVersionIdx: 0,
      });
    };

    // Try token streaming first; fallback to metadata-only SSE, then non-streaming
    if (typeof window !== 'undefined' && 'EventSource' in window) {
      const runMetadataSSE = async () => {
        try {
          const url2 = `/api/proof/attempt-sse?problem=${encodeURIComponent(trimmed)}`;
          const es2 = new EventSource(url2);
          let finished2 = false;
          set({ cancelCurrent: () => { try { es2.close(); } catch { } } });

          es2.addEventListener('progress', (ev: MessageEvent) => {
            try {
              const data = JSON.parse(ev.data || '{}');
              if (data?.phase === 'attempt.start') appendLog('Attempting proof...');
              if (data?.phase === 'decompose.start') appendLog('Decomposing proof....');
            } catch { }
          });
          es2.addEventListener('attempt', (ev: MessageEvent) => {
            try {
              const data = JSON.parse(ev.data || '{}');
              if (data?.status === 'FAILED') appendLog('Unable to provide a proof....');
              else if (data?.status === 'PROVED_VARIANT') appendLog('Proof generated for a revised statement....');
              else appendLog(`Model produced a proof (len ~${data?.rawProofLen ?? 0})...`);
            } catch { }
          });
          es2.addEventListener('decompose', (ev: MessageEvent) => {
            try { const data = JSON.parse(ev.data || '{}'); appendLog(`Decomposed into ${data?.sublemmasCount ?? 0} step(s)....`); } catch { }
          });
          es2.addEventListener('server-error', (ev: MessageEvent) => {
            if (finished2) return; finished2 = true;
            try {
              const data = JSON.parse(ev.data || '{}');
              set({
                loading: false,
                error: data?.error || 'Unexpected server error.',
                errorDetails: data?.detail ?? null,
                errorCode: data?.code ?? null,
              });
            } catch {
              set({ loading: false, error: 'Unexpected server error.', errorDetails: null, errorCode: null });
            }
            try { es2.close(); } catch { }
            set({ cancelCurrent: null });
          });
          es2.addEventListener('done', (ev: MessageEvent) => {
            if (finished2) return; finished2 = true;
            try {
              const data = JSON.parse(ev.data || '{}');
              const attempt = data?.attempt; const decomp = data?.decompose;
              if (!attempt) { set({ loading: false, error: 'Malformed SSE response.' }); return; }
              if (attempt.status === 'FAILED') {
                set({ loading: false, error: null, pendingRejection: { explanation: attempt.explanation || 'No details provided.' }, proofHistory: [], activeVersionIdx: 0 });
              } else if (!decomp) {
                set({ loading: false, error: 'Failed to parse the proof produced by AI.' });
              } else if (attempt.status === 'PROVED_AS_IS') {
                const steps: Sublemma[] = (decomp.sublemmas && decomp.sublemmas.length > 0) ? (decomp.sublemmas as Sublemma[]) : ([{ title: 'Proof', statement: decomp.provedStatement, proof: (decomp as any).normalizedProof || attempt.rawProof || 'Proof unavailable.', }] as Sublemma[]);
                const assistantMessage: Message = { role: 'assistant', content: `I've broken down the proof into the following steps:\n\n` + steps.map((s: Sublemma) => `**${s.title}:** ${s.statement}`).join('\n\n'), };
                set({ messages: [assistantMessage], loading: false, error: null, proofHistory: [{ sublemmas: steps, timestamp: new Date() }], activeVersionIdx: 0 });
              } else {
                set({ loading: false, error: null, pendingSuggestion: { suggested: attempt.finalStatement || decomp.provedStatement, variantType: (attempt.variantType as 'WEAKENING' | 'OPPOSITE') || 'WEAKENING', provedStatement: decomp.provedStatement, sublemmas: decomp.sublemmas as Sublemma[], explanation: attempt.explanation, normalizedProof: (decomp as any).normalizedProof, rawProof: attempt.rawProof || undefined, }, proofHistory: [{ sublemmas: [], timestamp: new Date() }], activeVersionIdx: 0 });
              }
            } catch (e) { set({ loading: false, error: e instanceof Error ? e.message : 'Unexpected error.' }); }
            finally { try { es2.close(); } catch { } set({ cancelCurrent: null }); }
          });
          es2.onerror = () => { try { es2.close(); } catch { } set({ cancelCurrent: null }); appendLog('Metadata stream lost. Falling back to non-streaming...'); runNonStreaming(); };
        } catch { await runNonStreaming(); }
      };

      try {
        const url = `/api/proof/attempt-stream?problem=${encodeURIComponent(trimmed)}`;
        const es = new EventSource(url);
        let finished = false;
        let gotDelta = false;
        set({ cancelCurrent: () => { try { es.close(); } catch { } } });
        set({ isDraftStreaming: true, liveDraft: '' });

        es.addEventListener('model.start', (ev: MessageEvent) => {
          try { const data = JSON.parse(ev.data || '{}'); appendLog(`Using ${data?.provider}/${data?.model}...`); } catch { }
        });
        es.addEventListener('model.switch', (ev: MessageEvent) => {
          try { const d = JSON.parse(ev.data || '{}'); if (d?.to) appendLog(`Switched model to ${d.to}...`); } catch { }
        });
        es.addEventListener('model.delta', (ev: MessageEvent) => {
          try { const data = JSON.parse(ev.data || '{}'); const t = data?.text || ''; if (t) { if (!gotDelta) { appendLog('Receiving model output...'); gotDelta = true; } set((s) => ({ liveDraft: s.liveDraft + t })); } } catch { }
        });
        es.addEventListener('model.end', () => { set({ isDraftStreaming: false }); appendLog('Proof draft completed....'); });
        es.addEventListener('classify.result', (ev: MessageEvent) => {
          try {
            const d = JSON.parse(ev.data || '{}');
            const st = d?.status;
            if (st === 'PROVED_VARIANT') appendLog('Proof generated for a revised statement....');
            else if (st === 'FAILED') appendLog('Unable to provide a proof....');
          } catch { }
        });



        es.addEventListener('decompose.start', () => appendLog('Decomposing proof....'));
        es.addEventListener('decompose.result', (ev: MessageEvent) => { try { const d = JSON.parse(ev.data || '{}'); appendLog(`Decomposed into ${d?.sublemmasCount ?? 0} step(s)....`); } catch { } });

        es.addEventListener('server-error', (ev: MessageEvent) => {
          if (finished) return; finished = true;
          let friendly = 'Token stream failed.';
          let detail: string | null = null;
          let code: string | null = null;
          try {
            const data = JSON.parse(ev.data || '{}');
            if (data?.error) friendly = data.error; // already friendly from server
            if (data?.detail) detail = data.detail;
            if (data?.code) code = data.code;
          } catch { }
          try { es.close(); } catch { }
          set({ cancelCurrent: null, isDraftStreaming: false, errorDetails: detail, errorCode: code });
          appendLog(friendly + ' Falling back to metadata stream...');
          runMetadataSSE();
        });

        es.addEventListener('done', (ev: MessageEvent) => {
          if (finished) return; finished = true;
          try {
            const data = JSON.parse(ev.data || '{}');
            const attempt = data?.attempt; const decomp = data?.decompose;
            if (!attempt) { set({ loading: false, error: 'Malformed stream response.' }); return; }
            if (attempt.status === 'FAILED') {
              set({ loading: false, error: null, pendingRejection: { explanation: attempt.explanation || 'No details provided.' }, proofHistory: [], activeVersionIdx: 0 });
            } else if (!decomp) {
              set({ loading: false, error: 'Failed to parse the proof produced by AI.' });
            } else if (attempt.status === 'PROVED_AS_IS') {
              const steps: Sublemma[] = (decomp.sublemmas && decomp.sublemmas.length > 0) ? (decomp.sublemmas as Sublemma[]) : ([{ title: 'Proof', statement: decomp.provedStatement, proof: (decomp as any).normalizedProof || attempt.rawProof || 'Proof unavailable.', }] as Sublemma[]);
              const assistantMessage: Message = { role: 'assistant', content: `I've broken down the proof into the following steps:\n\n` + steps.map((s: Sublemma) => `**${s.title}:** ${s.statement}`).join('\n\n') };
              set({ messages: [assistantMessage], loading: false, error: null, proofHistory: [{ sublemmas: steps, timestamp: new Date() }], activeVersionIdx: 0 });
            } else {
              set({ loading: false, error: null, pendingSuggestion: { suggested: attempt.finalStatement || decomp.provedStatement, variantType: (attempt.variantType as 'WEAKENING' | 'OPPOSITE') || 'WEAKENING', provedStatement: decomp.provedStatement, sublemmas: decomp.sublemmas as Sublemma[], explanation: attempt.explanation, normalizedProof: (decomp as any).normalizedProof, rawProof: attempt.rawProof || undefined }, proofHistory: [{ sublemmas: [], timestamp: new Date() }], activeVersionIdx: 0 });
            }
          } catch (e) { set({ loading: false, error: e instanceof Error ? e.message : 'Unexpected error.' }); }
          finally { try { es.close(); } catch { } set({ cancelCurrent: null, isDraftStreaming: false }); }
        });

        es.onerror = () => {
          if (finished) return; finished = true; try { es.close(); } catch { }
          set({ cancelCurrent: null, isDraftStreaming: false });
          appendLog('Token stream connection lost. Falling back to metadata stream...');
          runMetadataSSE();
        };
      } catch (e) {
        appendLog('Token streaming not available. Falling back to metadata stream...');
        await runMetadataSSE();
      }
    } else {
      await runNonStreaming();
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
    const cancel = get().cancelCurrent || null;
    if (cancel) {
      try { cancel(); } catch { }
    }
    const cancelExplore = get().cancelExploreCurrent || null;
    if (cancelExplore) {
      try { cancelExplore(); } catch { }
    }
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
      errorDetails: null,
      errorCode: null,
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
