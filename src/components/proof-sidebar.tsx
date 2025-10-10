"use client";

import Link from "next/link";
import { Button } from "./ui/button";
import { LogoSmall } from "./logo-small";
import { History, GitMerge, PanelRightClose, PanelRightOpen, FileDown } from "lucide-react";
import { useAppStore } from "@/state/app-store";
import { generateProofGraphAction } from "@/app/actions";
import { useToast } from "@/hooks/use-toast";
import { exportProofTex } from "@/lib/export-tex";

export function ProofSidebar() {
  const { toast } = useToast();
  const { isChatOpen, viewMode, graphData, isGraphLoading, sublemmas, problem } = useAppStore(s => ({
    isChatOpen: s.isChatOpen,
    viewMode: s.viewMode,
    graphData: s.graphData,
    isGraphLoading: s.isGraphLoading,
    sublemmas: s.sublemmas,
    problem: s.problem,
  }));
  const setIsChatOpen = useAppStore(s => s.setIsChatOpen);
  const setIsHistoryOpen = useAppStore(s => s.setIsHistoryOpen);
  const setViewMode = useAppStore(s => s.setViewMode);
  const setGraphData = useAppStore(s => s.setGraphData);
  const setIsGraphLoading = useAppStore(s => s.setIsGraphLoading);

  const onToggleHistory = () => {
    setIsHistoryOpen(prev => {
      const opening = !prev;
      if (opening) setIsChatOpen(false);
      return opening;
    });
  };

  const onToggleGraph = async () => {
    const newMode = viewMode === 'graph' ? 'steps' : 'graph';
    setViewMode(newMode);
    if (newMode === 'graph' && !graphData && !isGraphLoading) {
      setIsGraphLoading(true);
      try {
        const result = await generateProofGraphAction(sublemmas);
        if ('nodes' in result && 'edges' in result) {
          setGraphData({
            nodes: result.nodes.map(n => {
              const m = n.id.match(/step-(\d+)/);
              const idx = m ? parseInt(m[1], 10) - 1 : -1;
              const content = idx >= 0 && idx < sublemmas.length ? sublemmas[idx].content : '';
              return { ...n, content };
            }),
            edges: result.edges,
          });
        } else {
          setGraphData(null);
          toast({
            title: 'Graph Generation Failed',
            description: 'error' in result ? (result as any).error : 'Unknown error.',
            variant: 'destructive',
          });
        }
      } finally {
        setIsGraphLoading(false);
      }
    }
  };

  const onToggleChat = () => {
    setIsChatOpen(prev => {
      const opening = !prev;
      if (opening) setIsHistoryOpen(false);
      return opening;
    });
  };

  const onExportTex = () => {
    try {
      const prob = problem || '';
      exportProofTex(prob, sublemmas);
      toast({ title: 'Exported', description: 'LaTeX file downloaded as proof.tex' });
    } catch (e: any) {
      toast({ title: 'Export Failed', description: e?.message || 'Could not export LaTeX.', variant: 'destructive' });
    }
  };

  const exportDisabled = sublemmas.length === 0;

  return (
    <aside className="w-14 flex flex-col items-center py-4 border-r bg-card">
      <Link href="/" className="mb-6">
        <LogoSmall />
      </Link>
      <div className="flex flex-col items-center space-y-2">
        <Button
          variant="ghost"
          size="icon"
          title="History"
          onClick={onToggleHistory}
        >
          <History />
          <span className="sr-only">History</span>
        </Button>

        <Button
          variant="ghost"
          size="icon"
          title="Graph"
          onClick={onToggleGraph}
        >
          <GitMerge />
          <span className="sr-only">Graph</span>
        </Button>

        <Button
          variant="ghost"
          size="icon"
          title="Chat"
          onClick={onToggleChat}
        >
          {isChatOpen ? <PanelRightClose /> : <PanelRightOpen />}
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

  );
}
