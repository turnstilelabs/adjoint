'use client';

import { Button } from './ui/button';
import { LogoSmall } from './logo-small';
import { FileDown, History, MessageCircle, ListTree, Network, Sparkles, Loader2, Plus } from 'lucide-react';
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
import { ConfirmResetDialog } from '@/components/confirm-reset-dialog';

export function ProofSidebar() {
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
  const [openResetConfirm, setOpenResetConfirm] = useState(false);
  const [openAddToWorkspaceConfirm, setOpenAddToWorkspaceConfirm] = useState(false);

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
  const reset = useAppStore((s) => s.reset);
  const goToWorkspace = useAppStore((s) => s.goToWorkspace);

  const onClickLogo = () => {
    setOpenResetConfirm(true);
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
    if (curProblem) {
      lines.push('% --- Imported from Prove mode ---');
      lines.push('% Statement');
      lines.push(curProblem);
      lines.push('');
    }

    if (curView === 'raw') {
      lines.push('% Raw proof');
      lines.push(curRaw || '');
      return lines.join('\n').trim();
    }

    // structured/graph -> store structured steps
    const steps = curProof?.sublemmas ?? [];
    lines.push('% Structured proof');
    if (!steps.length) {
      // fallback: if no steps, still include raw
      lines.push(curRaw || '');
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

    return lines.join('\n').trim();
  };

  const onConfirmAddToWorkspace = () => {
    try {
      const snippet = buildWorkspaceSnippetFromCurrentProof();
      if (!snippet.trim()) {
        toast({
          title: 'Nothing to add',
          description: 'Generate or edit a proof first.',
        });
        return;
      }
      goToWorkspace({ from: 'proof', append: snippet });
      toast({
        title: 'Added to Workspace',
        description: 'The current proof was appended to your workspace draft.',
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

  // Prover mode (Proof view) should not show the "Add to workspace" CTA.
  const showAddToWorkspaceCta = view !== 'proof';

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
              onClick={() => setOpenAddToWorkspaceConfirm(true)}
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
        <AlertDialog open={openAddToWorkspaceConfirm} onOpenChange={setOpenAddToWorkspaceConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Add this proof to Workspace?</AlertDialogTitle>
              <AlertDialogDescription>
                This will append the current proof ({viewMode === 'raw' ? 'raw' : 'structured'}) to your current workspace draft.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setOpenAddToWorkspaceConfirm(false);
                  onConfirmAddToWorkspace();
                }}
              >
                Add
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      <ConfirmResetDialog
        open={openResetConfirm}
        onOpenChange={setOpenResetConfirm}
        onConfirm={reset}
      />
    </>
  );
}
