'use client';

import { Button } from './ui/button';
import { LogoSmall } from './logo-small';
import { FileDown, History, MessageCircle, Share2, FileText } from 'lucide-react';
import { useAppStore } from '@/state/app-store';
import { useToast } from '@/hooks/use-toast';
import { exportProofTex } from '@/lib/export-tex';
import { ProofHistory } from '@/components/proof-history';

export function ProofSidebar() {
  const { toast } = useToast();

  const proof = useAppStore((s) => s.proof());

  const { isChatOpen, viewMode, problem, isHistoryOpen } = useAppStore((s) => ({
    isChatOpen: s.isChatOpen,
    viewMode: s.viewMode,
    problem: s.problem,
    isHistoryOpen: s.isHistoryOpen,
  }));
  const setIsChatOpen = useAppStore((s) => s.setIsChatOpen);
  const setIsHistoryOpen = useAppStore((s) => s.setIsHistoryOpen);
  const setViewMode = useAppStore((s) => s.setViewMode);
  const toggleStructuredView = useAppStore((s) => s.toggleStructuredView);
  const reset = useAppStore((s) => s.reset);

  const onToggleHistory = () => {
    setIsHistoryOpen((prev) => {
      const opening = !prev;
      if (opening) setIsChatOpen(false);
      return opening;
    });
  };

  const onToggleRaw = () => {
    if (viewMode === 'raw') {
      toggleStructuredView();
    } else {
      setViewMode('raw');
    }
  };

  const rawToggleLabel = viewMode === 'raw' ? 'Structured proof' : 'Raw proof';

  const onToggleGraph = () => {
    setViewMode(viewMode === 'graph' ? 'structured' : 'graph');
  };

  const onToggleChat = () => {
    setIsChatOpen((prev) => {
      const opening = !prev;
      if (opening) setIsHistoryOpen(false);
      return opening;
    });
  };

  const onExportTex = () => {
    if (!problem || !proof) return;
    try {
      exportProofTex(problem, proof.sublemmas);
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

  const exportDisabled = !proof || proof.sublemmas.length === 0;

  return (
    <>
      <aside className="w-14 flex flex-col items-center py-4 border-r bg-card shrink-0">
        <div className="mb-6 cursor-pointer" onClick={reset}>
          <LogoSmall />
        </div>
        <div className="flex flex-col items-center space-y-2">
          <Button
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
            variant="ghost"
            size="icon"
            title={rawToggleLabel}
            onClick={onToggleRaw}
            className={viewMode === 'raw' ? 'bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary' : ''}
          >
            <FileText />
            <span className="sr-only">{rawToggleLabel}</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="Graph"
            onClick={onToggleGraph}
            className={viewMode === 'graph' ? 'bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary' : ''}
          >
            <Share2 />
            <span className="sr-only">Graph</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="Chat"
            onClick={onToggleChat}
            className={isChatOpen ? 'bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary' : ''}
          >
            {isChatOpen ? <MessageCircle /> : <MessageCircle />}
            <span className="sr-only">Chat</span>
          </Button>
          <Button
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
    </>
  );
}
