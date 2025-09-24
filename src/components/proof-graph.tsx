
'use client';

import { useMemo } from 'react';
import { Canvas, ElkRoot } from 'reaflow';
import { Card } from './ui/card';

export type GraphData = {
  nodes: { id: string; label: string }[];
  edges: { id: string; source: string; target: string }[];
};

interface ProofGraphProps {
  graphData: GraphData;
}

export function ProofGraph({ graphData }: ProofGraphProps) {
  if (!graphData || !graphData.nodes || !graphData.edges) {
    return <div className="text-center p-8">No graph data available.</div>;
  }

  const { nodes, edges } = useMemo(() => {
    const nodes = graphData.nodes.map((node) => ({
      id: node.id,
      text: node.label,
      height: 50,
      width: 175,
    }));

    const edges = graphData.edges.map((edge) => ({
      id: edge.id,
      from: edge.source,
      to: edge.target,
    }));

    return { nodes, edges };
  }, [graphData]);

  return (
    <Card className="w-full h-[600px] p-4 overflow-hidden">
        <Canvas
            nodes={nodes.map((node) => ({ id: node.id, text: node.text }))}
            edges={edges}
            maxHeight={560}
            maxWidth={1200}
            layout={<ElkRoot />}
            fit
        />
    </Card>
  );
}
