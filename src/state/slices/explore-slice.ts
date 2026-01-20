'use client';

import type { AppState } from '@/state/store.types';
import type { ExploreArtifacts } from '@/ai/exploration-assistant/exploration-assistant.schemas';
import type { Message } from '@/components/chat/interactive-chat';
import { pushAppViewToHistory } from '@/state/store.history';

export const createExploreSlice = (
  set: any,
  get: any,
): Pick<
  AppState,
  | 'startExplore'
  | 'newExplore'
  | 'setExploreMessages'
  | 'setExploreArtifacts'
  | 'deleteExploreCandidateStatement'
  | 'setExploreArtifactEdit'
  | 'clearExploreArtifactEdits'
  | 'bumpExploreTurnId'
  | 'getExploreTurnId'
  | 'setExploreCancelCurrent'
  | 'promoteToProof'
  | 'startExploreFromFailedProof'
> => ({
  startExplore: (seed?: string) => {
    // Cancel any in-flight explore stream
    const cancel = get().cancelExploreCurrent || null;
    if (cancel) {
      try {
        cancel();
      } catch {}
    }

    const trimmed = seed?.trim() ? seed.trim() : null;

    // If a new seed is provided (coming from Home), start a fresh explore session.
    if (trimmed) {
      set({
        view: 'explore',
        exploreHasSession: true,
        exploreSeed: trimmed,
        exploreMessages: [],
        exploreArtifacts: null,
        exploreArtifactEdits: {
          candidateStatements: {},
          perStatement: {},
        },
        exploreTurnId: 0,
      });

      pushAppViewToHistory('explore');
      return;
    }

    // Otherwise, preserve any existing thread (direct revisit of /explore).
    set({
      view: 'explore',
      exploreHasSession: true,
      exploreSeed: get().exploreSeed,
      exploreMessages: get().exploreMessages.length ? get().exploreMessages : [],
      exploreArtifacts: get().exploreArtifacts,
    });

    pushAppViewToHistory('explore');
  },

  newExplore: () => {
    // Cancel any in-flight explore stream
    const cancel = get().cancelExploreCurrent || null;
    if (cancel) {
      try {
        cancel();
      } catch {
        // ignore
      }
    }

    set({
      view: 'explore',
      exploreHasSession: true,
      exploreSeed: null,
      exploreMessages: [],
      exploreArtifacts: null,
      exploreArtifactEdits: {
        candidateStatements: {},
        perStatement: {},
      },
      exploreTurnId: 0,
    });

    pushAppViewToHistory('explore');
  },

  setExploreMessages: (updater) => {
    if (typeof updater === 'function') {
      set((state: AppState) => ({
        exploreMessages: updater(state.exploreMessages),
      }));
    } else {
      set({ exploreMessages: updater });
    }
  },

  setExploreArtifacts: (artifacts) => set({ exploreArtifacts: artifacts }),

  deleteExploreCandidateStatement: (statement: string) => {
    const s = String(statement ?? '').trim();
    if (!s) return;
    set((state: AppState) => {
      const cur = state.exploreArtifacts;
      if (!cur) return state;
      const nextCandidates = (cur.candidateStatements || []).filter((x) => x !== s);
      const nextArtifacts: ExploreArtifacts = {
        ...cur,
        candidateStatements: nextCandidates,
        statementArtifacts: { ...(cur.statementArtifacts || {}) },
      };
      delete (nextArtifacts.statementArtifacts as any)[s];
      return { exploreArtifacts: nextArtifacts } as any;
    });
  },

  setExploreArtifactEdit: ({ kind, statementKey, original, edited }) => {
    const o = (original ?? '').trim();
    if (!o) return;
    const e = (edited ?? '').trim();

    if (kind === 'candidateStatements') {
      set((state: AppState) => ({
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

    set((state: AppState) => {
      const prevForStmt = state.exploreArtifactEdits.perStatement[sk] ?? {
        assumptions: {},
        examples: {},
        counterexamples: {},
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

  startExploreFromFailedProof: () => {
    const problem = (get().problem || '').trim();
    const original = (get().lastProblem || '').trim();
    const draft = (get().liveDraft || '').trim();

    const userContent = original || problem;
    const seededMessages: Message[] = [];

    if (userContent) {
      seededMessages.push({ role: 'user', content: userContent });
    }
    if (draft) {
      seededMessages.push({ role: 'assistant', content: draft });
    }

    set({
      view: 'explore',
      exploreHasSession: true,
      exploreSeed: userContent || null,
      exploreMessages: seededMessages,
      exploreArtifacts: null,
      exploreArtifactEdits: {
        candidateStatements: {},
        perStatement: {},
      },
      exploreTurnId: 0,
    });
  },
});
