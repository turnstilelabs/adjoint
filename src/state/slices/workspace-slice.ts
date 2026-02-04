'use client';

import type { AppState } from '@/state/store.types';
import type { ExploreArtifacts } from '@/ai/exploration-assistant/exploration-assistant.schemas';
import { createWorkspaceProject } from '@/lib/persistence/workspace-projects';

export const createWorkspaceSlice = (
  set: any,
  get: any,
): Pick<
  AppState,
  | 'startWorkspace'
  | 'newWorkspace'
  | 'goToWorkspace'
  | 'returnFromWorkspace'
  | 'setWorkspaceDoc'
  | 'setWorkspaceDraft'
  | 'setWorkspaceMessages'
  | 'setIsWorkspaceChatOpen'
  | 'setWorkspaceRightPanelTab'
  | 'setWorkspaceRightPanelWidth'
  | 'setWorkspaceReviewArtifacts'
  | 'setWorkspaceReviewEdit'
  | 'resetWorkspaceReviewEdits'
  | 'applyWorkspaceReviewEditsToDoc'
  | 'setWorkspaceReviewResult'
  | 'setWorkspaceArtifacts'
  | 'setWorkspaceInsightsExtracting'
  | 'deleteWorkspaceCandidateStatement'
  | 'setWorkspaceArtifactEdit'
  | 'bumpWorkspaceTurnId'
  | 'getWorkspaceTurnId'
  | 'setWorkspaceCancelCurrent'
  | 'setWorkspaceChatCancelCurrent'
> => ({
  startWorkspace: (seed?: string) => {
    const prevView = get().view;
    const doc = String(seed ?? '').trim();
    set((s: AppState) => ({
      view: 'workspace',
      lastViewBeforeWorkspace: s.view,
      workspaceDoc: doc || s.workspaceDoc || '',
      // keep conversation by default
      workspaceMessages: s.workspaceMessages,
    }));
  },

  goToWorkspace: (opts) => {
    const from = (opts?.from ?? get().view) as any;
    const append = String(opts?.append ?? '').trim();

    set((s: AppState) => {
      const prevDoc = String(s.workspaceDoc ?? '');
      const nextDoc = append
        ? prevDoc.trim().length > 0
          ? `${prevDoc.replace(/\s*$/, '')}\n\n${append}\n`
          : `${append}\n`
        : prevDoc;

      return {
        view: 'workspace',
        lastViewBeforeWorkspace: from,
        workspaceDoc: nextDoc,
      };
    });
  },

  returnFromWorkspace: () => {
    const last = get().lastViewBeforeWorkspace;
    // If we don't know where to return, go home.
    set({ view: last || 'home' });
    // Note: we intentionally do NOT push a new history entry here.
    // - If user clicked the in-UI back button, we prefer `history.back()`.
    // - If caller falls back to this function, they can still use browser back/forward.
  },

  newWorkspace: () => {
    // Create a fresh persisted project and switch the UI to it.
    // (This is important so /workspace?new=1 doesn't get overwritten by hydration.)
    try {
      createWorkspaceProject({ title: 'Untitled', kind: 'project' });
    } catch {
      // ignore: still reset in-memory state
    }

    set({
      view: 'workspace',
      lastViewBeforeWorkspace: get().view,
      workspaceDoc: '',
      workspaceMessages: [],
      workspaceDraft: '',
      workspaceDraftNonce: 0,
      isWorkspaceChatOpen: false,
      workspaceRightPanelTab: 'chat',
      workspaceRightPanelWidth: 448,
    });
  },

  setWorkspaceDoc: (doc) => set({ workspaceDoc: String(doc ?? '') }),

  setWorkspaceDraft: (text, opts) => {
    const t = String(text ?? '');
    set((s: AppState) => ({
      workspaceDraft: t,
      workspaceDraftNonce: (s.workspaceDraftNonce || 0) + 1,
      isWorkspaceChatOpen: opts?.open ? true : s.isWorkspaceChatOpen,
    }));
  },

  setWorkspaceMessages: (updater) => {
    if (typeof updater === 'function') {
      set((state: AppState) => ({
        workspaceMessages: updater(state.workspaceMessages),
      }));
    } else {
      set({ workspaceMessages: updater });
    }
  },

  setIsWorkspaceChatOpen: (open) => {
    if (typeof open === 'function') {
      set((s: AppState) => ({ isWorkspaceChatOpen: open(s.isWorkspaceChatOpen) }));
    } else {
      set({ isWorkspaceChatOpen: open });
    }
  },

  setWorkspaceRightPanelTab: (tab) => set({ workspaceRightPanelTab: tab }),

  setWorkspaceRightPanelWidth: (widthPx) => {
    const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
    // Keep it within a sensible range.
    const next = clamp(Number(widthPx) || 0, 280, 720);
    set({ workspaceRightPanelWidth: next });
  },

  // --- Workspace Review ----------------------------------------------------
  setWorkspaceReviewArtifacts: (items) => set({ workspaceReviewArtifacts: items ?? [] }),

  setWorkspaceReviewEdit: (key, edits) => {
    const k = String(key ?? '').trim();
    if (!k) return;
    set((s: AppState) => ({
      workspaceReviewEdits: {
        ...s.workspaceReviewEdits,
        [k]: {
          statement: String(edits?.statement ?? '').trim(),
          proof: edits?.proof == null ? null : String(edits.proof).trim(),
        },
      },
    }));
  },

  resetWorkspaceReviewEdits: (key) => {
    const k = String(key ?? '').trim();
    if (!k) {
      set({ workspaceReviewEdits: {} });
      return;
    }
    set((s: AppState) => {
      const { [k]: _omit, ...rest } = s.workspaceReviewEdits;
      return { workspaceReviewEdits: rest } as any;
    });
  },

  applyWorkspaceReviewEditsToDoc: (key) => {
    const k = String(key ?? '').trim();
    if (!k) return;
    const state = get() as AppState;
    const edits = state.workspaceReviewEdits[k];
    if (!edits) return;
    const art = state.workspaceReviewArtifacts.find((a) => {
      const kk = a.label && a.label.trim() ? a.label.trim() : `${a.type}@${a.artifactStartChar}`;
      return kk === k;
    });
    if (!art) return;

    const doc = String(state.workspaceDoc ?? '');

    // Splice helper
    const splice = (s: string, from: number, to: number, insert: string) =>
      `${s.slice(0, Math.max(0, from))}${insert}${s.slice(Math.max(0, to))}`;

    // IMPORTANT: when applying multiple edits, apply from back-to-front so earlier
    // replacements don't shift later offsets.
    const replacements: Array<{ from: number; to: number; insert: string }> = [];

    // Statement edit (artifact body only)
    if (typeof edits.statement === 'string' && edits.statement.trim().length > 0) {
      let statement = edits.statement.trim();
      // Preserve the artifact's label in the source when applying edits.
      // (The UI deliberately hides \label{...} from the editor for cleanliness.)
      if (art.label && !/\\label\s*\{[^}]+\}/.test(statement)) {
        statement = `\\label{${art.label}}\n${statement}`;
      }
      replacements.push({
        from: art.bodyStartChar,
        to: art.bodyEndChar,
        insert: `\n${statement}\n`,
      });
    }

    // Proof edit (proof body only)
    if (art.proofBlock && edits.proof != null) {
      replacements.push({
        from: art.proofBlock.bodyStartChar,
        to: art.proofBlock.bodyEndChar,
        insert: `\n${String(edits.proof ?? '').trim()}\n`,
      });
    }

    // Apply descending by position.
    const sorted = replacements.sort((a, b) => b.from - a.from);
    let nextDoc = doc;
    for (const r of sorted) {
      nextDoc = splice(nextDoc, r.from, r.to, r.insert);
    }

    set({ workspaceDoc: nextDoc });
  },

  setWorkspaceReviewResult: (key, result) => {
    const k = String(key ?? '').trim();
    if (!k) return;
    if (result == null) {
      set((s: AppState) => {
        const { [k]: _omit, ...rest } = s.workspaceReviewResults;
        return { workspaceReviewResults: rest } as any;
      });
      return;
    }
    set((s: AppState) => ({
      workspaceReviewResults: {
        ...s.workspaceReviewResults,
        [k]: result,
      },
    }));
  },

  // --- Workspace Insights --------------------------------------------------
  setWorkspaceArtifacts: (artifacts) => set({ workspaceArtifacts: artifacts }),

  setWorkspaceInsightsExtracting: (extracting) =>
    set({ workspaceInsightsIsExtracting: Boolean(extracting) }),

  deleteWorkspaceCandidateStatement: (statement: string) => {
    const s = String(statement ?? '').trim();
    if (!s) return;
    set((state: AppState) => {
      const cur = state.workspaceArtifacts;
      if (!cur) return state;
      const nextCandidates = (cur.candidateStatements || []).filter((x) => x !== s);
      const nextArtifacts: ExploreArtifacts = {
        ...cur,
        candidateStatements: nextCandidates,
        statementArtifacts: { ...(cur.statementArtifacts || {}) },
      };
      delete (nextArtifacts.statementArtifacts as any)[s];
      return { workspaceArtifacts: nextArtifacts } as any;
    });
  },

  setWorkspaceArtifactEdit: ({ kind, statementKey, original, edited }) => {
    const o = (original ?? '').trim();
    if (!o) return;
    const e = (edited ?? '').trim();

    if (kind === 'candidateStatements') {
      set((state: AppState) => ({
        workspaceArtifactEdits: {
          ...state.workspaceArtifactEdits,
          candidateStatements: {
            ...state.workspaceArtifactEdits.candidateStatements,
            [o]: e,
          },
        },
      }));
      return;
    }

    const sk = (statementKey ?? '').trim();
    if (!sk) return;

    set((state: AppState) => {
      const prevForStmt = state.workspaceArtifactEdits.perStatement[sk] ?? {
        assumptions: {},
        examples: {},
        counterexamples: {},
      };

      return {
        workspaceArtifactEdits: {
          ...state.workspaceArtifactEdits,
          perStatement: {
            ...state.workspaceArtifactEdits.perStatement,
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

  bumpWorkspaceTurnId: () => {
    const next = get().workspaceTurnId + 1;
    set({ workspaceTurnId: next });
    return next;
  },

  getWorkspaceTurnId: () => get().workspaceTurnId,

  setWorkspaceCancelCurrent: (cancel) => set({ cancelWorkspaceCurrent: cancel }),

  setWorkspaceChatCancelCurrent: (cancel) => set({ cancelWorkspaceChatCurrent: cancel }),
});
