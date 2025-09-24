
'use client';
import { useEffect } from 'react';
import { useReactFlow, useNodes, useEdges, useStore, Node } from 'reactflow';
import dagre from '@dagrejs/dagre';

const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));

const getLayoutedElements = (nodes: Node[], edges: any[], direction = 'TB') => {
  g.setGraph({ rankdir: direction });

  edges.forEach((edge) => g.setEdge(edge.source, edge.target));
  
  nodes.forEach((node) => {
    // Use the actual node dimensions for layout
    g.setNode(node.id, {
      ...node,
      width: node.width || 150,
      height: node.height || 40,
    });
  });

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
  const { setNodes, setEdges, fitView } = useReactFlow();
  const nodes = useNodes();
  const edges = useEdges();
  const nodeInternals = useStore((store) => store.nodeInternals);
  const nodesInitialized = useStore((store) => Array.from(store.nodeInternals.values()).every(internal => internal.width && internal.height));


  useEffect(() => {
    if (nodes.length > 0 && nodesInitialized) {
      const layoutNodes = nodes.map(node => {
        const internalNode = nodeInternals.get(node.id);
        return {
          ...node,
          width: internalNode?.width,
          height: internalNode?.height,
        };
      });

      const layouted = getLayoutedElements(layoutNodes, edges);
      setNodes(layouted.nodes);
      setEdges(layouted.edges);

      window.requestAnimationFrame(() => {
        fitView();
      });
    }
  }, [nodes.length, edges.length, nodesInitialized, setNodes, setEdges, fitView, nodeInternals]);

  return null;
}
