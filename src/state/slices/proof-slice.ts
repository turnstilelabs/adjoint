'use client';

import type { AppState, ProofValidationResult, ProofVersion } from '@/state/store.types';
import type { Sublemma } from '@/ai/flows/llm-proof-decomposition';
import type { GraphData } from '@/components/proof-graph';
import type { Message } from '@/components/chat/interactive-chat';
import {
  attemptProofAction,
  attemptProofActionForce,
  decomposeRawProofAction,
  generateProofGraphForGoalAction,
} from '@/app/actions';
import { ROUTE_PAYLOAD_MAX_QUERY_CHARS } from '@/lib/route-payload';

// Autosave debounce timer (module-level so multiple components share it)
let rawAutosaveTimer: number | null = null;
let lastSavedRaw = '';

// Lightweight UUID generator for client-side ids
const uuid = () => 'v' + Math.random().toString(36).slice(2, 9);

// Helpers to create version objects
const getMaxRawMajor = (history: ProofVersion[]) =>
  history.reduce((m, v) => (v.type === 'raw' ? Math.max(m, v.baseMajor) : m), 0);

const makeRawVersion = (history: ProofVersion[], content: string) => {
  const nextMajor = (getMaxRawMajor(history) || 0) + 1;
  return {
    id: uuid(),
    type: 'raw' as const,
    versionNumber: `${nextMajor}`,
    baseMajor: nextMajor,
    content,
    sublemmas: [] as Sublemma[],
    userEdited: true,
    derived: false,
    timestamp: new Date(),
    validationResult: undefined,
    stepValidation: undefined,
    lastEditedStepIdx: null,
    graphData: undefined,
    graphHash: undefined,
  } as ProofVersion;
};

const makeStructuredVersion = (
  history: ProofVersion[],
  baseMajor: number,
  steps: Sublemma[],
  structuredPayload: { provedStatement?: string; normalizedProof?: string },
  opts?: { userEdited?: boolean; derived?: boolean },
) => {
  const minors = history
    .filter((v) => v.baseMajor === baseMajor && v.type === 'structured')
    .map((v) => {
      const parts = (v.versionNumber || '').split('.');
      return parts.length > 1 ? parseInt(parts[1], 10) || 0 : 0;
    });
  const nextMinor = (minors.length ? Math.max(...minors) : 0) + 1;
  const versionNumber = `${baseMajor}.${nextMinor}`;
  return {
    id: uuid(),
    type: 'structured' as const,
    versionNumber,
    baseMajor,
    content: structuredPayload.normalizedProof || '',
    structured: structuredPayload,
    sublemmas: steps,
    userEdited: !!opts?.userEdited,
    derived: opts?.derived ?? true,
    timestamp: new Date(),
    validationResult: undefined,
    stepValidation: undefined,
    lastEditedStepIdx: null,
    graphData: undefined,
    graphHash: undefined,
  } as ProofVersion;
};

let decomposeRunId = 0;

export const createProofSlice = (
  set: any,
  get: any,
): Pick<
  AppState,
  | 'ensureGraphForVersion'
  | 'cancelAnalyzeCurrentProof'
  | 'analyzeCurrentProof'
  | 'requestRawProofEdit'
  | 'startProof'
  | 'resumeProof'
  | 'retry'
  | 'editProblem'
  | 'setMessages'
  | 'acceptSuggestedChange'
  | 'clearSuggestion'
  | 'clearRejection'
  | 'goBack'
  | 'proof'
  | 'setActiveVersionIndex'
  | 'addProofVersion'
  | 'updateCurrentProofMeta'
  | 'updateCurrentProofVersion'
  | 'updateCurrentStepValidation'
  | 'clearLastEditedStep'
  | 'deleteProofVersion'
  | 'setViewMode'
  | 'toggleStructuredView'
  | 'setRawProof'
  | 'runDecomposition'
  | 'getCurrentRawBaseMajor'
  | 'hasUserEditedStructuredForBaseMajor'
  | 'hasUserEditedStructuredForCurrentRaw'
  | 'snapshotStructuredEdit'
> => ({
  // NOTE: proofAttemptRunId lives in the global store (see StoreData).
  // We use it to ignore late EventSource callbacks after cancel/restart.

  ensureGraphForVersion: async (versionId: string) => {
    try {
      const state = get() as AppState;
      const idx = state.proofHistory.findIndex((v) => v.id === versionId);
      if (idx < 0) return;
      const v = state.proofHistory[idx];
      if (!v || v.type !== 'structured') return;
      const steps = v.sublemmas || [];
      if (steps.length === 0) return;

      const goalStatement = (state.problem || '').trim();
      if (!goalStatement) return;

      const hashString = (input: string): string => {
        try {
          let h = 0;
          for (let i = 0; i < input.length; i++) {
            h = (h * 31 + input.charCodeAt(i)) | 0;
          }
          return `h${h}`;
        } catch {
          return 'h0';
        }
      };

      const graphHash = hashString(
        JSON.stringify({
          goalStatement,
          steps: steps.map((s) => ({ title: s.title, statement: s.statement })),
        }),
      );

      // Dedup: if we already computed for this exact input, no-op.
      if (v.graphData && v.graphHash === graphHash) return;

      const result = await generateProofGraphForGoalAction(goalStatement, steps);
      if ((result as any)?.success !== true) return;

      const { nodes, edges } = result as any;
      const normalizedNodes = (nodes as any[]).map((n) => {
        const m = String(n.id || '').match(/step-(\d+)/);
        const stepIdx = m ? parseInt(m[1], 10) - 1 : -1;
        const content =
          n.id === 'goal'
            ? goalStatement
            : stepIdx >= 0 && stepIdx < steps.length
              ? steps[stepIdx].statement
              : '';
        return {
          ...n,
          label: n.id === 'goal' ? 'Goal' : n.label,
          content,
        };
      });

      // Only commit if the version still exists and hash still matches.
      set((s: AppState) => {
        const j = s.proofHistory.findIndex((x) => x.id === versionId);
        if (j < 0) return s;
        const cur = s.proofHistory[j];
        if (!cur || cur.type !== 'structured') return s;
        return {
          ...s,
          proofHistory: s.proofHistory.map((x) =>
            x.id === versionId
              ? {
                ...x,
                graphData: { nodes: normalizedNodes, edges } as GraphData,
                graphHash,
              }
              : x,
          ),
        };
      });
    } catch {
      // silent failure
    }
  },

  cancelAnalyzeCurrentProof: () =>
    set((s: AppState) => ({
      isAnalyzingProof: false,
      // bump run id so late results from an older run get ignored
      analyzeProofRunId: (s.analyzeProofRunId || 0) + 1,
    })),

  analyzeCurrentProof: async () => {
    const state = get() as AppState;
    const proof = state.proof();

    // Mark analysis as running and capture a run id for cancellation.
    const myRun = (state.analyzeProofRunId || 0) + 1;
    set({ isAnalyzingProof: true, analyzeProofRunId: myRun });

    // No analysis in graph view.
    if (state.viewMode === 'graph') {
      // ensure UI doesn't get stuck
      set((s: AppState) =>
        s.analyzeProofRunId === myRun ? { isAnalyzingProof: false } : ({} as any),
      );
      return;
    }

    const problem = (state.problem || '').trim();
    if (!problem) {
      set((s: AppState) =>
        s.analyzeProofRunId === myRun ? { isAnalyzingProof: false } : ({} as any),
      );
      return;
    }

    const isRawMode = state.viewMode === 'raw' || proof.type === 'raw';

    // Avoid pointless calls.
    if (isRawMode) {
      const raw = (state.rawProof || '').trim();
      if (!raw) {
        set((s: AppState) =>
          s.analyzeProofRunId === myRun ? { isAnalyzingProof: false } : ({} as any),
        );
        return;
      }
    } else {
      if (!proof.sublemmas || proof.sublemmas.length === 0) {
        set((s: AppState) =>
          s.analyzeProofRunId === myRun ? { isAnalyzingProof: false } : ({} as any),
        );
        return;
      }
    }

    const hashString = (input: string): string => {
      try {
        let h = 0;
        for (let i = 0; i < input.length; i++) {
          h = (h * 31 + input.charCodeAt(i)) | 0;
        }
        return `h${h}`;
      } catch {
        return 'h0';
      }
    };

    const computeSourceHash = () => {
      if (isRawMode) return hashString((state.rawProof || '').trim());
      const steps = (proof.sublemmas || []).map((s) => ({
        title: s.title,
        statement: s.statement,
        proof: s.proof,
      }));
      return hashString(JSON.stringify(steps));
    };

    const sourceHash = computeSourceHash();
    const last = proof.validationResult;
    if (
      last?.sourceType === (isRawMode ? 'raw' : 'structured') &&
      last?.sourceHash === sourceHash
    ) {
      set((s: AppState) =>
        s.analyzeProofRunId === myRun ? { isAnalyzingProof: false } : ({} as any),
      );
      return;
    }

    // Clear existing result so UI can show "fresh" state.
    get().updateCurrentProofMeta({ validationResult: undefined });

    try {
      const { validateProofAction, validateRawProofAction } = await import('@/app/actions');
      const result = isRawMode
        ? await validateRawProofAction(problem, state.rawProof)
        : await validateProofAction(problem, proof.sublemmas);

      // Ignore late results if cancelled.
      if ((get() as AppState).analyzeProofRunId !== myRun) return;

      if ((result as any)?.success) {
        get().updateCurrentProofMeta({
          validationResult: {
            isValid: (result as any).isValid || false,
            isError: false,
            feedback: (result as any).feedback || 'No feedback provided.',
            timestamp: new Date(),
            model: undefined as any,
            sourceType: isRawMode ? 'raw' : 'structured',
            sourceHash,
          } as ProofValidationResult,
          lastEditedStepIdx: null,
        });
        get().clearLastEditedStep();
      } else {
        const friendly =
          (result as any)?.error ||
          'Adjoint’s connection to the model was interrupted, please go back and retry.';
        get().updateCurrentProofMeta({
          validationResult: {
            isError: true,
            timestamp: new Date(),
            feedback: friendly,
          } as ProofValidationResult,
        });
      }
    } catch (e: any) {
      if ((get() as AppState).analyzeProofRunId !== myRun) return;
      const friendly =
        e?.message ||
        'Adjoint’s connection to the model was interrupted, please go back and retry.';
      get().updateCurrentProofMeta({
        validationResult: {
          isError: true,
          timestamp: new Date(),
          feedback: friendly,
        } as ProofValidationResult,
      });
    } finally {
      // Only clear running state if this run is still current.
      set((s: AppState) =>
        s.analyzeProofRunId === myRun ? { isAnalyzingProof: false } : ({} as any),
      );
    }
  },

  requestRawProofEdit: () =>
    set((s: AppState) => ({ rawProofEditNonce: (s.rawProofEditNonce || 0) + 1 })),

  startProof: async (problem: string, opts?: { force?: boolean }) => {
    const trimmed = problem.trim();
    if (!trimmed) return;

    // Streaming uses EventSource with a `?problem=...` query param.
    // Large statements can create very long URLs which may crash browsers or exceed proxy limits.
    // For safety, we fall back to the non-streaming server action path for large inputs.
    const shouldUseStreaming = (text: string) => {
      try {
        // Use a conservative heuristic.
        // - encodeURIComponent can expand significantly (e.g. LaTeX, unicode)
        // - we keep a margin under typical ~2k-8k limits.
        const encLen = encodeURIComponent(text).length;
        const rawLen = text.length;
        const max = ROUTE_PAYLOAD_MAX_QUERY_CHARS;
        return rawLen <= max && encLen <= max * 2;
      } catch {
        return false;
      }
    };

    // Begin a new proof attempt and capture a run id for cancellation/late events.
    const myRun = ((get() as AppState).proofAttemptRunId || 0) + 1;

    // Initialize state for a new proof run
    // Cancel any in-flight decomposition runs by bumping the run id.
    decomposeRunId += 1;

    set({
      view: 'proof',
      problem: trimmed,
      lastProblem: trimmed,
      messages: [],
      loading: true,
      error: null,
      errorDetails: null,
      errorCode: null,

      // New split-phase proof state
      viewMode: 'raw',
      rawProof: '',
      attemptSummary: null,
      isDecomposing: false,
      decomposeError: null,
      stepsReadyNonce: 0,
      decomposeMeta: null,
      decomposedRaw: null,

      pendingSuggestion: null,
      pendingRejection: null,
      proofHistory: [],
      activeVersionIdx: 0,
      progressLog: ['Starting proof attempt...'],
      cancelCurrent: null,
      liveDraft: '',
      isDraftStreaming: false,

      proofAttemptRunId: myRun,
    });

    const appendLog = (line: string) =>
      set((s: AppState) =>
        s.proofAttemptRunId === myRun ? { progressLog: [...s.progressLog, line] } : ({} as any),
      );

    // Fallback non-streaming implementation (existing behavior)
    const runNonStreaming = async () => {
      await new Promise((r) => setTimeout(r, 50));
      if (((get() as AppState).proofAttemptRunId || 0) !== myRun) return;
      const t0 =
        typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
      const attempt = opts?.force
        ? await attemptProofActionForce(trimmed)
        : await attemptProofAction(trimmed);

      // Ignore late results after cancel/restart.
      if (((get() as AppState).proofAttemptRunId || 0) !== myRun) return;
      const t1 =
        typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();

      if (!(attempt as any)?.success) {
        set((s: AppState) =>
          s.proofAttemptRunId === myRun
            ? { loading: false, error: (attempt as any)?.error || 'Failed to attempt proof.' }
            : ({} as any),
        );
        return;
      }

      if ((attempt as any).status === 'FAILED') {
        const rawContent = String((attempt as any).rawProof || '').trim();
        const rawVersion = makeRawVersion((get() as AppState).proofHistory, rawContent);
        set((s: AppState) =>
          s.proofAttemptRunId === myRun
            ? {
              loading: false,
              viewMode: 'raw',
              rawProof: rawContent,
              error: null,
              pendingRejection: {
                explanation: (attempt as any).explanation || 'No details provided.',
              },
              proofHistory: [rawVersion],
              activeVersionIdx: 0,
            }
            : ({} as any),
        );
        lastSavedRaw = rawContent;
        return;
      }

      const d0 =
        typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
      const decomp = await decomposeRawProofAction((attempt as any).rawProof || '');

      // Ignore late results after cancel/restart.
      if (((get() as AppState).proofAttemptRunId || 0) !== myRun) return;
      const d1 =
        typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();

      if (!(decomp as any)?.success) {
        // Decomposition is not fatal in the new split-phase UX.
        // Keep the proof UI alive (Raw Proof is still available) and surface a non-blocking error.
        const rawContent = String((attempt as any).rawProof || '').trim();
        const rawVersion = makeRawVersion((get() as AppState).proofHistory, rawContent);
        set((s: AppState) =>
          s.proofAttemptRunId === myRun
            ? {
              loading: false,
              viewMode: 'raw',
              rawProof: rawContent,
              decomposeError: (decomp as any).error || 'Failed to decompose the drafted proof.',
              proofHistory: [rawVersion],
              activeVersionIdx: 0,
            }
            : ({} as any),
        );
        lastSavedRaw = rawContent;
        return;
      }

      if ((attempt as any).status === 'PROVED_AS_IS') {
        const steps: Sublemma[] =
          (decomp as any).sublemmas && (decomp as any).sublemmas.length > 0
            ? ((decomp as any).sublemmas as Sublemma[])
            : ([
              {
                title: 'Proof',
                statement: (decomp as any).provedStatement,
                proof:
                  (decomp as any).normalizedProof ||
                  (attempt as any).rawProof ||
                  'Proof unavailable.',
              },
            ] as Sublemma[]);

        const assistantMessage: Message = {
          role: 'assistant',
          content:
            `I've broken down the proof into the following steps:\n\n` +
            steps.map((s: Sublemma) => `**${s.title}:** ${s.statement}`).join('\n\n'),
        };

        const rawContent = (attempt as any).rawProof || '';
        const rawVersion = makeRawVersion((get() as AppState).proofHistory, rawContent);
        const structuredVersion = makeStructuredVersion(
          (get() as AppState).proofHistory,
          rawVersion.baseMajor,
          steps,
          {
            provedStatement: (decomp as any).provedStatement,
            normalizedProof: (decomp as any).normalizedProof || '',
          },
          { userEdited: false, derived: true },
        );

        // Match the streaming UX: reveal Raw Proof first, but keep Structured available.
        set((s: AppState) =>
          s.proofAttemptRunId === myRun
            ? {
              messages: [assistantMessage],
              loading: false,
              error: null,
              viewMode: 'raw',
              rawProof: rawContent,
              proofHistory: [rawVersion, structuredVersion],
              activeVersionIdx: 0,
              decomposedRaw: rawContent,
            }
            : ({} as any),
        );

        lastSavedRaw = rawContent;

        // Silent: compute dependency graph for the new structured version.
        setTimeout(() => {
          void (get() as AppState).ensureGraphForVersion(structuredVersion.id);
        }, 0);
        return;
      }

      // PROVED_VARIANT or similar: keep suggestion but ensure raw version exists
      const rawContent = (attempt as any).rawProof || '';
      const rawVersion = makeRawVersion((get() as AppState).proofHistory, rawContent);
      set((s: AppState) =>
        s.proofAttemptRunId === myRun
          ? {
            loading: false,
            error: null,
            pendingSuggestion: {
              suggested: (attempt as any).finalStatement || (decomp as any).provedStatement,
              variantType: ((attempt as any).variantType as 'WEAKENING' | 'OPPOSITE') ||
                'WEAKENING',
              provedStatement: (decomp as any).provedStatement,
              sublemmas: (decomp as any).sublemmas as Sublemma[],
              explanation: (attempt as any).explanation,
              normalizedProof: (decomp as any).normalizedProof,
              rawProof: (attempt as any).rawProof || undefined,
            },
            proofHistory: [rawVersion],
            activeVersionIdx: 0,
          }
          : ({} as any),
      );
    };

    // Try token streaming first; fallback to metadata-only SSE, then non-streaming
    const hasEventSource = typeof window !== 'undefined' && 'EventSource' in window;
    const canUseEventSource = hasEventSource && shouldUseStreaming(trimmed);
    const shouldTryPostStream = typeof window !== 'undefined' && !canUseEventSource;

    // Intentionally do not log transport switching (GET EventSource vs POST streaming).
    // It's an internal implementation detail and should not surface in the user-facing progress log.

    if (canUseEventSource) {
      const runMetadataSSE = async () => {
        try {
          if (((get() as AppState).proofAttemptRunId || 0) !== myRun) return;
          const url2 = `/api/proof/attempt-sse?problem=${encodeURIComponent(trimmed)}`;
          const es2 = new EventSource(url2);
          let finished2 = false;
          set({
            cancelCurrent: () => {
              try {
                es2.close();
              } catch { }
            },
          });

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
              if (data?.status === 'FAILED') {
                appendLog("Couldn't prove the statement as written. Showing explanation...");
              } else if (data?.status === 'PROVED_VARIANT') {
                appendLog('Proof generated for a revised statement....');
              } else {
                appendLog(`Model produced a proof (len ~${data?.rawProofLen ?? 0})...`);
              }
            } catch { }
          });
          es2.addEventListener('decompose', (ev: MessageEvent) => {
            try {
              const data = JSON.parse(ev.data || '{}');
              appendLog(`Decomposed into ${data?.sublemmasCount ?? 0} step(s)....`);
            } catch { }
          });
          es2.addEventListener('server-error', (ev: MessageEvent) => {
            if (((get() as AppState).proofAttemptRunId || 0) !== myRun) {
              try {
                es2.close();
              } catch { }
              return;
            }
            if (finished2) return;
            finished2 = true;
            try {
              const data = JSON.parse(ev.data || '{}');
              set({
                loading: false,
                error: data?.error || 'Unexpected server error.',
                errorDetails: data?.detail ?? null,
                errorCode: data?.code ?? null,
              });
            } catch {
              set({
                loading: false,
                error: 'Unexpected server error.',
                errorDetails: null,
                errorCode: null,
              });
            }
            try {
              es2.close();
            } catch { }
            set({ cancelCurrent: null });
          });
          es2.addEventListener('done', (ev: MessageEvent) => {
            if (((get() as AppState).proofAttemptRunId || 0) !== myRun) {
              try {
                es2.close();
              } catch { }
              return;
            }
            if (finished2) return;
            finished2 = true;
            try {
              const data = JSON.parse(ev.data || '{}');
              const attempt = data?.attempt;
              const decomp = data?.decompose;
              if (!attempt) {
                set({ loading: false, error: 'Malformed SSE response.' });
                return;
              }

              // IMPORTANT: in the SSE fallback path, always populate rawProof when we have it.
              // Otherwise the UI can end up on Raw Proof view with an empty editor.
              const rawContent = String(attempt.rawProof || '').trim();
              if (attempt.status === 'FAILED') {
                const rawVersion = makeRawVersion((get() as AppState).proofHistory, rawContent);
                set({
                  loading: false,
                  viewMode: 'raw',
                  rawProof: rawContent,
                  error: null,
                  pendingRejection: {
                    explanation: attempt.explanation || 'No details provided.',
                  },
                  proofHistory: [rawVersion],
                  activeVersionIdx: 0,
                });
                lastSavedRaw = rawContent;
              } else if (!decomp) {
                // Decomposition failure is not fatal; allow the user to view/edit Raw Proof.
                const rawVersion = makeRawVersion((get() as AppState).proofHistory, rawContent);
                set({
                  loading: false,
                  viewMode: 'raw',
                  rawProof: rawContent,
                  decomposeError: 'Failed to decompose the drafted proof.',
                  proofHistory: [rawVersion],
                  activeVersionIdx: 0,
                });
                lastSavedRaw = rawContent;
              } else if (attempt.status === 'PROVED_AS_IS') {
                const steps: Sublemma[] =
                  decomp.sublemmas && decomp.sublemmas.length > 0
                    ? (decomp.sublemmas as Sublemma[])
                    : ([
                      {
                        title: 'Proof',
                        statement: decomp.provedStatement,
                        proof:
                          (decomp as any).normalizedProof ||
                          attempt.rawProof ||
                          'Proof unavailable.',
                      },
                    ] as Sublemma[]);
                const assistantMessage: Message = {
                  role: 'assistant',
                  content:
                    `I've broken down the proof into the following steps:\n\n` +
                    steps.map((s: Sublemma) => `**${s.title}:** ${s.statement}`).join('\n\n'),
                };

                const rawVersion = makeRawVersion((get() as AppState).proofHistory, rawContent);
                const structuredVersion = makeStructuredVersion(
                  (get() as AppState).proofHistory,
                  rawVersion.baseMajor,
                  steps,
                  {
                    provedStatement: decomp.provedStatement,
                    normalizedProof: (decomp as any).normalizedProof || '',
                  },
                  { userEdited: false, derived: true },
                );

                // Match the streaming UX: reveal Raw Proof first, but keep Structured available.
                // Users can jump to structured/graph via the sidebar.
                set({
                  messages: [assistantMessage],
                  loading: false,
                  error: null,
                  viewMode: 'raw',
                  rawProof: rawContent,
                  proofHistory: [rawVersion, structuredVersion],
                  activeVersionIdx: 0,
                  decomposedRaw: rawContent,
                });

                lastSavedRaw = rawContent;

                // Silent: compute dependency graph for the new structured version.
                setTimeout(() => {
                  void (get() as AppState).ensureGraphForVersion(structuredVersion.id);
                }, 0);
              } else {
                const rawVersion = makeRawVersion((get() as AppState).proofHistory, rawContent);
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
                  proofHistory: [rawVersion],
                  activeVersionIdx: 0,
                });
              }
            } catch (e) {
              set({
                loading: false,
                error: e instanceof Error ? e.message : 'Unexpected error.',
              });
            } finally {
              try {
                es2.close();
              } catch { }
              set({ cancelCurrent: null });
            }
          });
          es2.onerror = () => {
            if (((get() as AppState).proofAttemptRunId || 0) !== myRun) {
              try {
                es2.close();
              } catch { }
              return;
            }
            try {
              es2.close();
            } catch { }
            set({ cancelCurrent: null });
            appendLog('Metadata stream lost. Falling back to non-streaming...');
            runNonStreaming();
          };
        } catch {
          await runNonStreaming();
        }
      };

      try {
        if (((get() as AppState).proofAttemptRunId || 0) !== myRun) return;
        const url = `/api/proof/attempt-stream?problem=${encodeURIComponent(trimmed)}`;
        const es = new EventSource(url);
        let finished = false;
        let gotDelta = false;
        let gotModelStart = false;
        let sawModelEnd = false;

        // Some browsers/environments can leave EventSource "hanging" without firing `error`.
        // Add a small watchdog: if we don't see any meaningful event quickly, fall back.
        let watchdog: number | null = null;
        const clearWatchdog = () => {
          try {
            if (watchdog != null) window.clearTimeout(watchdog);
          } catch { }
          watchdog = null;
        };
        const armWatchdog = () => {
          clearWatchdog();
          watchdog = window.setTimeout(() => {
            if (((get() as AppState).proofAttemptRunId || 0) !== myRun) return;
            if (finished) return;
            // If we never received model identity or any token, assume stream is stuck.
            if (!gotModelStart && !gotDelta) {
              finished = true;
              try {
                es.close();
              } catch { }
              set({ cancelCurrent: null, isDraftStreaming: false });
              appendLog('Token stream stalled. Falling back to metadata stream...');
              runMetadataSSE();
            }
          }, 4000);
        };
        armWatchdog();

        set({
          cancelCurrent: () => {
            // Mark this attempt as cancelled first, so any queued `error` events short-circuit.
            try {
              set((s: AppState) => ({ proofAttemptRunId: (s.proofAttemptRunId || 0) + 1 }));
            } catch { }
            try {
              es.close();
            } catch { }
            clearWatchdog();
          },
        });
        set({ isDraftStreaming: true, liveDraft: '' });

        es.addEventListener('model.start', (ev: MessageEvent) => {
          if (((get() as AppState).proofAttemptRunId || 0) !== myRun) return;
          clearWatchdog();
          gotModelStart = true;
          try {
            const data = JSON.parse(ev.data || '{}');
            appendLog(`Using ${data?.provider}/${data?.model}...`);
          } catch { }
        });
        es.addEventListener('model.switch', (ev: MessageEvent) => {
          if (((get() as AppState).proofAttemptRunId || 0) !== myRun) return;
          clearWatchdog();
          try {
            const d = JSON.parse(ev.data || '{}');
            if (d?.to) appendLog(`Switched model to ${d.to}...`);
          } catch { }
        });
        es.addEventListener('model.delta', (ev: MessageEvent) => {
          if (((get() as AppState).proofAttemptRunId || 0) !== myRun) return;
          clearWatchdog();
          try {
            const data = JSON.parse(ev.data || '{}');
            const t = data?.text || '';
            if (t) {
              if (!gotDelta) {
                appendLog('Receiving model output...');
                gotDelta = true;
              }
              set((s: AppState) => ({ liveDraft: s.liveDraft + t }));
            }
          } catch { }
        });
        es.addEventListener('model.end', () => {
          if (((get() as AppState).proofAttemptRunId || 0) !== myRun) return;
          clearWatchdog();
          sawModelEnd = true;
          // Draft complete, but we intentionally do NOT reveal it yet.
          // We first wait for classification (event: done) so we can show
          // PROVED_VARIANT suggestions *before* showing a tentative proof.
          set({ isDraftStreaming: false });
          appendLog('Proof draft completed....');
          appendLog('Classifying draft...');
        });
        es.addEventListener('classify.result', (ev: MessageEvent) => {
          if (((get() as AppState).proofAttemptRunId || 0) !== myRun) return;
          clearWatchdog();
          try {
            const d = JSON.parse(ev.data || '{}');
            const st = d?.status;
            if (st === 'PROVED_VARIANT') {
              appendLog('Proof generated for a revised statement....');
            } else if (st === 'FAILED') {
              appendLog("Draft doesn't prove the statement as written. Showing explanation...");
            }
          } catch { }
        });

        // attempt-stream no longer performs decomposition server-side.
        // We do client-side decomposition only on explicit user request.

        es.addEventListener('server-error', (ev: MessageEvent) => {
          if (((get() as AppState).proofAttemptRunId || 0) !== myRun) {
            try {
              es.close();
            } catch { }
            return;
          }
          // IMPORTANT:
          // The server may emit `server-error` after `model.end` (e.g. classification hiccup)
          // and still follow up with a final `done` event (see API route behavior).
          // In that case we should NOT abort+retry, otherwise the user may see a different
          // proof than the one they just watched stream.
          let friendly = 'Token stream failed.';
          let detail: string | null = null;
          let code: string | null = null;
          try {
            const data = JSON.parse(ev.data || '{}');
            if (data?.error) friendly = data.error;
            if (data?.detail) detail = data.detail;
            if (data?.code) code = data.code;
          } catch { }

          // If the draft already completed, keep the stream open and wait for `done`.
          if (sawModelEnd) {
            set({ errorDetails: detail, errorCode: code });
            appendLog(friendly);
            appendLog('Finalizing streamed draft...');
            return;
          }

          if (finished) return;
          finished = true;
          clearWatchdog();
          try {
            es.close();
          } catch { }
          set({
            cancelCurrent: null,
            isDraftStreaming: false,
            errorDetails: detail,
            errorCode: code,
          });
          appendLog(friendly + ' Falling back to metadata stream...');
          runMetadataSSE();
        });

        es.addEventListener('done', (ev: MessageEvent) => {
          if (((get() as AppState).proofAttemptRunId || 0) !== myRun) {
            try {
              es.close();
            } catch { }
            return;
          }
          if (finished) return;
          finished = true;
          clearWatchdog();
          try {
            const data = JSON.parse(ev.data || '{}');
            const attempt = data?.attempt;
            if (!attempt) {
              set({ loading: false, error: 'Malformed stream response.' });
              return;
            }

            // Cache classification outcome.
            set({
              attemptSummary: {
                status: attempt.status,
                finalStatement: attempt.finalStatement ?? null,
                variantType: attempt.variantType ?? null,
                explanation: attempt.explanation || '',
              },
            });

            // IMPORTANT UX RULE:
            // - If PROVED_VARIANT, show the suggestion FIRST and only show the tentative proof after Accept.
            // - Otherwise, reveal the tentative proof immediately.
            const raw = ((attempt.rawProof || (get() as AppState).liveDraft) ?? '').trim();

            if (attempt.status === 'PROVED_VARIANT') {
              const suggested = (attempt.finalStatement || '').trim();
              if (suggested) {
                set({
                  loading: false,
                  pendingSuggestion: {
                    suggested,
                    variantType: (attempt.variantType as 'WEAKENING' | 'OPPOSITE') || 'WEAKENING',
                    provedStatement: suggested,
                    sublemmas: [],
                    explanation: attempt.explanation || '',
                    rawProof: raw || undefined,
                    normalizedProof: undefined,
                  },
                });
              } else {
                // Fallback: no suggested statement; just show the draft.
                const rawVersion = makeRawVersion((get() as AppState).proofHistory, raw);
                set((state: AppState) => ({
                  loading: false,
                  viewMode: 'raw',
                  rawProof: raw,
                  decomposeError: null,
                  isDecomposing: false,
                  proofHistory: [...state.proofHistory, rawVersion],
                  activeVersionIdx: state.proofHistory.length,
                }));
                lastSavedRaw = raw;
              }
              return;
            }

            // Reveal raw proof for PROVED_AS_IS and FAILED.
            if (raw.length > 0) {
              const rawVersion = makeRawVersion((get() as AppState).proofHistory, raw);
              set((state: AppState) => ({
                loading: false,
                viewMode: 'raw',
                rawProof: raw,
                decomposeError: null,
                isDecomposing: false,
                proofHistory: [...state.proofHistory, rawVersion],
                activeVersionIdx: state.proofHistory.length,
                pendingRejection:
                  attempt.status === 'FAILED'
                    ? { explanation: attempt.explanation || 'No details provided.' }
                    : null,
              }));
              lastSavedRaw = raw;

              // Token-streaming path: auto-decompose once the raw proof is revealed.
              // Keep UX on Raw Proof (background structuring) and avoid duplicating work.
              // NOTE: PROVED_VARIANT is handled above (suggestion gate) and will decompose on Accept.
              try {
                const alreadyDecomposed = ((get() as AppState).decomposedRaw || '').trim() === raw;
                if (!alreadyDecomposed && raw.length >= 10) {
                  // Fire-and-forget; runDecomposition internally guards against stale runs.
                  void (get() as AppState).runDecomposition();
                }
              } catch {
                // Ignore: decomposition is best-effort here.
              }
            } else {
              set({
                loading: false,
                pendingRejection:
                  attempt.status === 'FAILED'
                    ? { explanation: attempt.explanation || 'No details provided.' }
                    : null,
              });
            }
          } catch (e) {
            set({
              loading: false,
              error: e instanceof Error ? e.message : 'Unexpected error.',
            });
          } finally {
            try {
              es.close();
            } catch { }
            set({ cancelCurrent: null, isDraftStreaming: false });
            clearWatchdog();
          }
        });

        es.onerror = () => {
          if (((get() as AppState).proofAttemptRunId || 0) !== myRun) {
            try {
              es.close();
            } catch { }
            return;
          }
          if (finished) return;
          finished = true;
          clearWatchdog();
          try {
            es.close();
          } catch { }
          set({ cancelCurrent: null, isDraftStreaming: false });
          // If the user already saw the full draft stream, prefer showing that draft
          // rather than retrying (retrying can yield a different proof).
          if (sawModelEnd) {
            const draft = String((get() as AppState).liveDraft || '').trim();
            if (draft.length > 0) {
              appendLog('Connection lost after draft completion. Showing streamed draft...');
              const rawVersion = makeRawVersion((get() as AppState).proofHistory, draft);
              set((state: AppState) => ({
                loading: false,
                viewMode: 'raw',
                rawProof: draft,
                decomposeError: null,
                isDecomposing: false,
                proofHistory: [...state.proofHistory, rawVersion],
                activeVersionIdx: state.proofHistory.length,
              }));
              lastSavedRaw = draft;
              return;
            }
          }

          appendLog('Token stream connection lost. Falling back to metadata stream...');
          runMetadataSSE();
        };
      } catch (e) {
        appendLog('Token streaming not available. Falling back to metadata stream...');
        await runMetadataSSE();
      }
    } else if (shouldTryPostStream) {
      // POST streaming path: keep token-by-token experience for large statements,
      // without putting the problem into the URL.
      const controller = new AbortController();
      set({
        cancelCurrent: () => {
          try {
            controller.abort();
          } catch {
            // ignore
          }
        },
      });

      try {
        const { consumeSSEStream } = await import('@/lib/sse-client');
        set({ isDraftStreaming: true, liveDraft: '' });

        const res = await fetch('/api/proof/attempt-stream-post', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ problem: trimmed }),
          signal: controller.signal,
        });

        let sawModelEnd = false;
        let gotDelta = false;
        let finished = false;

        await consumeSSEStream(
          res,
          (ev) => {
            if (((get() as AppState).proofAttemptRunId || 0) !== myRun) {
              try {
                controller.abort();
              } catch {
                // ignore
              }
              return;
            }
            if (finished) return;

            const name = ev.event;
            const dataStr = ev.data || '{}';

            // Keepalives are handled by the parser.
            if (name === 'model.start') {
              try {
                const data = JSON.parse(dataStr);
                appendLog(`Using ${data?.provider}/${data?.model}...`);
              } catch {
                // ignore
              }
              return;
            }
            if (name === 'model.delta') {
              try {
                const data = JSON.parse(dataStr);
                const t = data?.text || '';
                if (t) {
                  if (!gotDelta) {
                    appendLog('Receiving model output...');
                    gotDelta = true;
                  }
                  set((s: AppState) => ({ liveDraft: s.liveDraft + t }));
                }
              } catch {
                // ignore
              }
              return;
            }
            if (name === 'model.end') {
              sawModelEnd = true;
              set({ isDraftStreaming: false });
              appendLog('Proof draft completed....');
              appendLog('Classifying draft...');
              return;
            }
            if (name === 'classify.result') {
              try {
                const d = JSON.parse(dataStr);
                const st = d?.status;
                if (st === 'PROVED_VARIANT') {
                  appendLog('Proof generated for a revised statement....');
                } else if (st === 'FAILED') {
                  appendLog("Draft doesn't prove the statement as written. Showing explanation...");
                }
              } catch {
                // ignore
              }
              return;
            }
            if (name === 'server-error') {
              // Mirror EventSource behavior: if error after model.end, keep going and let done settle.
              let friendly = 'Token stream failed.';
              let detail: string | null = null;
              let code: string | null = null;
              try {
                const d = JSON.parse(dataStr);
                if (d?.error) friendly = d.error;
                if (d?.detail) detail = d.detail;
                if (d?.code) code = d.code;
              } catch {
                // ignore
              }

              if (sawModelEnd) {
                set({ errorDetails: detail, errorCode: code });
                appendLog(friendly);
                appendLog('Finalizing streamed draft...');
                return;
              }

              finished = true;
              set({
                cancelCurrent: null,
                isDraftStreaming: false,
                errorDetails: detail,
                errorCode: code,
              });
              appendLog(friendly + ' Retrying...');
              // Fall back to non-streaming for resilience.
              void runNonStreaming();
              return;
            }
            if (name === 'done') {
              finished = true;
              try {
                const data = JSON.parse(dataStr);
                const attempt = data?.attempt;
                if (!attempt) {
                  set({ loading: false, error: 'Malformed stream response.' });
                  return;
                }

                set({
                  attemptSummary: {
                    status: attempt.status,
                    finalStatement: attempt.finalStatement ?? null,
                    variantType: attempt.variantType ?? null,
                    explanation: attempt.explanation || '',
                  },
                });

                const raw = ((attempt.rawProof || (get() as AppState).liveDraft) ?? '').trim();

                if (attempt.status === 'PROVED_VARIANT') {
                  const suggested = (attempt.finalStatement || '').trim();
                  if (suggested) {
                    set({
                      loading: false,
                      pendingSuggestion: {
                        suggested,
                        variantType:
                          (attempt.variantType as 'WEAKENING' | 'OPPOSITE') || 'WEAKENING',
                        provedStatement: suggested,
                        sublemmas: [],
                        explanation: attempt.explanation || '',
                        rawProof: raw || undefined,
                        normalizedProof: undefined,
                      },
                    });
                  } else {
                    const rawVersion = makeRawVersion((get() as AppState).proofHistory, raw);
                    set((state: AppState) => ({
                      loading: false,
                      viewMode: 'raw',
                      rawProof: raw,
                      decomposeError: null,
                      isDecomposing: false,
                      proofHistory: [...state.proofHistory, rawVersion],
                      activeVersionIdx: state.proofHistory.length,
                    }));
                    lastSavedRaw = raw;
                  }
                  return;
                }

                if (raw.length > 0) {
                  const rawVersion = makeRawVersion((get() as AppState).proofHistory, raw);
                  set((state: AppState) => ({
                    loading: false,
                    viewMode: 'raw',
                    rawProof: raw,
                    decomposeError: null,
                    isDecomposing: false,
                    proofHistory: [...state.proofHistory, rawVersion],
                    activeVersionIdx: state.proofHistory.length,
                    pendingRejection:
                      attempt.status === 'FAILED'
                        ? { explanation: attempt.explanation || 'No details provided.' }
                        : null,
                  }));
                  lastSavedRaw = raw;

                  // Auto-decompose once revealed (same as EventSource path)
                  try {
                    const alreadyDecomposed =
                      ((get() as AppState).decomposedRaw || '').trim() === raw;
                    if (!alreadyDecomposed && raw.length >= 10) {
                      void (get() as AppState).runDecomposition();
                    }
                  } catch {
                    // ignore
                  }
                } else {
                  set({
                    loading: false,
                    pendingRejection:
                      attempt.status === 'FAILED'
                        ? { explanation: attempt.explanation || 'No details provided.' }
                        : null,
                  });
                }
              } catch (e) {
                set({
                  loading: false,
                  error: e instanceof Error ? e.message : 'Unexpected error.',
                });
              } finally {
                set({ cancelCurrent: null, isDraftStreaming: false });
              }
            }
          },
          { signal: controller.signal },
        );

        // If the stream ended without a final `done` event and we weren't cancelled,
        // fall back to the non-streaming path to avoid leaving the UI stuck.
        if (!finished && !controller.signal.aborted) {
          appendLog('Connection ended unexpectedly. Retrying...');
          set({ cancelCurrent: null, isDraftStreaming: false });
          await runNonStreaming();
        }
      } catch (e: any) {
        set({ cancelCurrent: null, isDraftStreaming: false });
        appendLog(
          (e?.message || 'Connection lost.') + ' Retrying...',
        );
        await runNonStreaming();
      }
    } else {
      appendLog('Streaming not available. Retrying...');
      await runNonStreaming();
    }
  },

  resumeProof: () => {
    set({ view: 'proof' });
  },

  retry: async () => {
    const p = (get() as AppState).lastProblem;
    if (p) {
      await (get() as AppState).startProof(p, { force: true });
    }
  },

  editProblem: () => {
    set((state: AppState) => ({
      ...state,
      view: 'home',
      loading: false,
      error: null,
      errorDetails: null,
      errorCode: null,
      pendingSuggestion: null,
      pendingRejection: null,
    }));

  },

  setMessages: (updater) => {
    if (typeof updater === 'function') {
      set((state: AppState) => ({
        messages: updater(state.messages),
      }));
    } else {
      set({ messages: updater });
    }
  },

  // Variant handling
  acceptSuggestedChange: () => {
    const s = (get() as AppState).pendingSuggestion;
    if (!s) return;

    // When the suggestion is accepted, we reveal the tentative proof.
    // In streaming mode we might not have decomposed steps yet.
    const rawContent = (s.rawProof || '').trim();
    const provedStatement = (s.provedStatement || s.suggested || '').trim();

    // Ensure a raw version exists in history for this content (avoid bumping majors unnecessarily).
    const curHistory = (get() as AppState).proofHistory;
    let rawIdx = curHistory.findIndex(
      (v) => v.type === 'raw' && (v.content || '').trim() === rawContent,
    );

    let nextHistory = curHistory;
    let rawVersion: ProofVersion | null = rawIdx >= 0 ? curHistory[rawIdx] : null;

    if (!rawVersion) {
      rawVersion = makeRawVersion(curHistory, rawContent);
      nextHistory = [...curHistory, rawVersion];
      rawIdx = nextHistory.length - 1;
    }

    lastSavedRaw = rawContent;

    // Commit the accepted statement and reveal raw proof.
    // Important: only create a structured version immediately if we already have decomposed steps.
    // Otherwise, kick off background decomposition so Structured Proof gets real sublemmas.
    const hasSteps = Array.isArray(s.sublemmas) && s.sublemmas.length > 0;

    if (hasSteps) {
      const steps = s.sublemmas as Sublemma[];
      const structuredVersion = makeStructuredVersion(
        nextHistory,
        rawVersion.baseMajor,
        steps,
        {
          provedStatement,
          normalizedProof: s.normalizedProof || '',
        },
        { userEdited: false, derived: true },
      );

      set({
        problem: provedStatement,
        pendingSuggestion: null,
        viewMode: 'raw',
        rawProof: rawContent,
        proofHistory: [...nextHistory, structuredVersion],
        activeVersionIdx: rawIdx,
        decomposedRaw: rawContent,
        messages: [
          {
            role: 'assistant',
            content:
              `I've broken down the proof into the following steps:\n\n` +
              steps.map((x) => `**${x.title}:** ${x.statement}`).join('\n\n'),
          } as Message,
        ],
      });

      // Silent: compute dependency graph for the new structured version.
      setTimeout(() => {
        void (get() as AppState).ensureGraphForVersion(structuredVersion.id);
      }, 0);

      return;
    }

    // No steps available yet (streaming path): switch to raw immediately and decompose in background.
    set({
      problem: provedStatement,
      pendingSuggestion: null,
      viewMode: 'raw',
      rawProof: rawContent,
      proofHistory: nextHistory,
      activeVersionIdx: rawIdx,
      decomposedRaw: null,
      decomposeMeta: null,
      decomposeError: null,
      messages: [],
    });

    // Fire-and-forget: generates a proper structured version once ready.
    void (get() as AppState).runDecomposition();
  },

  clearSuggestion: () => set({ pendingSuggestion: null }),
  clearRejection: () => set({ pendingRejection: null }),

  // Go back to previous proof version (if any) and ensure steps view
  goBack: () =>
    set((state: AppState) => {
      const nextIdx = Math.max(0, state.activeVersionIdx - 1);
      return {
        activeVersionIdx: nextIdx,
        viewMode: 'structured',
      };
    }),

  proof: () => (get() as AppState).proofHistory[(get() as AppState).activeVersionIdx],

  setActiveVersionIndex: (index) =>
    set((state: AppState) => {
      const nextIdx = Math.max(0, Math.min(index, state.proofHistory.length - 1));
      const next = state.proofHistory[nextIdx];
      if (!next) return state;

      // Default: switch to a sensible mode for the restored version type.
      // If we're currently in Graph view, keep Graph view while switching versions.
      // (Graph should render for whichever structured version is active.)
      const nextViewMode: AppState['viewMode'] =
        state.viewMode === 'graph' ? 'graph' : next.type === 'raw' ? 'raw' : 'structured';

      // Ensure rawProof reflects the restored raw version.
      const nextRawProof = next.type === 'raw' ? (next.content ?? '') : state.rawProof;

      return {
        ...state,
        activeVersionIdx: nextIdx,
        viewMode: nextViewMode,
        rawProof: nextRawProof,
      };
    }),

  addProofVersion: (version) =>
    set((state: AppState) => {
      const next = { ...version, timestamp: new Date() } as any;
      const nextIdx = state.proofHistory.length;
      // Schedule silent auto-graph generation for structured versions.
      if (
        next.type === 'structured' &&
        Array.isArray(next.sublemmas) &&
        next.sublemmas.length > 0
      ) {
        setTimeout(() => {
          void (get() as AppState).ensureGraphForVersion(next.id);
        }, 0);
      }
      return {
        proofHistory: [...state.proofHistory, next],
        activeVersionIdx: nextIdx,
      };
    }),

  updateCurrentProofMeta: (updates) =>
    set((state: AppState) => ({
      proofHistory: state.proofHistory.map((version, idx) =>
        idx === state.activeVersionIdx ? { ...version, ...updates } : version,
      ),
    })),

  updateCurrentProofVersion: (updates) => {
    const cur = (get() as AppState).proofHistory[(get() as AppState).activeVersionIdx];
    if (!cur) return;

    // For raw/structured edits that should be "saved", we append a new version instead of mutating.
    // (Callers can still use updateCurrentProofVersion for truly ephemeral updates, but we prefer new versions.)
    if (cur.type === 'raw') {
      (get() as AppState).addProofVersion({
        ...cur,
        ...updates,
        id: uuid(),
        type: 'raw',
        // Raw edits always bump the major.
        versionNumber: `${(getMaxRawMajor((get() as AppState).proofHistory) || 0) + 1}`,
        baseMajor: (getMaxRawMajor((get() as AppState).proofHistory) || 0) + 1,
        content: typeof updates.content === 'string' ? updates.content : cur.content,
        userEdited: true,
        derived: false,
        sublemmas: [],
        graphData: undefined,
        validationResult: undefined,
        stepValidation: undefined,
        lastEditedStepIdx: null,
      } as any);
      lastSavedRaw = (typeof updates.content === 'string' ? updates.content : cur.content) || '';
      return;
    }

    if (cur.type === 'structured') {
      // Re-route to the existing structured snapshot helper.
      (get() as AppState).snapshotStructuredEdit(updates);
      return;
    }

    // Fallback: mutate (should be rare)
    set((state: AppState) => ({
      proofHistory: state.proofHistory.map((version, idx) =>
        idx === state.activeVersionIdx ? { ...version, ...updates } : version,
      ),
    }));
  },

  updateCurrentStepValidation: ({ stepIndex, result }) =>
    set((state: AppState) => ({
      proofHistory: state.proofHistory.map((version, idx) => {
        if (idx !== state.activeVersionIdx) return version;
        const next = { ...version };
        const prev = next.stepValidation || {};
        if (result) {
          next.stepValidation = { ...prev, [stepIndex]: result };
        } else {
          const { [stepIndex]: _omit, ...rest } = prev;
          next.stepValidation = rest;
        }
        return next;
      }),
    })),

  clearLastEditedStep: () =>
    set((state: AppState) => ({
      proofHistory: state.proofHistory.map((version, idx) =>
        idx === state.activeVersionIdx ? { ...version, lastEditedStepIdx: null } : version,
      ),
    })),

  deleteProofVersion: (id: string) =>
    set((state: AppState) => {
      const history = state.proofHistory;
      const idx = history.findIndex((v) => v.id === id);
      if (idx < 0) return state;

      const target = history[idx];
      const baseMajor = target.baseMajor;

      // Determine deletion set.
      const structuredForMajor = history.filter(
        (v) => v.baseMajor === baseMajor && v.type === 'structured',
      );

      const deleteWholeGroup =
        target.type === 'raw' || (target.type === 'structured' && structuredForMajor.length <= 1);

      const nextHistory = deleteWholeGroup
        ? history.filter((v) => v.baseMajor !== baseMajor)
        : history.filter((v) => v.id !== id);

      // If nothing left, reset proof-specific state to a safe empty.
      if (nextHistory.length === 0) {
        return {
          ...state,
          proofHistory: [],
          activeVersionIdx: 0,
          viewMode: 'raw',
          rawProof: '',
          decomposedRaw: null,
          decomposeMeta: null,
        };
      }

      // Pick next active index.
      // Prefer staying on the same numeric index; if we deleted something before it, shift left.
      let nextActive = state.activeVersionIdx;

      if (idx < state.activeVersionIdx) {
        nextActive = Math.max(0, state.activeVersionIdx - 1);
      }

      // If we deleted the active item (or group), clamp to nearest valid entry.
      nextActive = Math.max(0, Math.min(nextActive, nextHistory.length - 1));

      const next = nextHistory[nextActive];

      // Ensure viewMode makes sense.
      let nextViewMode: AppState['viewMode'] = state.viewMode;
      if (nextViewMode !== 'graph') {
        nextViewMode = next.type === 'raw' ? 'raw' : 'structured';
      } else {
        // Graph mode requires structured; if we ended up on raw, fall back.
        if (next.type === 'raw') nextViewMode = 'raw';
      }

      // Keep rawProof in sync if we are on a raw version.
      const nextRawProof = next.type === 'raw' ? (next.content ?? '') : state.rawProof;

      // If we deleted the only structured for the currently decomposed raw, clear decomposition pointers.
      // (Prevents UI thinking "steps are ready" when no structured versions remain for that major.)
      const stillHasStructuredForMajor = nextHistory.some(
        (v) => v.baseMajor === baseMajor && v.type === 'structured',
      );

      const shouldClearDecomposition =
        deleteWholeGroup || (target.type === 'structured' && !stillHasStructuredForMajor);

      return {
        ...state,
        proofHistory: nextHistory,
        activeVersionIdx: nextActive,
        viewMode: nextViewMode,
        rawProof: nextRawProof,
        decomposedRaw: shouldClearDecomposition ? null : state.decomposedRaw,
        decomposeMeta: shouldClearDecomposition ? null : state.decomposeMeta,
      };
    }),

  setViewMode: (mode) =>
    set((state: AppState) => {
      if (state.viewMode === mode) return state;

      // If the user changes the proof view, hide any previous analysis output and
      // cancel any in-flight analysis run (best-effort).
      const clearedHistory = state.proofHistory.map((v, idx) =>
        idx === state.activeVersionIdx ? { ...v, validationResult: undefined } : v,
      );

      const current = state.proofHistory[state.activeVersionIdx];
      const baseMajor = current?.baseMajor;

      const pickLast = (predicate: (v: ProofVersion) => boolean): number | null => {
        for (let i = state.proofHistory.length - 1; i >= 0; i--) {
          if (predicate(state.proofHistory[i])) return i;
        }
        return null;
      };

      let nextIdx = state.activeVersionIdx;
      if (mode === 'structured') {
        nextIdx =
          (baseMajor != null
            ? pickLast((v) => v.type === 'structured' && v.baseMajor === baseMajor)
            : null) ??
          pickLast((v) => v.type === 'structured') ??
          state.activeVersionIdx;
      } else if (mode === 'raw') {
        nextIdx =
          (baseMajor != null
            ? pickLast((v) => v.type === 'raw' && v.baseMajor === baseMajor)
            : null) ??
          pickLast((v) => v.type === 'raw') ??
          state.activeVersionIdx;
      }

      const next = state.proofHistory[nextIdx];
      return {
        viewMode: mode,
        activeVersionIdx: nextIdx,
        rawProof: mode === 'raw' ? (next?.content ?? state.rawProof) : state.rawProof,

        // cancel analysis + clear analysis result on view change
        isAnalyzingProof: false,
        analyzeProofRunId: (state.analyzeProofRunId || 0) + 1,
        proofHistory: clearedHistory,
      };
    }),

  toggleStructuredView: () =>
    set((state: AppState) => ({
      viewMode: state.viewMode === 'structured' ? 'raw' : 'structured',
    })),

  setRawProof: (raw) => {
    const next = raw ?? '';

    // Update editor state only. Do NOT mutate existing history entries.
    set((state: AppState) => {
      const cur = state.rawProof;
      if (cur === next) return state;
      const trimmedNext = (next || '').trim();
      const trimmedDecomposed = (state.decomposedRaw || '').trim();
      const decompositionIsStale = !!trimmedDecomposed && trimmedNext !== trimmedDecomposed;
      return {
        rawProof: next,
        decomposeError: null,
        decomposeMeta: null,
        decomposedRaw: decompositionIsStale ? null : state.decomposedRaw,
        pendingSuggestion: null,
      };
    });

    // Debounced autosave: append a new raw major version after 3s idle if content changed.
    // This guarantees every saved raw edit becomes a new history entry.
    try {
      if (typeof window !== 'undefined') {
        if (rawAutosaveTimer) window.clearTimeout(rawAutosaveTimer);
        rawAutosaveTimer = window.setTimeout(() => {
          const cur = ((get() as AppState).rawProof || '').trim();
          if (!cur) return;
          if (cur === lastSavedRaw) return;

          const history = (get() as AppState).proofHistory;

          // compute next raw major
          const maxMajor = history.reduce(
            (m, v) => (v.type === 'raw' ? Math.max(m, v.baseMajor) : m),
            0,
          );
          const nextMajor = (maxMajor || 0) + 1;

          (get() as AppState).addProofVersion({
            id: uuid(),
            type: 'raw',
            versionNumber: `${nextMajor}`,
            baseMajor: nextMajor,
            content: cur,
            sublemmas: [],
            userEdited: true,
            derived: false,
            graphData: undefined,
            validationResult: undefined,
            stepValidation: undefined,
            lastEditedStepIdx: null,
          } as any);

          lastSavedRaw = cur;
        }, 3000);
      }
    } catch {
      /* ignore timers in SSR */
    }
  },

  runDecomposition: async () => {
    const raw = ((get() as AppState).rawProof || '').trim();
    if (raw.length < 10) return;

    const myRun = ++decomposeRunId;
    set({ isDecomposing: true, decomposeError: null });

    try {
      const result = await decomposeRawProofAction(raw);
      if (decomposeRunId !== myRun) return;

      if (!(result as any)?.success) {
        set({
          isDecomposing: false,
          decomposeError: (result as any).error || 'Failed to decompose proof.',
        });
        return;
      }

      const steps: Sublemma[] =
        (result as any).sublemmas && (result as any).sublemmas.length > 0
          ? ((result as any).sublemmas as Sublemma[])
          : ([
            {
              title: 'Proof',
              statement: (result as any).provedStatement,
              proof: (result as any).normalizedProof || raw || 'Proof unavailable.',
            },
          ] as Sublemma[]);

      // Update decompose meta (used for toasts / context).
      // IMPORTANT: do NOT mutate existing versions here. Decomposition results are persisted
      // only by appending a new structured ProofVersion below.
      set((state: AppState) => ({
        isDecomposing: false,
        decomposeError: null,
        decomposeMeta: {
          provedStatement: (result as any).provedStatement,
          normalizedProof: (result as any).normalizedProof || '',
        },
        decomposedRaw: raw,
        stepsReadyNonce: state.stepsReadyNonce + 1,
      }));

      // Create a new structured version.
      const history = (get() as AppState).proofHistory;

      // Determine which raw major this structured version should attach to.
      // Priority:
      // 1) If the currently active version is a raw entry, attach to its baseMajor (user restored a prior raw).
      // 2) Else if rawProof matches a saved raw entry, attach to that baseMajor.
      // 3) Else fall back to latest raw major.
      const active = (get() as AppState).proof();
      const getCurrentRawBaseMajor = (get() as AppState).getCurrentRawBaseMajor;
      const baseMajor =
        (active?.type === 'raw' ? active.baseMajor : null) ??
        getCurrentRawBaseMajor() ??
        (getMaxRawMajor(history) || 0);

      const structuredVersion = makeStructuredVersion(
        history,
        baseMajor || 1,
        steps,
        {
          provedStatement: (result as any).provedStatement,
          normalizedProof: (result as any).normalizedProof || '',
        },
        { userEdited: false, derived: true },
      );

      // Append a new structured version.
      // IMPORTANT: keep the user's currently selected version stable (this often runs in the background).
      set((state: AppState) => {
        const nextIdx = state.proofHistory.length;
        const shouldActivate = state.viewMode === 'structured';
        const next = { ...structuredVersion, timestamp: new Date() } as any;
        // Schedule silent auto-graph generation for the new structured version.
        setTimeout(() => {
          void (get() as AppState).ensureGraphForVersion(next.id);
        }, 0);
        return {
          proofHistory: [...state.proofHistory, next],
          activeVersionIdx: shouldActivate ? nextIdx : state.activeVersionIdx,
        };
      });
    } catch (e: any) {
      if (decomposeRunId !== myRun) return;
      set({ isDecomposing: false, decomposeError: e?.message || 'Failed to decompose proof.' });
    }
  },

  getCurrentRawBaseMajor: () => {
    const raw = ((get() as AppState).rawProof || '').trim();
    if (!raw) return null;
    const history = (get() as AppState).proofHistory;
    // Prefer exact content match, else fall back to max raw major.
    const exact = history
      .filter((v) => v.type === 'raw' && (v.content || '').trim() === raw)
      .map((v) => v.baseMajor);
    if (exact.length) return Math.max(...exact);
    const max = history.filter((v) => v.type === 'raw').map((v) => v.baseMajor);
    return max.length ? Math.max(...max) : null;
  },

  hasUserEditedStructuredForBaseMajor: (baseMajor: number) => {
    const history = (get() as AppState).proofHistory;
    return history.some(
      (v) => v.type === 'structured' && v.baseMajor === baseMajor && v.userEdited,
    );
  },

  hasUserEditedStructuredForCurrentRaw: () => {
    const base = (get() as AppState).getCurrentRawBaseMajor();
    if (!base) return false;
    return (get() as AppState).hasUserEditedStructuredForBaseMajor(base);
  },

  snapshotStructuredEdit: (updates) => {
    const cur = (get() as AppState).proof();
    // Robust behavior:
    // - If we're currently on a structured version, snapshot as a new structured minor version.
    // - If we're currently on a raw version (common when accepting chat-proposed changes),
    //   still create a structured version attached to the current raw baseMajor and switch the UI
    //   to Structured view so the user sees the result immediately.
    if (!cur) return;

    if (cur.type !== 'structured') {
      const nextSublemmas = (updates as any)?.sublemmas as Sublemma[] | undefined;
      if (!Array.isArray(nextSublemmas) || nextSublemmas.length === 0) {
        // No structured payload; fall back to the generic updater.
        (get() as AppState).updateCurrentProofVersion({ ...updates, userEdited: true });
        return;
      }

      const history = (get() as AppState).proofHistory;
      const baseMajor =
        ((get() as AppState).getCurrentRawBaseMajor && (get() as AppState).getCurrentRawBaseMajor()) ||
        (getMaxRawMajor(history) || 1);

      const structuredVersion = makeStructuredVersion(
        history,
        baseMajor,
        nextSublemmas,
        {
          provedStatement: (updates as any)?.structured?.provedStatement,
          normalizedProof:
            (updates as any)?.structured?.normalizedProof || (updates as any)?.content || '',
        },
        { userEdited: true, derived: false },
      );

      (get() as AppState).addProofVersion(structuredVersion as any);
      set({ viewMode: 'structured' });
      return;
    }

    const history = (get() as AppState).proofHistory;
    const baseMajor = cur.baseMajor;

    const next = makeStructuredVersion(
      history,
      baseMajor,
      (updates.sublemmas as Sublemma[]) ?? cur.sublemmas,
      {
        provedStatement: updates.structured?.provedStatement ?? cur.structured?.provedStatement,
        normalizedProof: updates.structured?.normalizedProof ?? cur.structured?.normalizedProof,
      },
      { userEdited: true, derived: false },
    );

    // Carry over other fields from the current version unless overridden.
    (get() as AppState).addProofVersion({
      ...next,
      // Allow callers to override a subset
      ...updates,
      id: next.id,
      type: 'structured',
      baseMajor,
      versionNumber: next.versionNumber,
      userEdited: true,
      derived: false,
      sublemmas: (updates.sublemmas as Sublemma[]) ?? next.sublemmas,
      structured: {
        provedStatement: next.structured?.provedStatement,
        normalizedProof: next.structured?.normalizedProof,
        ...(updates.structured || {}),
      },
      content:
        updates.content ??
        next.structured?.normalizedProof ??
        (typeof cur.content === 'string' ? cur.content : ''),
      validationResult: updates.validationResult ?? undefined,
      stepValidation: (updates as any).stepValidation,
      lastEditedStepIdx: (updates as any).lastEditedStepIdx ?? null,
      graphData: (updates as any).graphData,
    } as any);

    set({ viewMode: 'structured' });
  },
});
