"use client";

import { useState, useEffect, useRef } from "react";
import { useCaptures } from "@/hooks/useCaptures";
import { getEntityGraph, restoreCapture } from "@/lib/api";
import { CapturePreviewDrawer } from "@/components/CapturePreviewDrawer";
import { GraphView } from "@/components/GraphView";
import { TYPE_CONFIG } from "@/lib/typeConfig";
import { useToast } from "@/hooks/useToast";
import type { Capture, EntityGraph, GraphNode } from "@/lib/api";

// ─── helpers ────────────────────────────────────────────────────────────────

function getLocalToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function relativeDate(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays}d`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function isDeferred(c: Capture): boolean {
  const dt = c.metadata?.deferred_to as string | undefined;
  return !!dt && dt > getLocalToday();
}

// ─── filter config ───────────────────────────────────────────────────────────

const FILTERS = [
  { key: "all",      label: "All" },
  { key: "to_cook",  label: "Ideas" },
  { key: "to_learn", label: "Reading" },
  { key: "to_hit",   label: "Tasks" },
  { key: "to_know",  label: "Questions" },
  { key: "project",  label: "Projects" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

// ─── LibraryRow ──────────────────────────────────────────────────────────────

function LibraryRow({
  capture,
  onPreview,
  onDone,
  onDefer,
  onDelete,
}: {
  capture: Capture;
  onPreview: (capture: Capture) => void;
  onDone?: (captureId: number, doneStatus: string) => Promise<void>;
  onDefer?: (captureId: number) => Promise<void>;
  onDelete?: (captureId: number) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [resolved, setResolved] = useState(false);
  const restoringRef = useRef(false);
  const { show: showToast } = useToast();

  const cfg = TYPE_CONFIG[capture.capture_type as keyof typeof TYPE_CONFIG];
  const topic = typeof capture.metadata?.topic === "string" ? capture.metadata.topic as string : null;
  const deferred = isDeferred(capture);

  const fireAction = (label: string, fn: () => Promise<void>) => {
    setExpanded(false);
    setResolved(true);
    fn();
    showToast(label, {
      label: "Undo",
      onClick: () => {
        if (restoringRef.current) return;
        restoringRef.current = true;
        restoreCapture(capture.id).then(() => {
          setResolved(false);
          restoringRef.current = false;
        });
      },
    });
  };

  if (resolved) return null;

  return (
    <div className="border-b border-stone-50 last:border-0">
      <div className={`flex items-center gap-2 py-2 group ${deferred ? "opacity-40" : ""}`}>
        {/* Row button */}
        <button
          onClick={() => onPreview(capture)}
          className="flex items-center gap-2.5 flex-1 min-w-0 -mx-1 px-1 rounded-lg hover:bg-stone-50 transition-colors text-left"
        >
          {/* Type dot */}
          <div
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: cfg?.color ?? "#a8a29e" }}
          />

          {/* Summary */}
          <span className="text-sm text-stone-800 flex-1 min-w-0 truncate leading-snug">
            {capture.summary}
          </span>

          {/* Topic chip */}
          {topic && (
            <span className="flex-shrink-0 text-[10px] text-stone-400 bg-stone-100 px-1.5 py-0.5 rounded-md max-w-[90px] truncate">
              {topic}
            </span>
          )}

          {/* Relative date */}
          <span className="flex-shrink-0 text-[11px] text-stone-300 w-12 text-right tabular-nums">
            {relativeDate(capture.updated_at)}
          </span>
        </button>

        {/* ⋯ action button */}
        <button
          onClick={() => setExpanded((e) => !e)}
          className={`flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-md transition-colors opacity-0 group-hover:opacity-100 ${
            expanded ? "bg-stone-100 text-stone-600 opacity-100" : "text-stone-300 hover:bg-stone-100 hover:text-stone-500"
          }`}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <circle cx="2" cy="6" r="1.1" />
            <circle cx="6" cy="6" r="1.1" />
            <circle cx="10" cy="6" r="1.1" />
          </svg>
        </button>
      </div>

      {/* Inline action panel */}
      {expanded && (
        <div className="flex gap-2 pb-3 pl-5 pr-1">
          {onDefer && (
            <button
              onClick={() => !deferred && fireAction("Deferred", () => onDefer(capture.id))}
              className={`flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl transition-all active:scale-[0.97] ${
                deferred ? "bg-stone-800 text-white" : "border border-stone-200 text-stone-600 hover:bg-stone-50"
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.3" />
                <path d="M8 6v2.5l1.5 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M5.5 2.5h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
              <span className="text-[10px] font-semibold">{deferred ? "Deferred" : "Defer"}</span>
            </button>
          )}
          {onDone && cfg?.doneStatus && (
            <button
              onClick={() => fireAction(cfg.doneLabel || "Done", () => onDone(capture.id, cfg.doneStatus))}
              className="flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl border border-stone-200 text-stone-600 hover:bg-stone-50 active:scale-[0.97] transition-all"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" />
                <path d="M5 8l2.5 2.5L11 5.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="text-[10px] font-semibold">{cfg.doneLabel || "Done"}</span>
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => fireAction("Deleted", () => onDelete(capture.id))}
              className="flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl border border-stone-200 text-stone-400 hover:text-red-500 hover:border-red-200 hover:bg-red-50 active:scale-[0.97] transition-all"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M3 5h10M6 5V3.5a.5.5 0 01.5-.5h3a.5.5 0 01.5.5V5M12.5 5l-.7 7.5a1 1 0 01-1 .9H5.2a1 1 0 01-1-.9L3.5 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="text-[10px] font-semibold">Delete</span>
            </button>
          )}
          <button
            onClick={() => { setExpanded(false); onPreview(capture); }}
            className="flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl border border-stone-200 text-stone-600 hover:bg-stone-50 active:scale-[0.97] transition-all"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M3 8s2-4 5-4 5 4 5 4-2 4-5 4-5-4-5-4z" stroke="currentColor" strokeWidth="1.3" />
              <circle cx="8" cy="8" r="1.5" stroke="currentColor" strokeWidth="1.3" />
            </svg>
            <span className="text-[10px] font-semibold">Open</span>
          </button>
        </div>
      )}
    </div>
  );
}

// ─── TopicGroup ───────────────────────────────────────────────────────────────

function TopicGroup({
  topic,
  captures,
  defaultOpen = true,
  onPreview,
  onDone,
  onDefer,
  onDelete,
}: {
  topic: string;
  captures: Capture[];
  defaultOpen?: boolean;
  onPreview: (capture: Capture) => void;
  onDone?: (captureId: number, doneStatus: string) => Promise<void>;
  onDefer?: (captureId: number) => Promise<void>;
  onDelete?: (captureId: number) => Promise<void>;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="mb-4">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 mb-1.5 group"
      >
        <svg
          width="10" height="10" viewBox="0 0 10 10" fill="none"
          className={`text-stone-300 transition-transform duration-150 flex-shrink-0 ${open ? "rotate-90" : ""}`}
        >
          <path d="M3 2l4 3-4 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider leading-none">
          {topic}
        </span>
        <span className="text-[10px] text-stone-300 ml-0.5">{captures.length}</span>
        <div className="flex-1 h-px bg-stone-100 ml-1" />
      </button>

      {open && (
        <div className="bg-white border border-[#e8e4db] rounded-xl px-4 py-1">
          {captures.map((c) => (
            <LibraryRow
              key={c.id}
              capture={c}
              onPreview={onPreview}
              onDone={onDone}
              onDefer={onDefer}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function LibraryPage() {
  const {
    captures,
    loading: capturesLoading,
    error,
    refresh,
    markDone,
    deleteCapture,
    deferCapture,
    patchSummary,
  } = useCaptures();

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [groupByTopic, setGroupByTopic] = useState(false);
  const [sortOrder, setSortOrder] = useState<"recent" | "oldest">("recent");
  const [viewMode, setViewMode] = useState<"list" | "graph">("list");
  const [graph, setGraph] = useState<EntityGraph | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [previewId, setPreviewId] = useState<number | null>(null);

  useEffect(() => {
    if (viewMode === "graph" && !graph) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGraphLoading(true);
      getEntityGraph()
        .then(setGraph)
        .catch(() => setGraph({ nodes: [], links: [] }))
        .finally(() => setGraphLoading(false));
    }
  }, [viewMode, graph]);

  if (capturesLoading) {
    return (
      <div className="p-4 max-w-2xl mx-auto">
        <div className="h-10 rounded-xl bg-stone-100 animate-pulse mb-4" />
        <div className="flex gap-2 mb-4">
          {[50, 55, 60, 55, 70].map((w, i) => (
            <div key={i} className="h-7 rounded-full bg-stone-100 animate-pulse" style={{ width: w }} />
          ))}
        </div>
        <div className="flex flex-col gap-1.5">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-10 rounded-xl bg-stone-100 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center mt-16 max-w-2xl mx-auto">
        <p className="text-stone-500 text-sm cursor-pointer hover:text-stone-700" onClick={refresh}>
          Couldn&apos;t load. Tap to retry.
        </p>
      </div>
    );
  }

  // Base set: active, non-calendar, non-query captures
  const base = captures.filter(
    (c) => c.status === "active" && !["calendar", "query"].includes(c.capture_type)
  );

  const q = query.trim().toLowerCase();

  // Type filter
  const typeFiltered =
    filter === "all" ? base : base.filter((c) => c.capture_type === filter);

  // Search
  const searched = q
    ? typeFiltered.filter(
        (c) =>
          c.summary.toLowerCase().includes(q) ||
          (c.content && c.content.toLowerCase().includes(q)) ||
          (typeof c.metadata?.topic === "string" &&
            (c.metadata.topic as string).toLowerCase().includes(q))
      )
    : typeFiltered;

  // Sort
  const sorted =
    sortOrder === "recent"
      ? [...searched].sort(
          (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        )
      : [...searched].sort(
          (a, b) => new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()
        );

  // Grouped by topic
  const buildGroups = (list: Capture[]): Map<string, Capture[]> => {
    const groups = new Map<string, Capture[]>();
    for (const c of list) {
      const key =
        typeof c.metadata?.topic === "string" && c.metadata.topic
          ? (c.metadata.topic as string)
          : "Other";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(c);
    }
    // Sort groups: named topics first alphabetically, "Other" last
    const entries = [...groups.entries()].sort(([a], [b]) => {
      if (a === "Other") return 1;
      if (b === "Other") return -1;
      return a.localeCompare(b);
    });
    return new Map(entries);
  };

  const rowHandlers = {
    onDone: markDone,
    onDefer: deferCapture,
    onDelete: deleteCapture,
    onPreview: (c: Capture) => setPreviewId(c.id),
  };

  const totalActive = base.length;
  const filteredCount = sorted.length;

  return (
    <div className="max-w-2xl mx-auto p-4 pt-6">
      {/* Search + view toggle */}
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none"
            width="13" height="13" viewBox="0 0 14 14" fill="none"
          >
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4" />
            <path d="M9.5 9.5L12.5 12.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search captures…"
            className="w-full pl-8 pr-4 py-2.5 bg-stone-50 border border-[#e8e4db] rounded-xl text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-300"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
            >
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>

        {/* View toggle */}
        <div className="flex items-center bg-stone-100 rounded-xl p-1 gap-0.5 flex-shrink-0">
          <button
            onClick={() => setViewMode("list")}
            title="List"
            className={`w-8 h-7 flex items-center justify-center rounded-lg transition-colors ${
              viewMode === "list" ? "bg-white text-stone-700 shadow-sm" : "text-stone-400 hover:text-stone-600"
            }`}
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M2 3h9M2 6.5h9M2 10h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
          <button
            onClick={() => setViewMode("graph")}
            title="Graph"
            className={`w-8 h-7 flex items-center justify-center rounded-lg transition-colors ${
              viewMode === "graph" ? "bg-white text-stone-700 shadow-sm" : "text-stone-400 hover:text-stone-600"
            }`}
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <circle cx="3" cy="10" r="1.8" stroke="currentColor" strokeWidth="1.2" />
              <circle cx="10" cy="10" r="1.8" stroke="currentColor" strokeWidth="1.2" />
              <circle cx="6.5" cy="3" r="1.8" stroke="currentColor" strokeWidth="1.2" />
              <line x1="4.2" y1="9.1" x2="5.7" y2="4.5" stroke="currentColor" strokeWidth="1.2" />
              <line x1="8.8" y1="9.1" x2="7.3" y2="4.5" stroke="currentColor" strokeWidth="1.2" />
              <line x1="4.8" y1="10" x2="8.2" y2="10" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
        </div>
      </div>

      {/* Graph view */}
      {viewMode === "graph" && (
        <div className="mb-6 bg-white border border-[#e8e4db] rounded-2xl overflow-hidden">
          {graphLoading || !graph ? (
            <div className="flex items-center justify-center h-64">
              <span className="w-5 h-5 border-2 border-stone-200 border-t-stone-500 rounded-full animate-spin" />
            </div>
          ) : (
            <GraphView graph={graph} onNodeClick={(node: GraphNode) => setPreviewId(node.id)} />
          )}
        </div>
      )}

      {/* List view */}
      {viewMode === "list" && (
        <>
          {/* Filter tabs + controls */}
          <div className="flex items-center gap-2 mb-4 overflow-x-auto scrollbar-none -mx-4 px-4">
            <div className="flex items-center gap-1 flex-shrink-0">
              {FILTERS.map((f) => {
                const count =
                  f.key === "all"
                    ? totalActive
                    : base.filter((c) => c.capture_type === f.key).length;
                const cfg = f.key !== "all" ? TYPE_CONFIG[f.key as keyof typeof TYPE_CONFIG] : null;
                return (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
                      filter === f.key
                        ? "bg-stone-900 text-white"
                        : "text-stone-500 hover:bg-stone-100"
                    }`}
                  >
                    {cfg && (
                      <div
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: filter === f.key ? "white" : cfg.color }}
                      />
                    )}
                    {f.label}
                    {count > 0 && (
                      <span className={`text-[10px] ${filter === f.key ? "text-white/70" : "text-stone-400"}`}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex-1" />

            {/* Group by topic */}
            <button
              onClick={() => setGroupByTopic((g) => !g)}
              title="Group by topic"
              className={`flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs transition-colors ${
                groupByTopic
                  ? "bg-stone-900 text-white"
                  : "text-stone-400 hover:bg-stone-100 hover:text-stone-600"
              }`}
            >
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                <rect x="1" y="1" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.2" />
                <rect x="7" y="1" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.2" />
                <rect x="1" y="7" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.2" />
                <rect x="7" y="7" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.2" />
              </svg>
              Topics
            </button>

            {/* Sort */}
            <button
              onClick={() => setSortOrder((s) => (s === "recent" ? "oldest" : "recent"))}
              className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs text-stone-400 hover:bg-stone-100 hover:text-stone-600 transition-colors"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path
                  d={sortOrder === "recent" ? "M5 8V2M2 5l3-3 3 3" : "M5 2v6M2 5l3 3 3-3"}
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {sortOrder === "recent" ? "Recent" : "Oldest"}
            </button>
          </div>

          {/* Results */}
          {sorted.length === 0 ? (
            <div className="text-center py-16 text-stone-400 text-sm">
              {q ? `No results for "${query}"` : "Nothing here yet."}
            </div>
          ) : groupByTopic ? (
            // Grouped view
            <>
              {[...buildGroups(sorted).entries()].map(([topic, items]) => (
                <TopicGroup
                  key={topic}
                  topic={topic}
                  captures={items}
                  onPreview={(c) => setPreviewId(c.id)}
                  onDone={rowHandlers.onDone}
                  onDefer={rowHandlers.onDefer}
                  onDelete={rowHandlers.onDelete}
                />
              ))}
            </>
          ) : (
            // Flat view
            <div className="bg-white border border-[#e8e4db] rounded-xl px-4 py-1 mb-4">
              {sorted.map((c) => (
                <LibraryRow
                  key={c.id}
                  capture={c}
                  onPreview={(cap) => setPreviewId(cap.id)}
                  onDone={rowHandlers.onDone}
                  onDefer={rowHandlers.onDefer}
                  onDelete={rowHandlers.onDelete}
                />
              ))}
            </div>
          )}

          {/* Result count */}
          {(q || filter !== "all") && sorted.length > 0 && (
            <p className="text-[11px] text-stone-300 text-center mb-4">
              {filteredCount} result{filteredCount !== 1 ? "s" : ""}
            </p>
          )}

        </>
      )}

      <CapturePreviewDrawer captureId={previewId} onClose={() => setPreviewId(null)} onSummaryChange={patchSummary} />
    </div>
  );
}
