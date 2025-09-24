'use client';

import { useEffect, useState, type ReactNode } from 'react';
import dagre from '@dagrejs/dagre';
import { useReactFlow, type Node, type Edge } from 'reactflow';

interface DagreLayoutProps {
  nodes: Node[];
  edges: Edge[];
  children: (nodes: Node[], edges: Edge[]) => ReactNode;
}

const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));

const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'TB') => {
  g.setGraph({ rankdir: direction });

  nodes.forEach((node) => {
    // Use the actual measured dimensions from React Flow if available
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

    // We are shifting the dagre node position (anchor=center) to the top left
    // so it matches the React Flow node anchor point (top left).
    node.position = {
      x: nodeWithPosition.x - nodeWidth / 2,
      y: nodeWithPosition.y - nodeHeight / 2,
    };
    return node;
  });

  return { layoutedNodes, layoutedEdges: edges };
};


export function DagreLayout({ nodes, edges, children }: DagreLayoutProps) {
  const { getNodes, setNodes, setEdges, fitView } = useReactFlow();
  const [layoutedElements, setLayoutedElements] = useState<{
    nodes: Node[];
    edges: Edge[];
  } | null>(null);

  useEffect(() => {
    const reactFlowNodes = getNodes();

    // The layout algorithm can only run once all nodes have been initialized with their dimensions
    if (!reactFlowNodes.length || reactFlowNodes.some(node => !node.width || !node.height)) {
      return;
    }

    const { layoutedNodes, layoutedEdges } = getLayoutedElements(
      [...nodes],
      [...edges]
    );

    // This is a bit of a hack to prevent a flash of unstyled content
    // We set the layouted elements, then wait for the next frame to fit the view
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
    setLayoutedElements({ nodes: layoutedNodes, edges: layoutedEdges });

    window.requestAnimationFrame(() => {
      fitView();
    });
  }, [nodes, edges, getNodes, setNodes, setEdges, fitView]);

  if (!layoutedElements) {
    // Render an empty fragment or a loader while waiting for layout
    return <></>;
  }

  return <>{children(layoutedElements.nodes, layoutedElements.edges)}</>;
}
