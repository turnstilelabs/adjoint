'use client';

import { Button } from './ui/button';
import { LogoSmall } from './logo-small';
import {
  FileDown,
  History,
  MessageCircle,
  ListTree,
  Network,
  Sparkles,
  Loader2,
  Plus,
  Settings,
} from 'lucide-react';
import { useAppStore } from '@/state/app-store';
import { useToast } from '@/hooks/use-toast';
import { exportProofTex, exportRawProofTex } from '@/lib/export-tex';
import { ProofHistory } from '@/components/proof-history';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  getCurrentWorkspaceProjectId,
  loadWorkspaceProject,
  saveWorkspaceProject,
  setCurrentWorkspaceProjectId,
} from '@/lib/persistence/workspace-projects';
import { ToastAction } from '@/components/ui/toast';
import { WorkspacePickerDialog } from '@/components/workspace/workspace-picker-dialog';
import { AiSettingsSheet } from '@/components/ai/ai-settings-sheet';

export function ProofSidebar() {
  const router = useRouter();
  const { toast } = useToast();

  // Hover hint coming from the “Where to go from here” callout.
  // Kept as local UI state (no global store changes).
  const [hoverHint, setHoverHint] = useState<
    'structured' | 'graph' | 'chat' | 'analyze' | 'workspace' | null
  >(null);

  useEffect(() => {
    const onHover = (evt: any) => {
      const id = (evt?.detail?.id ?? null) as any;
      setHoverHint(id || null);
    };
    try {
      window.addEventListener('adjoint:proofSidebarHover', onHover as any);
      return () => window.removeEventListener('adjoint:proofSidebarHover', onHover as any);
    } catch {
      return;
    }
  }, []);

  const [openAnalyzeConfirm, setOpenAnalyzeConfirm] = useState(false);
  const [openAddToWorkspacePicker, setOpenAddToWorkspacePicker] = useState(false);

  const proof = useAppStore((s) => s.proof());
  const view = useAppStore((s) => s.view);

  const { isChatOpen, viewMode, problem, isHistoryOpen, rawProof, proofHistory } = useAppStore((s) => ({
    isChatOpen: s.isChatOpen,
    viewMode: s.viewMode,
    problem: s.problem,
    isHistoryOpen: s.isHistoryOpen,
    rawProof: s.rawProof,
    proofHistory: s.proofHistory,
  }));
  const setIsChatOpen = useAppStore((s) => s.setIsChatOpen);
  const setIsHistoryOpen = useAppStore((s) => s.setIsHistoryOpen);
  const setViewMode = useAppStore((s) => s.setViewMode);
  const analyzeCurrentProof = useAppStore((s) => s.analyzeCurrentProof);
  const cancelAnalyzeCurrentProof = useAppStore((s) => s.cancelAnalyzeCurrentProof);
  const isAnalyzingProof = useAppStore((s) => s.isAnalyzingProof);
  const runDecomposition = useAppStore((s) => s.runDecomposition);
  const hasUserEditedStructuredForCurrentRaw = useAppStore((s) => s.hasUserEditedStructuredForCurrentRaw);

  const onClickLogo = () => {
    // Phase 1 routing: preserve in-memory state, just navigate home.
    router.push('/');
  };

  const hasStructuredSteps = (proof?.sublemmas?.length ?? 0) > 0;

  const onToggleHistory = () => {
    setIsHistoryOpen((prev) => {
      const opening = !prev;
      if (opening) setIsChatOpen(false);
      return opening;
    });
  };

  // Toggle between raw and structured:
  // - in structured/graph view: this button becomes "Raw proof" and goes back to raw
  // - in raw view: it becomes "Structured proof" (and triggers decomposition if needed)
  const onGoStructured = async () => {
    // In structured mode, the button acts as "Raw proof".
    if (useAppStore.getState().viewMode === 'structured') {
      setViewMode('raw');
      return;
    }

    // If user is currently in graph view, this button acts as a back button.
    if (useAppStore.getState().viewMode === 'graph') {
      setViewMode('structured');
      return;
    }

    const cur = useAppStore.getState().proof();
    const baseMajor = cur?.baseMajor;
    const hasStructuredForMajor =
      baseMajor != null &&
      proofHistory.some((v) => v.type === 'structured' && v.baseMajor === baseMajor);

    const activeRaw = cur?.type === 'raw' ? cur : null;
    const rawIsDirty =
      !!activeRaw && (rawProof || '').trim() !== ((activeRaw.content || '') as string).trim();

    // Switch into structured view.
    setViewMode('structured');

    // If we already have a structured version and raw hasn't changed, don't recompute.
    if (hasStructuredForMajor && !rawIsDirty) return;

    // If the user has edited the structured proof for this raw, avoid auto-overwriting by generating a new derived version.
    // They can still explicitly re-structure later via other controls.
    if (hasUserEditedStructuredForCurrentRaw()) return;

    // Otherwise, generate structured steps in the background.
    // `runDecomposition` will activate the newly created structured version if viewMode==='structured'.
    try {
      await runDecomposition();
    } catch {
      // errors are surfaced via store state/UI; ignore here
    }
  };

  const onToggleChat = () => {
    setIsChatOpen((prev) => {
      const opening = !prev;
      if (opening) setIsHistoryOpen(false);
      return opening;
    });
  };

  const onGoGraph = () => {
    if (!hasStructuredSteps) {
      toast({
        title: 'Graph unavailable',
        description: 'Structure the proof before to display the graph.',
      });
      return;
    }
    setViewMode('graph');
  };

  const onExportTex = () => {
    if (!problem) return;
    try {
      if (viewMode === 'raw') {
        exportRawProofTex(problem, rawProof || '');
      } else {
        if (!proof) return;
        exportProofTex(problem, proof.sublemmas);
      }
      toast({
        title: 'Exported',
        description: 'LaTeX file downloaded as proof.tex',
      });
    } catch (e: any) {
      toast({
        title: 'Export Failed',
        description: e?.message || 'Could not export LaTeX.',
        variant: 'destructive',
      });
    }
  };

  const buildWorkspaceSnippetFromCurrentProof = () => {
    const curProblem = (useAppStore.getState().problem || '').trim();
    const curView = useAppStore.getState().viewMode;
    const curProof = useAppStore.getState().proof();
    const curRaw = (useAppStore.getState().rawProof || '').trim();

    const lines: string[] = [];
    // Wrap the inserted content in comment markers (so it’s easy to find/remove later).
    lines.push('% --- Imported from Prove mode ---');

    if (curProblem) {
      lines.push('% Statement');
      lines.push(curProblem);
      lines.push('');
    }

    if (curView === 'raw') {
      lines.push('% Raw proof');
      lines.push(curRaw || '');
      lines.push('');
      lines.push('% --- End import from Prove mode ---');
      return lines.join('\n').trim();
    }

    // structured/graph -> store structured steps
    const steps = curProof?.sublemmas ?? [];
    lines.push('% Structured proof');
    if (!steps.length) {
      // fallback: if no steps, still include raw
      lines.push(curRaw || '');
      lines.push('');
      lines.push('% --- End import from Prove mode ---');
      return lines.join('\n').trim();
    }

    for (const s of steps) {
      const title = (s.title || '').trim();
      if (title) lines.push(`% ${title}`);
      if (s.statement) lines.push(s.statement);
      if (s.proof) {
        lines.push(s.proof);
      }
      lines.push('');
    }

    lines.push('% --- End import from Prove mode ---');

    return lines.join('\n').trim();
  };

  const appendToWorkspaceDoc = (prevDoc: string, append: string) => {
    const prev = String(prevDoc ?? '');
    const a = String(append ?? '').trim();
    if (!a) return prev;
    return prev.trim().length > 0
      ? `${prev.replace(/\s*$/, '')}\n\n${a}\n`
      : `${a}\n`;
  };

  const onConfirmAddToWorkspace = (workspaceId: string) => {
    try {
      const snippet = buildWorkspaceSnippetFromCurrentProof();
      if (!snippet.trim()) {
        toast({
          title: 'Nothing to add',
          description: 'Generate or edit a proof first.',
        });
        return;
      }

      const targetId = String(workspaceId || '').trim();
      if (!targetId) {
        toast({
          title: 'No Workspace selected',
          description: 'Create a Workspace first, then try again.',
          variant: 'destructive',
        });
        return;
      }

      // Prefer in-memory doc/messages if we're appending to the currently-selected workspace,
      // because localStorage autosave is debounced and might lag behind.
      const curId = getCurrentWorkspaceProjectId();
      const state = useAppStore.getState();
      const isCurrent = curId && curId === targetId;

      const persisted = loadWorkspaceProject(targetId);
      const baseDoc =
        isCurrent && (state.workspaceDoc || '').trim().length > 0
          ? String(state.workspaceDoc || '')
          : String(persisted?.doc || '');
      const baseMessages =
        isCurrent && (state.workspaceMessages || []).length > 0
          ? (state.workspaceMessages as any)
          : ((persisted?.messages ?? []) as any);
      const uiState = persisted?.uiState ?? {};

      const nextDoc = appendToWorkspaceDoc(baseDoc, snippet);
      saveWorkspaceProject(targetId, {
        doc: nextDoc,
        messages: baseMessages,
        uiState,
      });
      setCurrentWorkspaceProjectId(targetId);

      // Also update in-memory state so Workspace opens immediately with the right doc.
      // (Route hydration only applies when the store is empty.)
      useAppStore.setState({
        workspaceDoc: nextDoc,
        workspaceMessages: baseMessages,
      } as any);

      setOpenAddToWorkspacePicker(false);
      toast({
        title: 'Added to Workspace',
        description: 'The current proof was appended.',
        action: (
          <ToastAction altText="Open workspace" onClick={() => router.push('/workspace')}>
            Open workspace
          </ToastAction>
        ),
      });
    } catch (e: any) {
      toast({
        title: 'Failed to add to Workspace',
        description: e?.message || 'Unexpected error.',
        variant: 'destructive',
      });
    }
  };

  const onAnalyze = async () => {
    // Analysis is disabled in graph view (by design).
    if (viewMode === 'graph') return;
    if (isAnalyzingProof) {
      cancelAnalyzeCurrentProof();
      return;
    }
    await analyzeCurrentProof();
  };

  const onClickAnalyze = () => {
    if (viewMode === 'graph') return;
    if (isAnalyzingProof) {
      // While running, clicking acts as cancel (no confirm).
      cancelAnalyzeCurrentProof();
      return;
    }
    setOpenAnalyzeConfirm(true);
  };

  const exportDisabled =
    viewMode === 'raw' ? !(rawProof || '').trim() : !proof || proof.sublemmas.length === 0;

  // Allow adding to Workspace as long as we have *either* raw proof text or structured steps.
  // (In some edge states, structured steps might be empty but raw text is available.)
  const addToWorkspaceDisabled =
    !((rawProof || '').trim()) && (!proof || (proof.sublemmas?.length ?? 0) === 0);

  // Only show this CTA in Prover mode.
  const showAddToWorkspaceCta = view === 'proof';

  return (
    <>
      <aside className="w-14 flex flex-col items-center py-4 border-r bg-card shrink-0">
        <div className="mb-6 cursor-pointer" onClick={onClickLogo}>
          <LogoSmall />
        </div>
        <div className="flex flex-col items-center space-y-2">
          <Button
            data-proof-action="history"
            variant="ghost"
            size="icon"
            title="History"
            onClick={onToggleHistory}
            className={isHistoryOpen ? 'bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary' : ''}
          >
            <History />
            <span className="sr-only">History</span>
          </Button>
          <Button
            data-proof-action="structured"
            variant="ghost"
            size="icon"
            title={
              viewMode === 'structured'
                ? 'Raw proof'
                : viewMode === 'graph'
                  ? 'Back to Structured proof'
                  : 'Structured proof'
            }
            onClick={onGoStructured}
            className={
              viewMode === 'structured' || viewMode === 'graph'
                ? 'bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary'
                : hoverHint === 'structured'
                  ? 'ring-1 ring-primary/25'
                  : ''
            }
          >
            <ListTree />
            <span className="sr-only">{viewMode === 'structured' ? 'Raw proof' : 'Structured proof'}</span>
          </Button>
          <Button
            data-proof-action="graph"
            variant="ghost"
            size="icon"
            title="Graph"
            onClick={onGoGraph}
            className={
              viewMode === 'graph'
                ? 'bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary'
                : hoverHint === 'graph'
                  ? 'ring-1 ring-primary/25'
                  : ''
            }
          >
            <Network />
            <span className="sr-only">Graph</span>
          </Button>
          <Button
            data-proof-action="chat"
            variant="ghost"
            size="icon"
            title="Chat"
            onClick={onToggleChat}
            className={
              isChatOpen
                ? 'bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary'
                : hoverHint === 'chat'
                  ? 'ring-1 ring-primary/25'
                  : ''
            }
          >
            {isChatOpen ? <MessageCircle /> : <MessageCircle />}
            <span className="sr-only">Chat</span>
          </Button>
          {viewMode !== 'graph' && (
            <Button
              data-proof-action="analyze"
              variant="ghost"
              size="icon"
              title={isAnalyzingProof ? 'Cancel analysis' : 'Analyze'}
              onClick={onClickAnalyze}
              className={
                isAnalyzingProof
                  ? 'text-primary'
                  : hoverHint === 'analyze'
                    ? 'ring-1 ring-primary/25'
                    : undefined
              }
            >
              {isAnalyzingProof ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles />}
              <span className="sr-only">{isAnalyzingProof ? 'Cancel analysis' : 'Analyze'}</span>
            </Button>
          )}
          {showAddToWorkspaceCta && (
            <Button
              data-proof-action="workspace"
              variant="ghost"
              size="icon"
              title="Add to Workspace"
              onClick={() => setOpenAddToWorkspacePicker(true)}
              disabled={addToWorkspaceDisabled}
              className={hoverHint === 'workspace' ? 'ring-1 ring-primary/25' : undefined}
            >
              <Plus />
              <span className="sr-only">Add to Workspace</span>
            </Button>
          )}
          <Button
            data-proof-action="export"
            variant="ghost"
            size="icon"
            title="Export .tex"
            onClick={onExportTex}
            disabled={exportDisabled}
          >
            <FileDown />
            <span className="sr-only">Export .tex</span>
          </Button>
          <AiSettingsSheet
            trigger={
              <Button
                data-proof-action="ai-settings"
                variant="ghost"
                size="icon"
                title="AI Settings"
              >
                <Settings />
                <span className="sr-only">AI Settings</span>
              </Button>
            }
          />
        </div>
        <div className="flex-1" />
      </aside>
      {isHistoryOpen && (
        <>
          {/* Click-outside overlay to close history panel (mobile) */}
          <div
            className="fixed inset-0 z-20 bg-transparent xl:hidden"
            onClick={() => setIsHistoryOpen(false)}
            aria-hidden="true"
          />
          <aside className="fixed inset-y-0 left-14 z-30 w-[calc(100vw-3.5rem)] max-w-sm bg-card h-screen flex flex-col border-r shrink-0 md:static md:w-80">
            <ProofHistory />
          </aside>
        </>
      )}

      <AlertDialog open={openAnalyzeConfirm} onOpenChange={setOpenAnalyzeConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Analyze this proof with AI?</AlertDialogTitle>
            <AlertDialogDescription>
              Adjoint will send the current proof to an AI model to generate an automated analysis.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setOpenAnalyzeConfirm(false);
                void onAnalyze();
              }}
            >
              Analyze
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {showAddToWorkspaceCta && (
        <WorkspacePickerDialog
          open={openAddToWorkspacePicker}
          onOpenChange={setOpenAddToWorkspacePicker}
          title="Add to Workspace"
          description="Choose which workspace to append the current proof."
          confirmLabel="Add"
          onConfirm={(workspaceId) => {
            onConfirmAddToWorkspace(workspaceId);
          }}
        />
      )}

    </>
  );
}
