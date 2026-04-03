"use client";

import { useState, useEffect, useCallback } from "react";
import { TYPE_CONFIG } from "@/lib/typeConfig";
import { useReviewStreak } from "@/hooks/useReviewStreak";
import type { Capture } from "@/lib/api";

const TODAY = new Date().toISOString().slice(0, 10);

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
  return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
}

function formatDate(iso: string): string {
  if (iso === "Unknown") return "Unknown";
  const d = new Date(iso + "T00:00:00");
  const today = new Date(TODAY + "T00:00:00");
  const yesterday = new Date(TODAY + "T00:00:00");
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

function isDeferred(c: Capture): boolean {
  const dt = c.metadata?.deferred_to as string | undefined;
  return !!dt && dt > TODAY;
}

function DayStats({ items }: { items: Capture[] }) {
  const done = items.filter((c) => c.status !== "active").length;
  const deferred = items.filter((c) => isDeferred(c)).length;
  const floating = items.filter(
    (c) => c.status === "active" && !c.deadline && !isDeferred(c) && c.capture_type !== "calendar"
  ).length;

  const stats: { label: string; value: number; dim?: boolean }[] = [
    { label: "captured", value: items.length },
    { label: "done", value: done },
    ...(deferred > 0 ? [{ label: "deferred", value: deferred, dim: true }] : []),
    ...(floating > 0 ? [{ label: "floating", value: floating, dim: true }] : []),
  ];

  return (
    <div className="flex items-center gap-3">
      {stats.map((s, i) => (
        <span key={i} className={`text-[10px] ${s.dim ? "text-stone-300" : "text-stone-400"}`}>
          <span className="font-semibold">{s.value}</span> {s.label}
        </span>
      ))}
    </div>
  );
}

function StatusDot({ capture }: { capture: Capture }) {
  const cfg = TYPE_CONFIG[capture.capture_type as keyof typeof TYPE_CONFIG];

  if (capture.status !== "active") {
    return (
      <div className="w-3.5 h-3.5 rounded-full border-2 border-stone-200 flex items-center justify-center flex-shrink-0 mt-0.5">
        <div className="w-1 h-1 rounded-full bg-stone-300" />
      </div>
    );
  }
  if (isDeferred(capture)) {
    return (
      <div
        className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5 opacity-30"
        style={{ backgroundColor: cfg?.color ?? "#a8a29e" }}
      />
    );
  }
  return (
    <div
      className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5"
      style={{ backgroundColor: cfg?.color ?? "#a8a29e" }}
    />
  );
}

function CaptureRow({ capture }: { capture: Capture }) {
  const cfg = TYPE_CONFIG[capture.capture_type as keyof typeof TYPE_CONFIG];
  const meta = capture.metadata;
  const deferred = isDeferred(capture);
  const completed = capture.status !== "active";

  return (
    <div className={`flex items-start gap-3 py-2 transition-opacity ${completed || deferred ? "opacity-40" : ""}`}>
      <StatusDot capture={capture} />
      <div className="flex-1 min-w-0">
        <p className={`text-sm text-stone-800 leading-snug ${completed ? "line-through" : ""}`}>
          {capture.summary}
        </p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className={`text-[10px] px-1.5 py-px rounded font-medium ${cfg?.bgClass ?? "bg-stone-100 text-stone-400"}`}>
            {cfg?.label ?? capture.capture_type}
          </span>
          {!!meta?.author && (
            <span className="text-[10px] text-stone-400">{meta.author as string}</span>
          )}
          {capture.deadline && (
            <span className={`text-[10px] ${capture.deadline < TODAY && !completed ? "text-red-400" : "text-stone-400"}`}>
              {capture.deadline}
            </span>
          )}
          {deferred && (
            <span className="text-[10px] text-stone-300">
              deferred to {meta.deferred_to as string}
            </span>
          )}
          {completed && (
            <span className="text-[10px] text-stone-300">{capture.status}</span>
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
  const { streak, reviewedToday } = useReviewStreak();

  const load = useCallback(async () => {
    setLoading(true);
    try { setCaptures(await fetchAll()); }
    catch { /* silently fail */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = filter === "all"
    ? captures
    : captures.filter((c) => c.capture_type === filter);

  const grouped = groupByDate(filtered);

  return (
    <div className="max-w-2xl mx-auto p-4 pt-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <h1 className="text-base font-semibold text-stone-900">Timeline</h1>
          {streak > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 font-medium border border-amber-100">
              {streak} day streak
            </span>
          )}
        </div>
        {reviewedToday && (
          <span className="text-[10px] text-stone-300">reviewed today</span>
        )}
      </div>

      {/* Type filter pills */}
      <div className="flex flex-wrap gap-1.5 mb-5">
        {TYPE_FILTER_ORDER.map((type) => (
          <button
            key={type}
            onClick={() => setFilter(type)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors active:scale-[0.95] ${
              filter === type
                ? "bg-stone-900 text-white"
                : "bg-stone-100 text-stone-500 hover:bg-stone-200"
            }`}
          >
            {FILTER_LABELS[type]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 rounded-lg bg-stone-100 animate-pulse" />
          ))}
        </div>
      ) : grouped.length === 0 ? (
        <div className="text-center mt-16">
          <p className="text-stone-500 text-sm">Nothing captured yet.</p>
        </div>
      ) : (
        grouped.map(([date, items]) => {
          const isToday = date === TODAY;
          return (
            <div key={date} className="mb-7">
              {/* Day header */}
              <div className="flex items-center gap-3 mb-2">
                <h2 className={`text-xs font-semibold ${isToday ? "text-stone-700" : "text-stone-400"}`}>
                  {formatDate(date)}
                </h2>
                <div className="flex-1 border-t border-stone-100" />
                {isToday && !reviewedToday && filter === "all" && (
                  <a
                    href="/todos"
                    className="text-[10px] text-stone-400 hover:text-stone-600 transition-colors whitespace-nowrap"
                  >
                    Start review →
                  </a>
                )}
                {isToday && reviewedToday && (
                  <span className="text-[10px] text-amber-500">reviewed</span>
                )}
              </div>

              {/* Day stats */}
              {filter === "all" && (
                <div className="mb-2 pl-4">
                  <DayStats items={items} />
                </div>
              )}

              {/* Items */}
              <div className="pl-0">
                {items.map((c) => (
                  <CaptureRow key={c.id} capture={c} />
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
