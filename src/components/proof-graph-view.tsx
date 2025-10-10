"use client";

import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { useAppStore } from "@/state/app-store";
import { generateProofGraphAction } from "@/app/actions";
import { useToast } from "@/hooks/use-toast";
import { ProofGraph } from "./proof-graph";

/**
 * ProofGraphView
 * - Connects to global state for sublemmas, graph data, and loading flags.
 * - Generates the graph when the view is switched to `graph` and no data is available yet.
 * - Renders loading, graph, or fallback UI accordingly.
 */
export function ProofGraphView() {
  const { toast } = useToast();
  const { viewMode, sublemmas, graphData, isGraphLoading } = useAppStore((s) => ({
    viewMode: s.viewMode,
    sublemmas: s.sublemmas,
    graphData: s.graphData,
    isGraphLoading: s.isGraphLoading,
  }));
  const setGraphData = useAppStore((s) => s.setGraphData);
  const setIsGraphLoading = useAppStore((s) => s.setIsGraphLoading);

  // Trigger graph generation when entering graph view and data is missing.
  useEffect(() => {
    let cancelled = false;
    const maybeGenerate = async () => {
      if (viewMode !== "graph") return;
      if (graphData || isGraphLoading) return;
      if (!sublemmas || sublemmas.length === 0) return;

      setIsGraphLoading(true);
      try {
        const result = await generateProofGraphAction(sublemmas);
        if (cancelled) return;
        if ("nodes" in result && "edges" in result) {
          setGraphData({
            nodes: result.nodes.map((n) => {
              const m = n.id.match(/step-(\d+)/);
              const idx = m ? parseInt(m[1], 10) - 1 : -1;
              const content = idx >= 0 && idx < sublemmas.length ? sublemmas[idx].content : "";
              return { ...n, content };
            }),
            edges: result.edges,
          });
        } else {
          setGraphData(null);
          toast({
            title: "Graph Generation Failed",
            description: (result as any)?.error || "Unknown error.",
            variant: "destructive",
          });
        }
      } finally {
        if (!cancelled) setIsGraphLoading(false);
      }
    };

    maybeGenerate();
    return () => {
      cancelled = true;
    };
  }, [viewMode, sublemmas, graphData, isGraphLoading, setGraphData, setIsGraphLoading, toast]);

  if (isGraphLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-4 text-muted-foreground">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-lg font-medium">Generating dependency graph...</p>
        </div>
      </div>
    );
  }

  if (graphData) {
    return <ProofGraph graphData={graphData} />;
  }

  return (
    <div className="text-center py-16 text-muted-foreground">
      <p>Could not generate graph.</p>
    </div>
  );
}
