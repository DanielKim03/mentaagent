"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";

// Force-directed knowledge graph. Documents (black squares) link to the
// entities they mention; entities shared across documents pull those
// documents together, so the dataset's structure becomes visible and
// navigable. Drag nodes, scroll to zoom, drag the background to pan, click a
// node to spotlight its connections.

export type GNode = {
  id: string;
  label: string;
  kind: "document" | "entity";
  type: string;
  weight: number;
};
export type GEdge = { source: string; target: string };

type SimNode = GNode & SimulationNodeDatum;

const ENTITY_COLORS: Record<string, string> = {
  customer: "#2563eb",
  vendor: "#d97706",
  product: "#16a34a",
  person: "#9333ea",
  contract: "#dc2626",
  location: "#0891b2",
  other: "#737373",
};

function nodeColor(n: GNode) {
  return n.kind === "document" ? "#ffffff" : ENTITY_COLORS[n.type] ?? "#a99c8b";
}
function nodeRadius(n: GNode) {
  return n.kind === "document" ? 7 : 5 + Math.min(Math.sqrt(n.weight) * 2, 12);
}

export default function GraphView({
  nodes: rawNodes,
  edges,
}: {
  nodes: GNode[];
  edges: GEdge[];
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [, setTick] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });

  const nodes = useMemo<SimNode[]>(
    () => rawNodes.map((n) => ({ ...n })),
    [rawNodes]
  );
  const links = useMemo<SimulationLinkDatum<SimNode>[]>(
    () => edges.map((e) => ({ source: e.source, target: e.target })),
    [edges]
  );
  const simRef = useRef<Simulation<SimNode, SimulationLinkDatum<SimNode>> | null>(null);

  // Neighbor lookup for highlighting.
  const neighbors = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const e of edges) {
      if (!m.has(e.source)) m.set(e.source, new Set());
      if (!m.has(e.target)) m.set(e.target, new Set());
      m.get(e.source)!.add(e.target);
      m.get(e.target)!.add(e.source);
    }
    return m;
  }, [edges]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (nodes.length === 0) return;
    const sim = forceSimulation<SimNode>(nodes)
      .force(
        "link",
        forceLink<SimNode, SimulationLinkDatum<SimNode>>(links)
          .id((d) => d.id)
          .distance(60)
          .strength(0.5)
      )
      .force("charge", forceManyBody().strength(-180))
      .force("center", forceCenter(size.w / 2, size.h / 2))
      .force("collide", forceCollide<SimNode>().radius((d) => nodeRadius(d) + 4))
      .on("tick", () => setTick((t) => t + 1));
    simRef.current = sim;
    return () => {
      sim.stop();
    };
    // Re-run only when the graph data changes (not on every resize).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, links]);

  // Keep the centering force in sync with the container size.
  useEffect(() => {
    simRef.current?.force("center", forceCenter(size.w / 2, size.h / 2));
    simRef.current?.alpha(0.3).restart();
  }, [size]);

  // --- pointer interactions (pan + node drag) ---
  const drag = useRef<
    | { type: "pan"; sx: number; sy: number; ox: number; oy: number }
    | { type: "node"; node: SimNode }
    | null
  >(null);

  function onPointerDownNode(e: React.PointerEvent, node: SimNode) {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    node.fx = node.x;
    node.fy = node.y;
    drag.current = { type: "node", node };
    simRef.current?.alphaTarget(0.3).restart();
  }
  function onPointerDownBg(e: React.PointerEvent) {
    drag.current = { type: "pan", sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y };
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    if (d.type === "pan") {
      setView((v) => ({ ...v, x: d.ox + (e.clientX - d.sx), y: d.oy + (e.clientY - d.sy) }));
    } else {
      const rect = wrapRef.current!.getBoundingClientRect();
      d.node.fx = (e.clientX - rect.left - view.x) / view.k;
      d.node.fy = (e.clientY - rect.top - view.y) / view.k;
    }
  }
  function onPointerUp() {
    const d = drag.current;
    if (d?.type === "node") {
      d.node.fx = null;
      d.node.fy = null;
      simRef.current?.alphaTarget(0);
    }
    drag.current = null;
  }
  function onWheel(e: React.WheelEvent) {
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    setView((v) => ({ ...v, k: Math.min(3, Math.max(0.3, v.k * factor)) }));
  }

  const dim = (id: string) =>
    selected !== null && id !== selected && !neighbors.get(selected)?.has(id);

  return (
    <div
      ref={wrapRef}
      className="relative h-full w-full overflow-hidden rounded-xl border border-neutral-200 bg-neutral-100"
    >
      <svg
        width={size.w}
        height={size.h}
        onPointerDown={onPointerDownBg}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
        className="cursor-grab touch-none active:cursor-grabbing"
      >
        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
          {links.map((l, i) => {
            const s = l.source as SimNode;
            const t = l.target as SimNode;
            if (s.x == null || t.x == null) return null;
            const faded = dim(s.id) || dim(t.id);
            return (
              <line
                key={i}
                x1={s.x}
                y1={s.y}
                x2={t.x}
                y2={t.y}
                stroke="#5b5048"
                strokeWidth={1}
                opacity={faded ? 0.1 : 0.6}
              />
            );
          })}
          {nodes.map((n) => {
            if (n.x == null || n.y == null) return null;
            const r = nodeRadius(n);
            const faded = dim(n.id);
            return (
              <g
                key={n.id}
                transform={`translate(${n.x},${n.y})`}
                opacity={faded ? 0.2 : 1}
                onPointerDown={(e) => onPointerDownNode(e, n)}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelected((cur) => (cur === n.id ? null : n.id));
                }}
                className="cursor-pointer"
              >
                {n.kind === "document" ? (
                  <rect x={-r} y={-r} width={r * 2} height={r * 2} rx={2} fill={nodeColor(n)} />
                ) : (
                  <circle r={r} fill={nodeColor(n)} />
                )}
                {(n.kind === "document" || n.weight > 1 || selected === n.id) && (
                  <text
                    x={r + 3}
                    y={4}
                    fontSize={11 / view.k > 11 ? 11 : 11}
                    className="pointer-events-none select-none fill-neutral-700"
                  >
                    {n.label.length > 28 ? n.label.slice(0, 27) + "…" : n.label}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* legend */}
      <div className="absolute bottom-3 left-3 flex flex-wrap gap-x-3 gap-y-1 rounded-lg border border-neutral-200 bg-neutral-100/90 px-3 py-2 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-white" /> Document
        </span>
        {Object.entries(ENTITY_COLORS).map(([type, color]) => (
          <span key={type} className="flex items-center gap-1.5 capitalize">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} />
            {type}
          </span>
        ))}
      </div>
      <p className="absolute right-3 top-3 text-xs text-neutral-400">
        drag nodes · scroll to zoom · click to focus
      </p>
    </div>
  );
}
