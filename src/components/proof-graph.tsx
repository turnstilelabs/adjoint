'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { ZoomIn, ZoomOut, RefreshCw } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { KatexRenderer } from './katex-renderer';

export type GraphData = {
  nodes: { id: string; label: string; content?: string }[];
  edges: { id: string; source: string; target: string }[];
};

interface ProofGraphProps {
  graphData: GraphData;
}

type PositionedNode = {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  lines: string[];
  content?: string;
};

type DrawEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  source: { x: number; y: number };
  target: { x: number; y: number };
};

type DraggingState = {
  nodeId: string;
  offsetX: number;
  offsetY: number;
  startX: number;
  startY: number;
};

const SVG_WIDTH = 800;
const SVG_HEIGHT = 600;
const NODE_DIM = { width: 260, height: 96, rx: 10 };
const HEADER_H = 24;

const ARROW_OFFSET = 8; // push arrowhead slightly outside target rect

function borderPointRect(
  cx: number,
  cy: number,
  towardX: number,
  towardY: number,
  halfW: number,
  halfH: number,
) {
  const dx = towardX - cx;
  const dy = towardY - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  const scale = Math.min(halfW / (absDx || 1e-6), halfH / (absDy || 1e-6));
  return { x: cx + dx * scale, y: cy + dy * scale };
}

function offsetPoint(x: number, y: number, fromX: number, fromY: number, distance: number) {
  const vx = x - fromX;
  const vy = y - fromY;
  const len = Math.hypot(vx, vy) || 1;
  return { x: x + (vx / len) * distance, y: y + (vy / len) * distance };
}

function computeEdgeEndpoints(
  sx: number,
  sy: number,
  sHalfW: number,
  sHalfH: number,
  tx: number,
  ty: number,
  tHalfW: number,
  tHalfH: number,
) {
  const sourceBorder = borderPointRect(sx, sy, tx, ty, sHalfW, sHalfH);
  const targetBorder = borderPointRect(tx, ty, sx, sy, tHalfW, tHalfH);
  // move a bit outside nodes to ensure visibility above node rect
  const sourceOutside = offsetPoint(sourceBorder.x, sourceBorder.y, sx, sy, 2);
  const targetOutside = offsetPoint(targetBorder.x, targetBorder.y, sx, sy, ARROW_OFFSET);
  return {
    source: { x: sourceOutside.x, y: sourceOutside.y },
    target: { x: targetOutside.x, y: targetOutside.y },
  };
}

// Deterministic initial positions (circular layout) to avoid jumping on re-render
function initialPosition(index: number, total: number) {
  const cx = SVG_WIDTH / 2;
  const cy = SVG_HEIGHT / 2;
  const radius = Math.min(SVG_WIDTH, SVG_HEIGHT) * 0.32;
  const angle = (2 * Math.PI * index) / Math.max(1, total);
  const x = cx + radius * Math.cos(angle);
  const y = cy + radius * Math.sin(angle);
  return { x, y };
}

/** Text measurement helpers to adapt node size to title */
const TITLE_MIN_WIDTH = 160;
const TITLE_MAX_WIDTH = 360;
const TITLE_PADDING_X = 16;
const TITLE_PADDING_Y = 10;
const TITLE_FONT = '600 14px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto';
const TITLE_LINE_HEIGHT = 18;

let _measureCtx: CanvasRenderingContext2D | null = null;
function getMeasureCtx() {
  if (_measureCtx) return _measureCtx;
  const canvas = document.createElement('canvas');
  _measureCtx = canvas.getContext('2d');
  if (_measureCtx) _measureCtx.font = TITLE_FONT;
  return _measureCtx;
}

function measureTitle(label: string) {
  const ctx = getMeasureCtx();
  if (!ctx) {
    const fallbackW = Math.min(
      TITLE_MAX_WIDTH,
      Math.max(TITLE_MIN_WIDTH, label.length * 7 + TITLE_PADDING_X * 2),
    );
    const lineCount = Math.ceil(fallbackW / (TITLE_MAX_WIDTH - TITLE_PADDING_X * 2));
    const h = HEADER_H + TITLE_PADDING_Y * 2 + Math.max(1, lineCount) * TITLE_LINE_HEIGHT;
    return { width: fallbackW, height: h, lines: [label] };
  }
  ctx.font = TITLE_FONT;
  const words = label.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  const maxTextWidth = TITLE_MAX_WIDTH - TITLE_PADDING_X * 2;

  for (const w of words) {
    const test = current ? current + ' ' + w : w;
    const testWidth = ctx.measureText(test).width;
    if (testWidth <= maxTextWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);

  const textWidth = Math.min(
    TITLE_MAX_WIDTH,
    Math.max(
      TITLE_MIN_WIDTH,
      Math.max(...lines.map((line) => ctx.measureText(line).width), 0) + TITLE_PADDING_X * 2,
    ),
  );
  const height = HEADER_H + TITLE_PADDING_Y * 2 + Math.max(1, lines.length) * TITLE_LINE_HEIGHT;
  return { width: textWidth, height, lines };
}

export function ProofGraph({ graphData }: ProofGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  const [nodes, setNodes] = useState<PositionedNode[]>([]);
  const [edges, setEdges] = useState<DrawEdge[]>([]);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [dragging, setDragging] = useState<DraggingState | null>(null);
  const movedRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [selectedNode, setSelectedNode] = useState<PositionedNode | null>(null);

  // pan & zoom state
  const [scale, setScale] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const panRef = useRef(pan);
  const scaleRef = useRef(scale);
  // panning state when dragging the canvas background
  const [panning, setPanning] = useState<{
    startX: number;
    startY: number;
    startPan: { x: number; y: number };
  } | null>(null);

  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  // Reconcile nodes when graphData changes:
  // - keep positions for existing nodes
  // - add positions for new nodes deterministically
  // - update labels when they change
  useEffect(() => {
    if (!graphData?.nodes) {
      setNodes([]);
      return;
    }

    // Use functional update to avoid depending on `nodes`.
    // This keeps React Hook deps small and prevents stale-position bugs.
    setNodes((prevNodes) => {
      const prevById = new Map(prevNodes.map((n) => [n.id, n]));
      return graphData.nodes.map((n, idx) => {
        const dims = measureTitle(n.label);
        const prev = prevById.get(n.id);
        if (prev) {
          // update label/content and recalc size, keep position
          return {
            ...prev,
            label: n.label,
            content: (n as any).content ?? prev.content,
            width: dims.width,
            height: dims.height,
            lines: dims.lines,
          };
        }
        // new node: place deterministically with measured size
        const pos = initialPosition(idx, graphData.nodes.length);
        return {
          id: n.id,
          label: n.label,
          x: pos.x,
          y: pos.y,
          width: dims.width,
          height: dims.height,
          lines: dims.lines,
          content: (n as any).content,
        };
      });
    });
  }, [graphData?.nodes]);

  // Recompute edges when nodes or graphData.edges change
  useEffect(() => {
    if (!graphData?.edges || nodes.length === 0) {
      setEdges([]);
      return;
    }
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const nextEdges: DrawEdge[] = graphData.edges
      .map((e) => {
        const s = byId.get(e.source);
        const t = byId.get(e.target);
        if (!s || !t) return null;
        const { source, target } = computeEdgeEndpoints(
          s.x,
          s.y,
          s.width / 2,
          s.height / 2,
          t.x,
          t.y,
          t.width / 2,
          t.height / 2,
        );
        return {
          id: e.id,
          sourceId: e.source,
          targetId: e.target,
          source,
          target,
        } as DrawEdge;
      })
      .filter((e): e is DrawEdge => !!e);
    setEdges(nextEdges);
  }, [graphData?.edges, nodes]);

  const getPoint = useCallback(
    (e: React.MouseEvent | MouseEvent | React.WheelEvent<SVGSVGElement>) => {
      // Map client coordinates -> SVG user coordinates, then account for pan/scale
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0 };
      const clientX = 'clientX' in e ? e.clientX : 0;
      const clientY = 'clientY' in e ? e.clientY : 0;
      const pt = svg.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      const svgP = pt.matrixTransform(svg.getScreenCTM()?.inverse());

      // Use refs (kept up to date by effects) so this callback stays stable.
      const currentScale = scaleRef.current ?? 1;
      const currentPan = panRef.current ?? { x: 0, y: 0 };

      return {
        x: (svgP.x - currentPan.x) / currentScale,
        y: (svgP.y - currentPan.y) / currentScale,
      };
    },
    [],
  );

  const handleMouseDown = (e: React.MouseEvent, nodeId: string) => {
    e.preventDefault();
    movedRef.current = false;
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const pt = getPoint(e);
    setDragging({
      nodeId,
      offsetX: pt.x - node.x,
      offsetY: pt.y - node.y,
      startX: node.x,
      startY: node.y,
    });
  };

  // Drag interactions on the SVG (for performance we also attach to window)
  const handleSvgMouseMove = (e: React.MouseEvent) => {
    // If user is panning the canvas (started by mousedown on background), update pan
    if (panning) {
      const pt = getPoint(e);
      const dx = pt.x - panning.startX;
      const dy = pt.y - panning.startY;
      setPan({ x: panning.startPan.x + dx, y: panning.startPan.y + dy });
      return;
    }

    if (!dragging) return;
    e.preventDefault();
    const pt = getPoint(e);
    const newX = pt.x - dragging.offsetX;
    const newY = pt.y - dragging.offsetY;
    const dist = Math.hypot(newX - dragging.startX, newY - dragging.startY);
    movedRef.current = dist > 3;

    setNodes((prev) =>
      prev.map((n) => (n.id === dragging.nodeId ? { ...n, x: newX, y: newY } : n)),
    );
    setEdges((prev) =>
      prev.map((edge) => {
        if (edge.sourceId === dragging.nodeId) {
          const targetNode = nodes.find((n) => n.id === edge.targetId);
          if (!targetNode) return edge;
          const { source, target } = computeEdgeEndpoints(
            newX,
            newY,
            (nodes.find((n) => n.id === dragging.nodeId)?.width || NODE_DIM.width) / 2,
            (nodes.find((n) => n.id === dragging.nodeId)?.height || NODE_DIM.height) / 2,
            targetNode.x,
            targetNode.y,
            targetNode.width / 2,
            targetNode.height / 2,
          );
          return { ...edge, source, target };
        }
        if (edge.targetId === dragging.nodeId) {
          const sourceNode = nodes.find((n) => n.id === edge.sourceId);
          if (!sourceNode) return edge;
          const { source, target } = computeEdgeEndpoints(
            sourceNode.x,
            sourceNode.y,
            sourceNode.width / 2,
            sourceNode.height / 2,
            newX,
            newY,
            (nodes.find((n) => n.id === dragging.nodeId)?.width || NODE_DIM.width) / 2,
            (nodes.find((n) => n.id === dragging.nodeId)?.height || NODE_DIM.height) / 2,
          );
          return { ...edge, source, target };
        }
        return edge;
      }),
    );
  };

  const handleSvgMouseUp = (e: React.MouseEvent) => {
    if (dragging) e.preventDefault();
    setDragging(null);
    if (panning) {
      setPanning(null);
    }
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging) return;
      const pt = getPoint(e);
      const newX = pt.x - dragging.offsetX;
      const newY = pt.y - dragging.offsetY;
      const dist = Math.hypot(newX - dragging.startX, newY - dragging.startY);
      movedRef.current = dist > 3;

      setNodes((prev) => prev.map((n) => (n.id === dragging.nodeId ? { ...n, x: newX, y: newY } : n)));

      // Recompute only edges connected to the moved node.
      setEdges((prev) => {
        const draggedNode = nodes.find((n) => n.id === dragging.nodeId);
        const draggedHalfW = (draggedNode?.width || NODE_DIM.width) / 2;
        const draggedHalfH = (draggedNode?.height || NODE_DIM.height) / 2;

        return prev.map((edge) => {
          if (edge.sourceId === dragging.nodeId) {
            const targetNode = nodes.find((n) => n.id === edge.targetId);
            if (!targetNode) return edge;
            const { source, target } = computeEdgeEndpoints(
              newX,
              newY,
              draggedHalfW,
              draggedHalfH,
              targetNode.x,
              targetNode.y,
              targetNode.width / 2,
              targetNode.height / 2,
            );
            return { ...edge, source, target };
          }
          if (edge.targetId === dragging.nodeId) {
            const sourceNode = nodes.find((n) => n.id === edge.sourceId);
            if (!sourceNode) return edge;
            const { source, target } = computeEdgeEndpoints(
              sourceNode.x,
              sourceNode.y,
              sourceNode.width / 2,
              sourceNode.height / 2,
              newX,
              newY,
              draggedHalfW,
              draggedHalfH,
            );
            return { ...edge, source, target };
          }
          return edge;
        });
      });
    };

    const onUp = () => setDragging(null);

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging, getPoint, nodes]);

  const headerColor = useMemo(() => 'hsl(var(--primary))', []);
  const mutedStroke = useMemo(() => 'hsl(var(--muted-foreground))', []);
  const activeStroke = useMemo(() => 'hsl(var(--primary))', []);

  const isNodeActive = (id: string) => hoveredNode === id;

  if (!graphData || !graphData.nodes || graphData.nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-[600px] text-muted-foreground">
        <p>No graph data available.</p>
      </div>
    );
  }

  return (
    <Card className="w-full h-[600px] p-0 overflow-hidden relative">
      <div className="absolute bottom-4 right-4 z-20 flex flex-col gap-2 bg-transparent">
        <Button
          size="sm"
          variant="ghost"
          aria-label="Zoom in"
          onClick={() => {
            setScale((s) => Math.min(3, +(s * 1.25).toFixed(2)));
          }}
        >
          <ZoomIn size={16} />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          aria-label="Zoom out"
          onClick={() => {
            setScale((s) => Math.max(0.5, +(s / 1.25).toFixed(2)));
          }}
        >
          <ZoomOut size={16} />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          aria-label="Reset view"
          onClick={() => {
            setScale(1);
            setPan({ x: 0, y: 0 });
          }}
        >
          <RefreshCw size={16} />
        </Button>
      </div>
      <TooltipProvider>
        <svg
          ref={svgRef}
          width="100%"
          height={SVG_HEIGHT}
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
          className="rounded-lg border bg-muted/10"
          style={{ cursor: dragging ? ('grabbing' as const) : 'default' }}
          onMouseDown={(e) => {
            // If a node already handled the event (node calls preventDefault), don't start panning.
            if ((e as any).defaultPrevented) return;
            const pt = getPoint(e);
            setPanning({
              startX: pt.x,
              startY: pt.y,
              startPan: { x: pan.x, y: pan.y },
            });
          }}
          onWheel={(e) => {
            e.preventDefault();
            const delta = 'deltaY' in e ? (e as any).deltaY : 0;
            // smooth exponential zooming
            const zoomFactor = Math.exp(-delta * 0.0015);
            const svgP = getPoint(e);
            const currentScale = scaleRef.current ?? scale;
            const newScale = Math.min(3, Math.max(0.5, currentScale * zoomFactor));
            // keep the point under cursor stable
            const localX = (svgP.x - pan.x) / currentScale;
            const localY = (svgP.y - pan.y) / currentScale;
            const newPanX = svgP.x - localX * newScale;
            const newPanY = svgP.y - localY * newScale;
            setScale(newScale);
            setPan({ x: newPanX, y: newPanY });
          }}
          onDoubleClick={() => {
            setScale(1);
            setPan({ x: 0, y: 0 });
          }}
          onMouseMove={handleSvgMouseMove}
          onMouseUp={handleSvgMouseUp}
        >
          <defs>
            <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow
                dx="2"
                dy="2"
                stdDeviation="3"
                floodColor="hsl(var(--foreground))"
                floodOpacity="0.08"
              />
            </filter>
            <marker
              id="arrowhead"
              viewBox="0 0 10 10"
              refX="10"
              refY="5"
              markerUnits="userSpaceOnUse"
              markerWidth="12"
              markerHeight="12"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill={mutedStroke} opacity="0.8" />
            </marker>
            <marker
              id="arrowhead-active"
              viewBox="0 0 10 10"
              refX="10"
              refY="5"
              markerUnits="userSpaceOnUse"
              markerWidth="12"
              markerHeight="12"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill={activeStroke} />
            </marker>

            {/* subtle dotted grid pattern for background */}
            <pattern id="dotPattern" width="20" height="20" patternUnits="userSpaceOnUse">
              {/* background tile (very low contrast, adapts to theme via CSS vars) */}
              <rect width="20" height="20" fill="hsl(var(--muted) / 0.06)" />
              {/* small dot in the center (soft) */}
              <circle cx="10" cy="10" r="0.6" fill="hsl(var(--muted-foreground) / 0.12)" />
            </pattern>
          </defs>

          {/* Edges */}
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${scale})`}>
            {/* background tiled dots that pan/zoom with the graph */}
            <rect x={-2000} y={-2000} width={4000} height={4000} fill="url(#dotPattern)" />
            {edges.map((edge) => {
              const isActive = hoveredNode === edge.sourceId || hoveredNode === edge.targetId;
              return (
                <line
                  key={edge.id}
                  x1={edge.source.x}
                  y1={edge.source.y}
                  x2={edge.target.x}
                  y2={edge.target.y}
                  stroke={isActive ? activeStroke : mutedStroke}
                  strokeWidth={isActive ? 2 : 1.5}
                  strokeOpacity={isActive ? 1 : 0.6}
                  markerEnd={isActive ? 'url(#arrowhead-active)' : 'url(#arrowhead)'}
                  className="transition-[stroke,stroke-width,stroke-opacity] duration-200"
                />
              );
            })}
          </g>

          {/* Nodes */}
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${scale})`}>
            {nodes.map((node, idx) => {
              const isHovered = isNodeActive(node.id);
              const isDragging = dragging?.nodeId === node.id;
              const translateX = node.x - node.width / 2;
              const translateY = node.y - node.height / 2;
              const stepNumber = (() => {
                const m = node.id.match(/\d+/);
                return m ? parseInt(m[0], 10) : idx + 1;
              })();

              return (
                <Tooltip key={node.id} delayDuration={100}>
                  <TooltipTrigger asChild>
                    <g
                      transform={`translate(${translateX}, ${translateY})`}
                      onMouseEnter={() => setHoveredNode(node.id)}
                      onMouseLeave={() => setHoveredNode(null)}
                      onMouseDown={(e) => handleMouseDown(e, node.id)}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!movedRef.current) {
                          setSelectedNode(node);
                          setOpen(true);
                        }
                      }}
                      style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
                    >
                      <g
                        style={{
                          transform: isHovered || isDragging ? 'scale(1.05)' : 'scale(1)',
                          transition: 'transform 0.15s ease-out',
                          transformOrigin: 'center center',
                        }}
                        filter="url(#shadow)"
                      >
                        <rect
                          width={node.width}
                          height={node.height}
                          rx={NODE_DIM.rx}
                          fill="hsl(var(--card))"
                          stroke={isHovered || isDragging ? activeStroke : 'hsl(var(--border))'}
                          strokeWidth={isHovered || isDragging ? 2 : 1}
                        />
                        <rect
                          width={node.width}
                          height={HEADER_H}
                          fill={headerColor}
                          opacity="0.15"
                          style={{
                            borderTopLeftRadius: NODE_DIM.rx,
                            borderTopRightRadius: NODE_DIM.rx,
                          }}
                        />
                        <line
                          x1="0"
                          y1={HEADER_H}
                          x2={node.width}
                          y2={HEADER_H}
                          stroke={headerColor}
                          strokeOpacity="0.35"
                        />

                        {/* Header text (small) */}
                        <text
                          x={12}
                          y={HEADER_H - 8}
                          fill={headerColor}
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            letterSpacing: '0.08em',
                          }}
                        >
                          {`Step ${stepNumber}`}
                        </text>

                        {/* Label (wrapped to lines) */}
                        <text
                          x={12}
                          y={HEADER_H + TITLE_PADDING_Y + 4}
                          fill="hsl(var(--foreground))"
                          style={{
                            fontSize: 14,
                            fontWeight: 600,
                            fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto',
                          }}
                        >
                          {node.lines.map((ln, i) => (
                            <tspan key={i} x={12} dy={i === 0 ? 0 : TITLE_LINE_HEIGHT}>
                              {ln}
                            </tspan>
                          ))}
                        </text>
                      </g>
                    </g>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs font-sans font-semibold">{node.label}</p>
                    <p className="max-w-xs text-muted-foreground text-xs">ID: {node.id}</p>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </g>
        </svg>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{selectedNode?.label}</DialogTitle>
            </DialogHeader>
            <div className="max-h-[60vh] overflow-auto">
              {selectedNode?.content ? (
                <KatexRenderer content={selectedNode.content} />
              ) : (
                <p className="text-sm text-muted-foreground">No content for this step.</p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </TooltipProvider>
    </Card>
  );
}
