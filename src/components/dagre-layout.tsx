'use client';

import { useMemo, type ReactNode } from 'react';
import dagre from '@dagrejs/dagre';
import type { Node, Edge } from 'reactflow';

interface DagreLayoutProps {
  nodes: Node[];
  edges: Edge[];
  children: (nodes: Node[], edges: Edge[]) => ReactNode;
}

function layoutElements(nodes: Node[], edges: Edge[], direction: 'TB' | 'LR' = 'TB') {
  if (!nodes.length) return { nodes: [] as Node[], edges };

  const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction });

  nodes.forEach((n) => {
    const width = n.width ?? 172;
    const height = n.height ?? 36;
    g.setNode(n.id, { width, height });
  });

  edges.forEach((e) => g.setEdge(e.source, e.target));

  dagre.layout(g);

  const laidOutNodes = nodes.map((n) => {
    const { x, y } = g.node(n.id);
    const width = n.width ?? 172;
    const height = n.height ?? 36;
    return {
      ...n,
      position: { x: x - width / 2, y: y - height / 2 },
    };
  });

  return { nodes: laidOutNodes, edges };
}

export function DagreLayout({ nodes, edges, children }: DagreLayoutProps) {
  const { nodes: layoutedNodes, edges: layoutedEdges } = useMemo(
    () => layoutElements(nodes, edges, 'TB'),
    [nodes, edges],
  );

  return <>{children(layoutedNodes, layoutedEdges)}</>;
}
