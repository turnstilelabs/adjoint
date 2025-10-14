'use client';

import { Button } from './ui/button';
import { LogoSmall } from './logo-small';
import { FileDown, Share2, History, MessageCircle } from 'lucide-react';
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
  const reset = useAppStore((s) => s.reset);

  const onToggleHistory = () => {
    setIsHistoryOpen((prev) => {
      const opening = !prev;
      if (opening) setIsChatOpen(false);
      return opening;
    });
  };

  const onToggleGraph = () => {
    setViewMode(viewMode === 'graph' ? 'steps' : 'graph');
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
          <Button variant="ghost" size="icon" title="History" onClick={onToggleHistory}>
            <History />
            <span className="sr-only">History</span>
          </Button>
          <Button variant="ghost" size="icon" title="Graph" onClick={onToggleGraph}>
            <Share2 />
            <span className="sr-only">Graph</span>
          </Button>
          <Button variant="ghost" size="icon" title="Chat" onClick={onToggleChat}>
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
        <aside className="w-80 border-r flex flex-col h-screen bg-card">
          <ProofHistory />
        </aside>
      )}
    </>
  );
}
