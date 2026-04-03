"use client";

import { useState, useEffect, useCallback } from "react";
import { TYPE_CONFIG } from "@/lib/typeConfig";
import type { Capture } from "@/lib/api";

async function fetchAll(): Promise<Capture[]> {
  const res = await fetch("/api/captures");
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

function groupByDate(captures: Capture[]): [string, Capture[]][] {
  const map = new Map<string, Capture[]>();
  for (const c of captures) {
    const date = c.created_at?.slice(0, 10) ?? "Unknown";
    if (!map.has(date)) map.set(date, []);
    map.get(date)!.push(c);
  }
  // Sort dates descending
  return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
}

function formatDate(iso: string): string {
  if (iso === "Unknown") return "Unknown";
  const d = new Date(iso + "T00:00:00");
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

function CaptureRow({ capture }: { capture: Capture }) {
  const cfg = TYPE_CONFIG[capture.capture_type as keyof typeof TYPE_CONFIG];
  const meta = capture.metadata;

  return (
    <div className="flex items-start gap-3 py-2">
      <div
        className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5"
        style={{ backgroundColor: cfg?.color ?? "#a1a1aa" }}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-zinc-800 leading-snug">{capture.summary}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] text-zinc-400">{cfg?.label ?? capture.capture_type}</span>
          {meta?.author && (
            <span className="text-[10px] text-zinc-400">· {meta.author as string}</span>
          )}
          {capture.deadline && (
            <span className="text-[10px] text-zinc-400">· {capture.deadline}</span>
          )}
          {capture.status !== "active" && (
            <span className="text-[10px] text-zinc-300 line-through">{capture.status}</span>
          )}
        </div>
      </div>
    </div>
  );
}

const TYPE_FILTER_ORDER = ["all", "to_hit", "to_learn", "to_cook", "to_know", "calendar"] as const;
const FILTER_LABELS: Record<string, string> = {
  all: "All",
  to_hit: "Tasks",
  to_learn: "Learning",
  to_cook: "Ideas",
  to_know: "Questions",
  calendar: "Events",
};

export default function TimelinePage() {
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  const load = useCallback(async () => {
    setLoading(true);
    try { setCaptures(await fetchAll()); }
    catch { /* silently fail */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = filter === "all"
    ? captures
    : captures.filter(c => c.capture_type === filter);

  const grouped = groupByDate(filtered);

  return (
    <div className="max-w-2xl mx-auto p-4 pt-6">
      <h1 className="text-base font-semibold text-zinc-900 mb-3">Timeline</h1>

      {/* Type filter pills */}
      <div className="flex flex-wrap gap-1.5 mb-5">
        {TYPE_FILTER_ORDER.map(type => (
          <button
            key={type}
            onClick={() => setFilter(type)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              filter === type
                ? "bg-zinc-900 text-white"
                : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
            }`}
          >
            {FILTER_LABELS[type]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map(i => <div key={i} className="h-10 rounded-lg bg-zinc-100 animate-pulse" />)}
        </div>
      ) : grouped.length === 0 ? (
        <div className="text-center mt-16">
          <p className="text-zinc-500 text-sm">Nothing captured yet.</p>
        </div>
      ) : (
        grouped.map(([date, items]) => (
          <div key={date} className="mb-6">
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-xs font-semibold text-zinc-400">{formatDate(date)}</h2>
              <div className="flex-1 border-t border-zinc-100" />
              <span className="text-[10px] text-zinc-300">{items.length}</span>
            </div>
            <div className="pl-0">
              {items.map(c => <CaptureRow key={c.id} capture={c} />)}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
