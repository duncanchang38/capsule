"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { EntityGraph, GraphNode } from "@/lib/api";
import { TYPE_CONFIG } from "@/lib/typeConfig";

// ─── types ───────────────────────────────────────────────────────────────────

interface SimNode {
  id: string;           // capture id (string) or "topic:X"
  kind: "capture" | "topic";
  label: string;        // summary (truncated) or topic name
  fullLabel: string;    // full summary for panel
  type: string;         // capture_type or "topic"
  status: string;
  captureId?: number;   // only for capture nodes
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;       // based on degree
}

interface SimLink {
  source: string;
  target: string;
  weight: number;
  kind: "entity" | "topic";
}

// ─── constants ───────────────────────────────────────────────────────────────

const BG = "#111110";
const GRID = "rgba(255,255,255,0.03)";
const TOPIC_COLOR = "#a8a29e";
const TOPIC_BG = "#1c1b1a";
const LABEL_COLOR = "rgba(255,255,255,0.75)";

const MIN_R = 5;
const MAX_R = 14;
const TOPIC_R = 10;

function typeColor(type: string): string {
  const cfg = TYPE_CONFIG[type as keyof typeof TYPE_CONFIG];
  return cfg?.color ?? TOPIC_COLOR;
}

// ─── build simulation graph ──────────────────────────────────────────────────

function buildSimGraph(graph: EntityGraph): { nodes: SimNode[]; links: SimLink[] } {
  if (graph.nodes.length === 0) return { nodes: [], links: [] };

  // Degree count for sizing
  const degree: Record<string, number> = {};
  for (const n of graph.nodes) degree[String(n.id)] = 0;
  for (const l of graph.links) {
    const s = String(l.source);
    const t = String(l.target);
    degree[s] = (degree[s] ?? 0) + 1;
    degree[t] = (degree[t] ?? 0) + 1;
  }

  // Max degree for normalization
  const maxDeg = Math.max(1, ...Object.values(degree));

  // Capture nodes
  const simNodes: SimNode[] = graph.nodes.map((n) => ({
    id: String(n.id),
    kind: "capture",
    label: n.summary.length > 28 ? n.summary.slice(0, 26) + "…" : n.summary,
    fullLabel: n.summary,
    type: n.type,
    status: n.status,
    captureId: n.id,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    radius: MIN_R + ((degree[String(n.id)] ?? 0) / maxDeg) * (MAX_R - MIN_R),
  }));

  // Build tag → capture id map (use tags array, fall back to legacy topic field)
  const tagMap = new Map<string, string[]>();
  for (const n of graph.nodes) {
    const tags = n.tags?.length ? n.tags : (n.topic ? [n.topic] : []);
    for (const tag of tags) {
      if (!tagMap.has(tag)) tagMap.set(tag, []);
      tagMap.get(tag)!.push(String(n.id));
    }
  }

  // Tag hub nodes (for visual anchoring — even single-capture tags get a hub)
  const topicLinks: SimLink[] = [];
  for (const [topic, ids] of tagMap.entries()) {
    const tid = `topic:${topic}`;
    simNodes.push({
      id: tid,
      kind: "topic",
      label: topic,
      fullLabel: topic,
      type: "topic",
      status: "active",
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      radius: TOPIC_R,
    });
    for (const cid of ids) {
      topicLinks.push({ source: tid, target: cid, weight: 1, kind: "topic" });
    }
    // Also draw direct capture-to-capture edges for shared tags (Obsidian style)
    if (ids.length >= 2) {
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          topicLinks.push({ source: ids[i], target: ids[j], weight: 0.5, kind: "topic" });
        }
      }
    }
  }

  // Entity links
  const entityLinks: SimLink[] = graph.links.map((l) => ({
    source: String(l.source),
    target: String(l.target),
    weight: l.weight,
    kind: "entity",
  }));

  return { nodes: simNodes, links: [...entityLinks, ...topicLinks] };
}

// ─── component ───────────────────────────────────────────────────────────────

interface Props {
  graph: EntityGraph;
  onNodeClick: (node: GraphNode) => void;
}

export function GraphView({ graph, onNodeClick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const linksRef = useRef<SimLink[]>([]);
  const nodeMapRef = useRef<Map<string, SimNode>>(new Map());
  const animFrameRef = useRef<number>(0);
  const drawRef = useRef<() => void>(() => {});

  // Interaction state (refs to avoid re-renders on every mouse move)
  const hoveredRef = useRef<SimNode | null>(null);
  const selectedRef = useRef<SimNode | null>(null);
  const highlightedRef = useRef<Set<string>>(new Set());

  // Pan/zoom
  const transformRef = useRef({ x: 0, y: 0, scale: 1 });
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, tx: 0, ty: 0 });

  // Panel state (this does cause re-renders, intentionally)
  const [selected, setSelected] = useState<SimNode | null>(null);
  const [connectedNodes, setConnectedNodes] = useState<SimNode[]>([]);

  const getConnected = useCallback((nodeId: string): SimNode[] => {
    const links = linksRef.current;
    const nodeMap = nodeMapRef.current;
    const ids = new Set<string>();
    for (const l of links) {
      if (l.source === nodeId) ids.add(l.target);
      if (l.target === nodeId) ids.add(l.source);
    }
    return [...ids].map((id) => nodeMap.get(id)).filter(Boolean) as SimNode[];
  }, []);

  const selectNode = useCallback((node: SimNode | null) => {
    selectedRef.current = node;
    if (node) {
      const connected = getConnected(node.id);
      const highlighted = new Set([node.id, ...connected.map((n) => n.id)]);
      highlightedRef.current = highlighted;
      setConnectedNodes(connected);
    } else {
      highlightedRef.current = new Set();
      setConnectedNodes([]);
    }
    setSelected(node);
    drawRef.current();
  }, [getConnected]);

  // World ↔ screen transforms
  const toWorld = useCallback((sx: number, sy: number) => {
    const t = transformRef.current;
    return { x: (sx - t.x) / t.scale, y: (sy - t.y) / t.scale };
  }, []);

  const getNodeAt = useCallback((sx: number, sy: number): SimNode | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const cx = (sx - rect.left) * (canvas.width / rect.width / (window.devicePixelRatio || 1));
    const cy = (sy - rect.top) * (canvas.height / rect.height / (window.devicePixelRatio || 1));
    const { x: wx, y: wy } = toWorld(cx, cy);
    let closest: SimNode | null = null;
    let closestDist = Infinity;
    for (const n of nodesRef.current) {
      const dx = n.x - wx;
      const dy = n.y - wy;
      const dist2 = dx * dx + dy * dy;
      const hitR = n.radius + 6;
      if (dist2 <= hitR * hitR && dist2 < closestDist) {
        closestDist = dist2;
        closest = n;
      }
    }
    return closest;
  }, [toWorld]);

  // Draw
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const W = canvas.width / dpr;
    const H = canvas.height / dpr;

    const { x: tx, y: ty, scale } = transformRef.current;
    const nodes = nodesRef.current;
    const links = linksRef.current;
    const nodeMap = nodeMapRef.current;
    const hovered = hoveredRef.current;
    const highlighted = highlightedRef.current;
    const hasHighlight = highlighted.size > 0;

    ctx.save();
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);

    // Subtle grid
    ctx.strokeStyle = GRID;
    ctx.lineWidth = 1;
    const gridSize = 40 * scale;
    const ox = tx % gridSize;
    const oy = ty % gridSize;
    for (let gx = ox; gx < W; gx += gridSize) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
    }
    for (let gy = oy; gy < H; gy += gridSize) {
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
    }

    ctx.translate(tx, ty);
    ctx.scale(scale, scale);

    // Edges
    for (const link of links) {
      const src = nodeMap.get(link.source);
      const tgt = nodeMap.get(link.target);
      if (!src || !tgt) continue;

      const isRelevant = hasHighlight
        ? (highlighted.has(link.source) && highlighted.has(link.target))
        : true;
      // Topic hub links: moderately visible. Direct shared-tag links: brighter.
      // Entity links: brightest (most meaningful connection).
      const isDirectTag = link.kind === "topic" && !link.source.startsWith("topic:") && !link.target.startsWith("topic:");
      const baseAlpha = link.kind === "entity"
        ? Math.min(0.25 + link.weight * 0.08, 0.7)
        : isDirectTag ? 0.35
        : 0.2;
      const alpha = isRelevant
        ? baseAlpha * (hasHighlight ? 1.4 : 1)
        : baseAlpha * 0.08;

      ctx.beginPath();
      ctx.moveTo(src.x, src.y);
      ctx.lineTo(tgt.x, tgt.y);
      ctx.strokeStyle = link.kind === "entity"
        ? `rgba(255,255,255,${alpha})`
        : isDirectTag
          ? `rgba(200,195,185,${alpha})`
          : `rgba(168,162,158,${alpha})`;
      ctx.lineWidth = link.kind === "entity"
        ? Math.min(link.weight * 1.0, 2.5) / scale
        : isDirectTag ? 1.2 / scale
        : 0.7 / scale;
      ctx.stroke();
    }

    // Nodes + labels
    for (const n of nodes) {
      const isHighlighted = hasHighlight ? highlighted.has(n.id) : true;
      const isSelected = selectedRef.current?.id === n.id;
      const isHovered = hovered?.id === n.id;
      const isDim = !isHighlighted;
      const nodeAlpha = isDim ? 0.1 : (n.status === "done" || n.status === "absorbed" ? 0.35 : 1);
      const color = n.kind === "topic" ? TOPIC_COLOR : typeColor(n.type);

      ctx.globalAlpha = nodeAlpha;

      if (n.kind === "topic") {
        // Topic node: rounded square
        const r = n.radius;
        const pad = r * 0.55;
        ctx.beginPath();
        ctx.roundRect(n.x - pad, n.y - pad, pad * 2, pad * 2, 3 / scale);
        ctx.fillStyle = TOPIC_BG;
        ctx.fill();
        ctx.strokeStyle = TOPIC_COLOR;
        ctx.lineWidth = (isSelected || isHovered ? 1.5 : 0.8) / scale;
        ctx.stroke();
      } else {
        // Capture node: circle
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      }

      // Selection / hover ring
      if (isSelected || isHovered) {
        ctx.globalAlpha = isSelected ? 0.6 : 0.25;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius + 5 / scale, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = (isSelected ? 2 : 1.2) / scale;
        ctx.stroke();

        if (isSelected) {
          // Glow
          ctx.globalAlpha = 0.08;
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.radius + 16 / scale, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
        }
      }

      ctx.globalAlpha = 1;

      // Label
      const labelAlpha = isDim ? 0 : (isHighlighted || isSelected || isHovered ? 0.9 : 0.45);
      if (labelAlpha > 0) {
        ctx.globalAlpha = labelAlpha;
        const fontSize = n.kind === "topic" ? 10 / scale : 9 / scale;
        ctx.font = `${n.kind === "topic" ? "500" : "400"} ${fontSize}px -apple-system, system-ui, sans-serif`;
        ctx.fillStyle = n.kind === "topic" ? TOPIC_COLOR : LABEL_COLOR;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(n.label, n.x, n.y + n.radius + 4 / scale);
        ctx.globalAlpha = 1;
      }
    }

    ctx.restore();
  }, []);

  // Keep drawRef in sync
  useEffect(() => { drawRef.current = draw; }, [draw]);

  // Simulation
  const runSimulation = useCallback(() => {
    const nodes = nodesRef.current;
    const links = linksRef.current;
    const nodeMap = nodeMapRef.current;
    const canvas = canvasRef.current;
    if (!canvas || nodes.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const W = canvas.width / dpr;
    const H = canvas.height / dpr;
    const cx = W / 2;
    const cy = H / 2;

    // Place nodes in a circle initially
    nodes.forEach((n, i) => {
      const angle = (i / nodes.length) * Math.PI * 2;
      const r = Math.min(W, H) * 0.35;
      n.x = cx + Math.cos(angle) * r + (Math.random() - 0.5) * 30;
      n.y = cy + Math.sin(angle) * r + (Math.random() - 0.5) * 30;
      n.vx = 0;
      n.vy = 0;
    });

    const REPULSION_CAPTURE = 2400;
    const REPULSION_TOPIC = 800;
    const LINK_DIST_ENTITY = 130;
    const LINK_DIST_TOPIC = 90;
    const LINK_STRENGTH = 0.12;
    const CENTER_GRAVITY = 0.025;
    const DAMPING = 0.82;

    let tick = 0;
    const step = () => {
      // Repulsion
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist2 = dx * dx + dy * dy + 1;
          const dist = Math.sqrt(dist2);
          const rep = a.kind === "capture" && b.kind === "capture" ? REPULSION_CAPTURE : REPULSION_TOPIC;
          const force = rep / dist2;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          a.vx -= fx; a.vy -= fy;
          b.vx += fx; b.vy += fy;
        }
      }

      // Link attraction
      for (const link of links) {
        const src = nodeMap.get(link.source);
        const tgt = nodeMap.get(link.target);
        if (!src || !tgt) continue;
        const dx = tgt.x - src.x;
        const dy = tgt.y - src.y;
        const dist = Math.sqrt(dx * dx + dy * dy) + 1;
        const targetDist = link.kind === "entity" ? LINK_DIST_ENTITY : LINK_DIST_TOPIC;
        const force = (dist - targetDist) * LINK_STRENGTH * Math.min(link.weight, 4);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        src.vx += fx; src.vy += fy;
        tgt.vx -= fx; tgt.vy -= fy;
      }

      // Center gravity + integrate
      for (const n of nodes) {
        n.vx += (cx - n.x) * CENTER_GRAVITY;
        n.vy += (cy - n.y) * CENTER_GRAVITY;
        n.vx *= DAMPING;
        n.vy *= DAMPING;
        n.x += n.vx;
        n.y += n.vy;
      }

      drawRef.current();
      tick++;
      if (tick < 400 || nodes.some((n) => Math.abs(n.vx) > 0.3 || Math.abs(n.vy) > 0.3)) {
        animFrameRef.current = requestAnimationFrame(step);
      }
    };

    animFrameRef.current = requestAnimationFrame(step);
  }, []);

  // Init graph + canvas on graph change
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    cancelAnimationFrame(animFrameRef.current);

    const dpr = window.devicePixelRatio || 1;
    const W = container.clientWidth;
    const H = container.clientHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;

    transformRef.current = { x: 0, y: 0, scale: 1 };

    const { nodes, links } = buildSimGraph(graph);
    nodesRef.current = nodes;
    linksRef.current = links;
    nodeMapRef.current = new Map(nodes.map((n) => [n.id, n]));

    selectNode(null);
    runSimulation();

    return () => cancelAnimationFrame(animFrameRef.current);
  }, [graph, runSimulation, selectNode]);

  // Mouse handlers
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanningRef.current) {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      transformRef.current.x = panStartRef.current.tx + dx;
      transformRef.current.y = panStartRef.current.ty + dy;
      drawRef.current();
      return;
    }
    const node = getNodeAt(e.clientX, e.clientY);
    if (node?.id !== hoveredRef.current?.id) {
      hoveredRef.current = node;
      drawRef.current();
    }
  }, [getNodeAt]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const node = getNodeAt(e.clientX, e.clientY);
    if (node) return; // let click handle it
    isPanningRef.current = true;
    panStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      tx: transformRef.current.x,
      ty: transformRef.current.y,
    };
  }, [getNodeAt]);

  const handleMouseUp = useCallback(() => {
    isPanningRef.current = false;
  }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (isPanningRef.current) return;
    const node = getNodeAt(e.clientX, e.clientY);
    if (!node) {
      selectNode(null);
      return;
    }
    if (node.kind === "capture" && node.captureId !== undefined) {
      selectNode(node);
    } else if (node.kind === "topic") {
      // Topic node: highlight all its captures
      selectNode(node);
    }
  }, [getNodeAt, selectNode]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left);
    const my = (e.clientY - rect.top);

    const dpr = window.devicePixelRatio || 1;
    const cwx = mx * (canvas.width / rect.width / dpr);
    const cwy = my * (canvas.height / rect.height / dpr);

    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const { x: tx, y: ty, scale } = transformRef.current;
    const newScale = Math.max(0.2, Math.min(4, scale * factor));
    const ratio = newScale / scale;
    transformRef.current = {
      x: cwx - (cwx - tx) * ratio,
      y: cwy - (cwy - ty) * ratio,
      scale: newScale,
    };
    drawRef.current();
  }, []);

  const handleMouseLeave = useCallback(() => {
    isPanningRef.current = false;
    if (hoveredRef.current) {
      hoveredRef.current = null;
      drawRef.current();
    }
  }, []);

  // Navigate to a connected node from the panel
  const flyToNode = useCallback((node: SimNode) => {
    selectNode(node);
    // Center view on node
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.width / dpr;
    const H = canvas.height / dpr;
    const { scale } = transformRef.current;
    transformRef.current.x = W / 2 - node.x * scale;
    transformRef.current.y = H / 2 - node.y * scale;
    drawRef.current();
  }, [selectNode]);

  if (graph.nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[480px] text-stone-400 text-sm gap-2" style={{ background: BG }}>
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" className="opacity-20">
          <circle cx="8" cy="8" r="4" stroke="currentColor" strokeWidth="1.5"/>
          <circle cx="24" cy="8" r="4" stroke="currentColor" strokeWidth="1.5"/>
          <circle cx="16" cy="24" r="4" stroke="currentColor" strokeWidth="1.5"/>
          <line x1="8" y1="8" x2="24" y2="8" stroke="currentColor" strokeWidth="1.5"/>
          <line x1="8" y1="8" x2="16" y2="24" stroke="currentColor" strokeWidth="1.5"/>
          <line x1="24" y1="8" x2="16" y2="24" stroke="currentColor" strokeWidth="1.5"/>
        </svg>
        <p className="text-stone-500 text-xs">No connections yet. Add more captures to see the graph.</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full overflow-hidden" style={{ height: 520, background: BG }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        style={{ cursor: isPanningRef.current ? "grabbing" : "default", touchAction: "none" }}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onClick={handleClick}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
      />

      {/* Zoom hint */}
      <div className="absolute bottom-3 left-3 text-[9px] text-stone-600 pointer-events-none">
        scroll to zoom · drag to pan
      </div>

      {/* Legend */}
      <div className="absolute bottom-3 right-3 flex flex-col gap-1 pointer-events-none">
        {Object.entries(TYPE_CONFIG)
          .filter(([k]) => !["inbox", "calendar"].includes(k))
          .map(([type, cfg]) => (
            <div key={type} className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cfg.color }} />
              <span className="text-[9px] text-stone-500">{cfg.displayLabel}</span>
            </div>
          ))}
        <div className="flex items-center gap-1.5 mt-1">
          <div className="w-2.5 h-2.5 rounded-sm border border-stone-600 bg-[#1c1b1a]" />
          <span className="text-[9px] text-stone-500">Topic</span>
        </div>
      </div>

      {/* Info panel */}
      {selected && (
        <div
          className="absolute top-3 right-3 w-56 rounded-xl border border-white/10 shadow-2xl overflow-hidden"
          style={{ background: "rgba(20,19,18,0.95)", backdropFilter: "blur(8px)" }}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-2 px-3 pt-3 pb-2 border-b border-white/5">
            <div className="flex-1 min-w-0">
              {selected.kind === "topic" ? (
                <div className="flex items-center gap-1.5 mb-0.5">
                  <div className="w-2 h-2 rounded-sm border border-stone-500 flex-shrink-0" />
                  <span className="text-[10px] text-stone-400 font-medium uppercase tracking-wider">Topic</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 mb-0.5">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: typeColor(selected.type) }} />
                  <span className="text-[10px] font-medium" style={{ color: typeColor(selected.type) }}>
                    {TYPE_CONFIG[selected.type as keyof typeof TYPE_CONFIG]?.displayLabel ?? selected.type}
                  </span>
                </div>
              )}
              <p className="text-xs text-white/85 leading-snug break-words">{selected.fullLabel}</p>
            </div>
            <button
              onClick={() => selectNode(null)}
              className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-white/30 hover:text-white/70 transition-colors mt-0.5"
            >
              <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                <path d="M1 1l7 7M8 1L1 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          {/* Actions */}
          {selected.kind === "capture" && selected.captureId !== undefined && (
            <div className="px-3 py-2 border-b border-white/5">
              <button
                onClick={() => {
                  const originalNode = graph.nodes.find((n) => n.id === selected.captureId);
                  if (originalNode) onNodeClick(originalNode);
                }}
                className="text-[10px] text-stone-400 hover:text-white transition-colors flex items-center gap-1"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M5 1.5h3.5v3.5M8.5 1.5L4 6M2.5 3.5H1.5a.5.5 0 00-.5.5v4.5a.5.5 0 00.5.5H6a.5.5 0 00.5-.5V7.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                </svg>
                Open in drawer
              </button>
            </div>
          )}

          {/* Connected nodes */}
          {connectedNodes.length > 0 && (
            <div className="px-3 py-2 max-h-48 overflow-y-auto">
              <p className="text-[9px] text-stone-600 uppercase tracking-wider mb-1.5">
                {selected.kind === "topic" ? "Captures in this topic" : "Connected to"}
              </p>
              <div className="flex flex-col gap-0.5">
                {connectedNodes.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => flyToNode(n)}
                    className="flex items-center gap-1.5 text-left py-1 px-1.5 rounded-lg hover:bg-white/5 transition-colors group"
                  >
                    {n.kind === "topic" ? (
                      <div className="w-1.5 h-1.5 rounded-sm border border-stone-600 flex-shrink-0" />
                    ) : (
                      <div
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0 opacity-70 group-hover:opacity-100 transition-opacity"
                        style={{ backgroundColor: typeColor(n.type) }}
                      />
                    )}
                    <span className="text-[11px] text-stone-400 group-hover:text-stone-200 transition-colors truncate leading-snug">
                      {n.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
