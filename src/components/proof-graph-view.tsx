'use client';

import { Loader2 } from 'lucide-react';
import { useEffect, useTransition } from 'react';
import { useAppStore } from '@/state/app-store';
import { generateProofGraphAction } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import { ProofGraph } from './proof-graph';

/**
 * ProofGraphView
 * - Connects to global state for sublemmas, graph data, and loading flags.
 * - Generates the graph when the view is switched to `graph` and no data is available yet.
 * - Renders loading, graph, or fallback UI accordingly.
 */
export function ProofGraphView() {
  const { toast } = useToast();
  const proof = useAppStore((s) => s.proof());
  const viewMode = useAppStore((s) => s.viewMode);

  const updateCurrentProofVersion = useAppStore((s) => s.updateCurrentProofVersion);

  const [isGeneratingGraph, startGeneratingGraph] = useTransition();

  // Trigger graph generation when entering graph view and data is missing.
  useEffect(() => {
    if (viewMode !== 'graph') return;
    if (proof.graphData || isGeneratingGraph) return;
    if (!proof.sublemmas || proof.sublemmas.length === 0) return;

    startGeneratingGraph(async () => {
      const result = await generateProofGraphAction(proof.sublemmas);
      if ('nodes' in result && 'edges' in result) {
        updateCurrentProofVersion({
          graphData: {
            nodes: result.nodes.map((n) => {
              const m = n.id.match(/step-(\d+)/);
              const idx = m ? parseInt(m[1], 10) - 1 : -1;
              const content =
                idx >= 0 && idx < proof.sublemmas.length ? proof.sublemmas[idx].statement : '';
              return { ...n, content };
            }),
            edges: result.edges,
          },
        });
      } else {
        updateCurrentProofVersion({ graphData: undefined });
        toast({
          title: 'Graph Generation Failed',
          description: (result as any)?.error || 'Unknown error.',
          variant: 'destructive',
        });
      }
    });
  }, [viewMode, isGeneratingGraph, proof, updateCurrentProofVersion, toast]);

  if (isGeneratingGraph) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-4 text-muted-foreground">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-lg font-medium">Generating dependency graph...</p>
        </div>
      </div>
    );
  }

  if (proof.graphData) {
    return <ProofGraph graphData={proof.graphData} />;
  }

  return (
    <div className="text-center py-16 text-muted-foreground">
      <p>Could not generate graph.</p>
    </div>
  );
}
