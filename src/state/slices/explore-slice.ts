'use client';

import type { AppState } from '@/state/store.types';
import type { ExploreArtifacts } from '@/ai/exploration-assistant/exploration-assistant.schemas';
import type { Message } from '@/components/chat/interactive-chat';

const mergeExploreArtifactsAppend = (
  prev: ExploreArtifacts | null,
  next: ExploreArtifacts | null,
): ExploreArtifacts | null => {
  if (!prev) return next;
  if (!next) return prev;

  const prevCandidates = Array.isArray(prev.candidateStatements) ? prev.candidateStatements : [];
  const nextCandidates = Array.isArray(next.candidateStatements) ? next.candidateStatements : [];

  // Append new candidates to the end (preserve existing order), dedupe by trimmed string.
  const seen = new Set(prevCandidates.map((s) => String(s ?? '').trim()).filter(Boolean));
  const mergedCandidates = [...prevCandidates];
  for (const c of nextCandidates) {
    const t = String(c ?? '').trim();
    if (!t) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    mergedCandidates.push(t);
  }

  // Merge per-statement artifacts; prefer next for overlapping keys.
  // NOTE: statementArtifacts is keyed by the statement string, so we only keep the exact keys.
  const mergedStatementArtifacts: ExploreArtifacts['statementArtifacts'] = {
    ...(prev.statementArtifacts || {}),
    ...(next.statementArtifacts || {}),
  };

  return {
    candidateStatements: mergedCandidates,
    statementArtifacts: mergedStatementArtifacts,
  };
};

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
  | 'setExploreExtractionCancelCurrent'
  | 'setExploreIsExtracting'
  | 'setExploreExtractionPaused'
  | 'setIsExploreArtifactsOpen'
  | 'startExploreFromFailedProof'
> => ({
  startExplore: (seed?: string) => {
    // Cancel any in-flight explore stream
    const cancel = get().cancelExploreCurrent || null;
    if (cancel) {
      try {
        cancel();
      } catch { }
    }

    // Cancel any in-flight explore extraction
    const cancelExtract = get().cancelExploreExtractionCurrent || null;
    if (cancelExtract) {
      try {
        cancelExtract();
      } catch {
        // ignore
      }
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
        // UX: hide by default on entry.
        isExploreArtifactsOpen: false,
        exploreIsExtracting: false,
        exploreExtractionPaused: false,
        cancelExploreExtractionCurrent: null,
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
      exploreHasSession: true,
      exploreSeed: get().exploreSeed,
      exploreMessages: get().exploreMessages.length ? get().exploreMessages : [],
      exploreArtifacts: get().exploreArtifacts,
      // UX: hide by default on entry.
      isExploreArtifactsOpen: false,
    });
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

    // Cancel any in-flight explore extraction
    const cancelExtract = get().cancelExploreExtractionCurrent || null;
    if (cancelExtract) {
      try {
        cancelExtract();
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
      // UX: hide by default on entry.
      isExploreArtifactsOpen: false,
      exploreIsExtracting: false,
      exploreExtractionPaused: false,
      cancelExploreExtractionCurrent: null,
      exploreArtifactEdits: {
        candidateStatements: {},
        perStatement: {},
      },
      exploreTurnId: 0,
    });
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

  setExploreArtifacts: (artifacts) =>
    set((state: AppState) => ({
      exploreArtifacts: mergeExploreArtifactsAppend(state.exploreArtifacts, artifacts ?? null),
    })),

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

  setExploreExtractionCancelCurrent: (cancel) => set({ cancelExploreExtractionCurrent: cancel }),

  setExploreIsExtracting: (extracting) => set({ exploreIsExtracting: Boolean(extracting) }),

  setExploreExtractionPaused: (paused) => set({ exploreExtractionPaused: Boolean(paused) }),

  setIsExploreArtifactsOpen: (open) => {
    if (typeof open === 'function') {
      set((state: AppState) => ({ isExploreArtifactsOpen: open(state.isExploreArtifactsOpen) }));
    } else {
      set({ isExploreArtifactsOpen: Boolean(open) });
    }
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
      // UX: hide by default on entry.
      isExploreArtifactsOpen: false,
      exploreIsExtracting: false,
      exploreExtractionPaused: false,
      cancelExploreExtractionCurrent: null,
      exploreArtifactEdits: {
        candidateStatements: {},
        perStatement: {},
      },
      exploreTurnId: 0,
    });
  },
});
