"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";
import type { RecentView } from "@/hooks/useRecentViews";
import { TYPE_CONFIG } from "@/lib/typeConfig";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max).trimEnd() + "…";
}

export function RecentViewsSidebar({ views }: { views: RecentView[] }) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleClose = useCallback(() => {
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  }, []);

  const cancelClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  if (views.length === 0) return null;

  return (
    <>
      {/* Backdrop for mobile tap-outside close */}
      {open && (
        <div
          className="fixed inset-0 z-30 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Trigger tab — always visible on the right edge */}
      <div
        className="fixed right-0 top-1/2 -translate-y-1/2 z-40 flex items-center"
        onMouseEnter={() => { cancelClose(); setOpen(true); }}
        onMouseLeave={scheduleClose}
      >
        {/* Sliding panel */}
        <div
          className={`
            bg-white border border-[#e8e4db] rounded-l-2xl shadow-[−4px_0_24px_rgba(0,0,0,0.07)]
            transition-all duration-200 ease-out overflow-hidden
            ${open ? "w-56 opacity-100" : "w-0 opacity-0 pointer-events-none"}
          `}
        >
          <div className="w-56 px-4 pt-4 pb-3">
            <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider mb-3">
              Recently Viewed
            </p>
            <div className="flex flex-col gap-0.5">
              {views.slice(0, 10).map((v) => {
                const cfg = TYPE_CONFIG[v.capture_type as keyof typeof TYPE_CONFIG];
                return (
                  <Link
                    key={v.id}
                    href={`/captures/${v.id}`}
                    onClick={() => setOpen(false)}
                    className="group flex flex-col gap-0.5 px-2 py-2 rounded-lg hover:bg-stone-50 transition-colors"
                  >
                    {/* Top row: type dot + topic + time */}
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: cfg?.color ?? "#a8a29e" }}
                      />
                      <span className="text-[10px] text-stone-400 flex-1 min-w-0 truncate">
                        {v.topic ?? cfg?.label ?? v.capture_type}
                      </span>
                      <span className="text-[10px] text-stone-300 flex-shrink-0">
                        {timeAgo(v.viewed_at)}
                      </span>
                    </div>
                    {/* Summary preview */}
                    <p className="text-xs text-stone-600 leading-snug pl-3">
                      {truncate(v.summary, 60)}
                    </p>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        {/* The tab handle */}
        <button
          onClick={() => setOpen((o) => !o)}
          className={`
            flex flex-col items-center justify-center gap-[3px]
            w-5 h-16 rounded-l-lg
            border border-r-0 border-[#e8e4db] bg-white
            shadow-[-2px_0_8px_rgba(0,0,0,0.04)]
            transition-colors hover:bg-stone-50
            ${open ? "bg-stone-50" : ""}
          `}
          aria-label="Recently viewed"
        >
          <span className="w-1 h-1 rounded-full bg-stone-300" />
          <span className="w-1 h-1 rounded-full bg-stone-300" />
          <span className="w-1 h-1 rounded-full bg-stone-300" />
        </button>
      </div>
    </>
  );
}
