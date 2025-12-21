'use client';

import { Loader2 } from 'lucide-react';
import { useEffect, useTransition } from 'react';
import { useAppStore } from '@/state/app-store';
import { generateProofGraphAction } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import { showModelError } from '@/lib/model-errors';
import { ProofGraph } from './proof-graph';
import type { GenerateProofGraphOutput } from '@/ai/flows/generate-proof-graph';

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
  const goBack = useAppStore((s) => s.goBack);

  const updateCurrentProofVersion = useAppStore((s) => s.updateCurrentProofVersion);

  const [isGeneratingGraph, startGeneratingGraph] = useTransition();

  // Trigger graph generation when entering graph view and data is missing.
  useEffect(() => {
    console.debug('[UI][Graph] effect fired', { viewMode, hasGraph: !!proof.graphData, isGeneratingGraph, steps: proof.sublemmas?.length ?? 0 });
    if (viewMode !== 'graph') return;
    if (proof.graphData || isGeneratingGraph) return;
    if (!proof.sublemmas || proof.sublemmas.length === 0) return;

    startGeneratingGraph(async () => {
      const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      console.debug('[UI][Graph] calling generateProofGraphAction steps=', proof.sublemmas.length);
      const result = await generateProofGraphAction(proof.sublemmas);
      const t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      console.debug('[UI][Graph] graph call done ms=', t1 - t0, 'ok=', (result as any)?.success === true);
      if ((result as any)?.success === true) {
        const { nodes, edges } = result as { success: true } & GenerateProofGraphOutput;
        updateCurrentProofVersion({
          graphData: {
            nodes: nodes.map((n: GenerateProofGraphOutput['nodes'][number]) => {
              const m = n.id.match(/step-(\d+)/);
              const idx = m ? parseInt(m[1], 10) - 1 : -1;
              const content =
                idx >= 0 && idx < proof.sublemmas.length ? proof.sublemmas[idx].statement : '';
              return { ...n, content };
            }),
            edges,
          },
        });
      } else {
        updateCurrentProofVersion({ graphData: undefined });
        console.debug('[UI][Graph] graph call failed error=', (result as any)?.error);
        const fallback =
          'Adjoint’s connection to the model was interrupted, please go back and retry.';
        const code = showModelError(toast, (result as any)?.error, goBack, 'Graph error');
        if (!code) {
          toast({
            title: 'Graph error',
            description: fallback,
            variant: 'destructive',
          });
        }
      }
    });
  }, [viewMode, isGeneratingGraph, proof, updateCurrentProofVersion, toast, goBack]);

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
