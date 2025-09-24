'use client';
import { useMemo } from 'react';
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  type Node,
  type Edge,
  ReactFlowProvider,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Card } from './ui/card';
import { DagreLayout } from './dagre-layout';

export type GraphData = {
  nodes: { id: string; label: string }[];
  edges: { id: string; source: string; target: string }[];
};

interface ProofGraphProps {
  graphData: GraphData;
}

const nodeDefaults = {
  sourcePosition: 'bottom',
  targetPosition: 'top',
  style: {
    borderRadius: '0.5rem',
    border: '1px solid hsl(var(--border))',
    background: 'hsl(var(--card))',
    color: 'hsl(var(--card-foreground))',
    boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
  },
};

export function ProofGraph({ graphData }: ProofGraphProps) {
  if (!graphData || !graphData.nodes || !graphData.edges) {
    return <div className="text-center p-8">No graph data available.</div>;
  }

  const { nodes, edges } = useMemo(() => {
    const mappedNodes: Node[] = graphData.nodes.map((node) => ({
      id: node.id,
      data: { label: node.label },
      position: { x: 0, y: 0 },
      ...nodeDefaults,
    }));

    const mappedEdges: Edge[] = graphData.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      animated: true,
    }));

    return { nodes: mappedNodes, edges: mappedEdges };
  }, [graphData]);

  return (
    <Card className="w-full h-[600px] p-0 overflow-hidden relative">
      <ReactFlowProvider>
        <DagreLayout nodes={nodes} edges={edges}>
          {(layoutedNodes, layoutedEdges) => (
            <ReactFlow
              nodes={layoutedNodes}
              edges={layoutedEdges}
              fitView
              className="bg-background"
              proOptions={{ hideAttribution: true }}
            >
              <Controls />
              <MiniMap />
              <Background gap={12} size={1} />
            </ReactFlow>
          )}
        </DagreLayout>
      </ReactFlowProvider>
    </Card>
  );
}
