'use client';

import { Loader2 } from 'lucide-react';
import { useEffect, useMemo, useTransition } from 'react';
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
  const activeVersionIdx = useAppStore((s) => s.activeVersionIdx);
  const viewMode = useAppStore((s) => s.viewMode);
  const goBack = useAppStore((s) => s.goBack);

  const proofHistory = useAppStore((s) => s.proofHistory);
  const rawProof = useAppStore((s) => s.rawProof);
  const decomposedRaw = useAppStore((s) => s.decomposedRaw);
  const isDecomposing = useAppStore((s) => s.isDecomposing);
  const runDecomposition = useAppStore((s) => s.runDecomposition);
  const setActiveVersionIndex = useAppStore((s) => s.setActiveVersionIndex);
  const getCurrentRawBaseMajor = useAppStore((s) => s.getCurrentRawBaseMajor);

  const updateCurrentProofVersion = useAppStore((s) => s.updateCurrentProofVersion);

  const [isGeneratingGraph, startGeneratingGraph] = useTransition();

  const hasStructuredForCurrentRaw = useMemo(() => {
    const a = (rawProof || '').trim();
    const b = (decomposedRaw || '').trim();
    return a.length > 0 && b.length > 0 && a === b;
  }, [rawProof, decomposedRaw]);

  // Latest structured version index for the current raw draft's baseMajor.
  // IMPORTANT: use the same baseMajor resolution logic as the store's runDecomposition.
  const latestStructuredIdxForCurrentRaw = useMemo(() => {
    const baseMajor = getCurrentRawBaseMajor();
    if (!baseMajor) return null;

    for (let i = proofHistory.length - 1; i >= 0; i--) {
      const v = proofHistory[i];
      if (v.type === 'structured' && v.baseMajor === baseMajor) return i;
    }

    return null;
  }, [proofHistory, getCurrentRawBaseMajor]);

  // Graph view should always operate on the *structured* version corresponding to the current raw.
  // If the structured proof isn't ready yet, trigger decomposition and wait.
  useEffect(() => {
    if (viewMode !== 'graph') return;

    // If steps aren't ready for current raw, ensure decomposition is running.
    if (!hasStructuredForCurrentRaw) {
      if (!isDecomposing) {
        void runDecomposition();
      }
      return;
    }

    // Ensure we are on the latest structured version for this raw before generating graph.
    if (latestStructuredIdxForCurrentRaw != null && proofHistory[latestStructuredIdxForCurrentRaw]) {
      const target = proofHistory[latestStructuredIdxForCurrentRaw];
      if (target.type === 'structured' && latestStructuredIdxForCurrentRaw !== activeVersionIdx) {
        // NOTE: setActiveVersionIndex preserves viewMode==='graph' (store-level behavior).
        setActiveVersionIndex(latestStructuredIdxForCurrentRaw);
      }
    }
  }, [
    viewMode,
    hasStructuredForCurrentRaw,
    isDecomposing,
    runDecomposition,
    latestStructuredIdxForCurrentRaw,
    setActiveVersionIndex,
    proofHistory,
    activeVersionIdx,
  ]);

  // Trigger graph generation when entering graph view and data is missing.
  useEffect(() => {
    console.debug('[UI][Graph] effect fired', {
      viewMode,
      hasGraph: !!proof.graphData,
      isGeneratingGraph,
      steps: proof.sublemmas?.length ?? 0,
      proofType: (proof as any)?.type,
    });
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
              const content = idx >= 0 && idx < proof.sublemmas.length ? proof.sublemmas[idx].statement : '';
              return { ...n, content };
            }),
            edges,
          },
        });
      } else {
        updateCurrentProofVersion({ graphData: undefined });
        console.debug('[UI][Graph] graph call failed error=', (result as any)?.error);
        const fallback = 'Adjoint’s connection to the model was interrupted, please go back and retry.';
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

  if (viewMode === 'graph' && (isDecomposing || !hasStructuredForCurrentRaw || !proof.sublemmas || proof.sublemmas.length === 0)) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-4 text-muted-foreground">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-lg font-medium">Preparing structured proof…</p>
        </div>
      </div>
    );
  }

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
