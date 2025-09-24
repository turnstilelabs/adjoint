
'use client';

import { useMemo } from 'react';
import ReactFlow, {
  Controls,
  Background,
  Panel,
  useNodesState,
  useEdgesState,
  MarkerType,
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

const nodeStyle = {
  border: '1px solid #B1B1B7',
  borderRadius: '0.5rem',
  padding: '0.5rem 1rem',
  backgroundColor: 'white',
  textAlign: 'center' as const,
};

export function ProofGraph({ graphData }: ProofGraphProps) {
  if (!graphData || !graphData.nodes || !graphData.edges) {
    return <div className="text-center p-8">No graph data available.</div>;
  }

  const { initialNodes, initialEdges } = useMemo(() => {
    const nodes = graphData.nodes.map((node) => ({
      id: node.id,
      position: { x: 0, y: 0 }, // Position will be set by layout
      data: { label: node.label },
      style: nodeStyle,
    }));

    const edges = graphData.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      markerEnd: {
        type: MarkerType.ArrowClosed,
      },
    }));

    return { initialNodes: nodes, initialEdges: edges };
  }, [graphData]);

  return (
    <Card className="w-full h-[600px] p-0 overflow-hidden">
      <ReactFlow
        nodes={initialNodes}
        edges={initialEdges}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Controls />
        <Background />
        <DagreLayout />
      </ReactFlow>
    </Card>
  );
}
