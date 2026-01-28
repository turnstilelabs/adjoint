'use client';

import type { StoreData } from '@/state/store.types';

export const initialState: StoreData = {
  view: 'home',
  lastViewBeforeWorkspace: null,
  problem: null,
  lastProblem: null,
  messages: [],

  chatDraft: '',
  chatDraftNonce: 0,

  exploreDraft: '',
  exploreDraftNonce: 0,

  exploreHasSession: false,
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
  proofChatPanelWidth: 448,
  isHistoryOpen: false,
  viewMode: 'raw',
  // proof review/history defaults
  proofHistory: [],

  // Raw proof + background decomposition state
  rawProof: '',
  rawProofEditNonce: 0,
  attemptSummary: null,
  isDecomposing: false,
  decomposeError: null,
  stepsReadyNonce: 0,
  decomposeMeta: null,
  decomposedRaw: null,

  activeVersionIdx: 0,
  pendingSuggestion: null,
  pendingRejection: null,
  progressLog: [],
  proofAttemptRunId: 0,
  cancelCurrent: null,
  liveDraft: '',
  isDraftStreaming: false,

  proofRenderMacros: {},

  isAnalyzingProof: false,
  analyzeProofRunId: 0,

  workspaceDoc: '',
  workspaceMessages: [],
  workspaceDraft: '',
  workspaceDraftNonce: 0,
  // Prefer showing just the editor on entry.
  isWorkspaceChatOpen: false,
  workspaceRightPanelTab: 'chat',
  workspaceRightPanelWidth: 448, // 28rem default

  workspaceReviewArtifacts: [],
  workspaceReviewEdits: {},
  workspaceReviewResults: {},

  workspaceArtifacts: null,
  workspaceInsightsIsExtracting: false,
  workspaceArtifactEdits: {
    candidateStatements: {},
    perStatement: {},
  },
  workspaceTurnId: 0,
  cancelWorkspaceCurrent: null,
};
