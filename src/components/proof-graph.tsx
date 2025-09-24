
'use client';

import { Canvas, Edge, Node, NodeProps } from 'reaflow';
import { Card } from './ui/card';
import { memo } from 'react';

export type GraphData = {
  nodes: { id: string; label: string }[];
  edges: { id: string; source: string; target: string }[];
};

interface ProofGraphProps {
  graphData: GraphData;
}

const CustomNode = memo(({...props}: NodeProps) => (
  <Node {...props}>
    {(event) => (
      <foreignObject height={event.height} width={event.width} x={0} y={0}>
        <div className="bg-card border rounded-lg p-2 text-center shadow-sm text-sm flex items-center justify-center w-full h-full">
          {event.node.text}
        </div>
      </foreignObject>
    )}
  </Node>
));
CustomNode.displayName = 'CustomNode';


export function ProofGraph({ graphData }: ProofGraphProps) {
  if (!graphData || !graphData.nodes || !graphData.edges) {
    return <div className="text-center p-8">No graph data available.</div>;
  }

  const { nodes, edges } = graphData;

  return (
    <Card className="w-full h-[600px] p-4 overflow-hidden">
      <Canvas
        nodes={nodes.map((node) => ({ id: node.id, text: node.label }))}
        edges={edges}
        maxHeight={560}
        maxWidth={1000}
        fit
        node={<CustomNode />}
        edge={<Edge />}
        layoutOptions={{
          'elk.algorithm': 'layered',
          'elk.direction': 'DOWN',
          'elk.spacing.nodeNode': '60',
        }}
      />
    </Card>
  );
}
