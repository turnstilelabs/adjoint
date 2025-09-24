
'use client';
import { useEffect } from 'react';
import { useReactFlow, useNodes, useEdges, useStore } from 'reactflow';
import dagre from '@dagrejs/dagre';

const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
const nodeWidth = 172;
const nodeHeight = 36;

const getLayoutedElements = (nodes: any[], edges: any[], direction = 'TB') => {
  g.setGraph({ rankdir: direction });

  edges.forEach((edge) => g.setEdge(edge.source, edge.target));
  nodes.forEach((node) => g.setNode(node.id, { ...node, width: nodeWidth, height: nodeHeight }));

  dagre.layout(g);

  return {
    nodes: nodes.map((node) => {
      const { x, y } = g.node(node.id);
      return { ...node, position: { x, y } };
    }),
    edges,
  };
};

export function DagreLayout() {
  const { setNodes, setEdges } = useReactFlow();
  const nodes = useNodes();
  const edges = useEdges();
  const nodesInitialized = useStore((store) => Array.from(store.nodeInternals.values()).every(internal => internal.width && internal.height));


  useEffect(() => {
    if (nodes.length && nodesInitialized) {
      const layouted = getLayoutedElements(nodes, edges);
      setNodes(layouted.nodes);
      setEdges(layouted.edges);

      window.requestAnimationFrame(() => {
        // fitView(); // This might be useful to zoom/pan to the new layout
      });
    }
  }, [nodes.length, nodesInitialized]);

  return null;
}
