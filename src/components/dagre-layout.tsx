'use client';

import { useEffect, useLayoutEffect, type ReactNode } from 'react';
import dagre from '@dagrejs/dagre';
import { useReactFlow, type Node, type Edge } from 'reactflow';

interface DagreLayoutProps {
  nodes: Node[];
  edges: Edge[];
  children: (nodes: Node[], edges: Edge[]) => ReactNode;
}

const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));

const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'TB') => {
  if (nodes.length === 0) {
    return { layoutedNodes: [], layoutedEdges: [] };
  }

  g.setGraph({ rankdir: direction });

  nodes.forEach((node) => {
    const nodeWidth = node.width || 172;
    const nodeHeight = node.height || 36;
    g.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => g.setEdge(edge.source, edge.target));

  dagre.layout(g);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = g.node(node.id);
    const nodeWidth = node.width || 172;
    const nodeHeight = node.height || 36;
    
    node.position = {
      x: nodeWithPosition.x - nodeWidth / 2,
      y: nodeWithPosition.y - nodeHeight / 2,
    };
    return node;
  });

  return { layoutedNodes, layoutedEdges: edges };
};

export function DagreLayout({ nodes, edges, children }: DagreLayoutProps) {
  const { setNodes, setEdges, fitView } = useReactFlow();

  useLayoutEffect(() => {
    const { layoutedNodes, layoutedEdges } = getLayoutedElements(nodes, edges);
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
    
    window.requestAnimationFrame(() => {
        fitView();
    });

  }, [nodes, edges, setNodes, setEdges, fitView]);


  return <>{children(nodes, edges)}</>;
}
