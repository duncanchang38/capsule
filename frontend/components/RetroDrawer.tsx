"use client";

import { useState, useEffect } from "react";
import type { Capture } from "@/lib/api";
import { TYPE_CONFIG } from "@/lib/typeConfig";

interface RetroDrawerProps {
  floating: Capture[];
  scheduledTomorrow: number;
  onDefer: (id: number) => Promise<void>;
  onPlanToday: (id: number) => Promise<void>;
  onDone: (id: number, status: string) => Promise<void>;
  onComplete: () => void;
  onClose: () => void;
}

type ItemState = "idle" | "processing" | "done";

function FloatingItem({
  capture,
  onDefer,
  onPlanToday,
  onDone,
}: {
  capture: Capture;
  onDefer: (id: number) => Promise<void>;
  onPlanToday: (id: number) => Promise<void>;
  onDone: (id: number, status: string) => Promise<void>;
}) {
  const [state, setState] = useState<ItemState>("idle");
  const [action, setAction] = useState<string>("");
  const cfg = TYPE_CONFIG[capture.capture_type as keyof typeof TYPE_CONFIG];

  const run = async (label: string, fn: () => Promise<void>) => {
    setState("processing");
    setAction(label);
    await fn();
    setState("done");
  };

  const TODAY = new Date().toISOString().slice(0, 10);
  const isOverdue = capture.deadline && capture.deadline < TODAY;

  if (state === "done") {
    return (
      <div className="flex items-center gap-2.5 px-5 py-3 opacity-40">
        <span className="w-4 h-4 rounded-full bg-stone-200 flex items-center justify-center flex-shrink-0">
          <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
            <path d="M1 3L3 5L7 1" stroke="#78716c" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </span>
        <span className="text-sm text-stone-500 line-through flex-1">{capture.summary}</span>
        <span className="text-[10px] text-stone-400">{action}</span>
      </div>
    );
  }

  return (
    <div className="px-5 py-3.5 border-b border-[#f0ede7] last:border-b-0">
      <div className="flex items-start gap-2.5 mb-2">
        <div
          className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5"
          style={{ backgroundColor: cfg?.color ?? "#a8a29e" }}
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-stone-800 leading-snug">{capture.summary}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            {isOverdue && (
              <span className="text-[10px] text-red-400 font-medium">overdue</span>
            )}
            {cfg && (
              <span className={`text-[10px] px-1.5 py-px rounded font-medium ${cfg.bgClass}`}>
                {cfg.label}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 pl-4">
        {state === "processing" ? (
          <span className="text-xs text-stone-400 italic">Saving…</span>
        ) : (
          <>
            <button
              onClick={() => run("added to today", () => onPlanToday(capture.id))}
              className="text-xs px-2.5 py-1 rounded-lg bg-stone-800 text-white font-medium hover:bg-stone-700 transition-colors active:scale-[0.95]"
              title="Schedule for today"
            >
              Do today
            </button>
            <button
              onClick={() => run("moved to tomorrow", () => onDefer(capture.id))}
              className="text-xs px-2.5 py-1 rounded-lg bg-stone-100 text-stone-600 font-medium hover:bg-stone-200 transition-colors active:scale-[0.95]"
              title="Push to tomorrow"
            >
              Tomorrow
            </button>
            {cfg?.doneStatus && (
              <button
                onClick={() => run(cfg.doneLabel || "done", () => onDone(capture.id, cfg.doneStatus))}
                className="text-xs px-2.5 py-1 rounded-lg text-stone-400 hover:text-stone-600 transition-colors active:scale-[0.95]"
                title="Mark as done"
              >
                {cfg.doneLabel || "Done"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function RetroDrawer({
  floating,
  scheduledTomorrow,
  onDefer,
  onPlanToday,
  onDone,
  onComplete,
  onClose,
}: RetroDrawerProps) {
  const [processed, setProcessed] = useState<Set<number>>(new Set());
  const [closing, setClosing] = useState(false);

  const remaining = floating.filter((c) => !processed.has(c.id));
  const allClear = remaining.length === 0 && floating.length > 0;

  const handleDefer = async (id: number) => {
    await onDefer(id);
    setProcessed((p) => new Set([...p, id]));
  };

  const handlePlanToday = async (id: number) => {
    await onPlanToday(id);
    setProcessed((p) => new Set([...p, id]));
  };

  const handleLetGo = async (id: number, status: string) => {
    await onDone(id, status);
    setProcessed((p) => new Set([...p, id]));
  };

  const handleClose = (markDone: boolean) => {
    setClosing(true);
    setTimeout(() => {
      if (markDone) onComplete();
      onClose();
    }, 250);
  };

  // Escape key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const plannedCount = [...processed].filter((id) => {
    const c = floating.find((f) => f.id === id);
    return c?.deadline;
  }).length;
  const deferredCount = [...processed].filter((id) => {
    const c = floating.find((f) => f.id === id);
    return !!(c?.metadata?.deferred_to);
  }).length;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px]"
        style={{ animation: closing ? "backdropOut 250ms ease-in both" : "backdropIn 200ms ease-out both" }}
        onClick={() => handleClose(false)}
      />
      <div
        className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-[0_-8px_40px_rgba(0,0,0,0.12)] border-t border-[#e8e4db] max-h-[75vh] flex flex-col"
        style={{ animation: closing ? "drawerSlideDown 250ms var(--ease-drawer) both" : "drawerSlideUp 280ms var(--ease-drawer) both" }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-8 h-1 rounded-full bg-stone-200" />
        </div>

        {/* Header */}
        <div className="px-5 pb-3 flex-shrink-0">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-stone-900">Daily Review</h2>
            {!allClear && (
              <span className="text-xs text-stone-400">{remaining.length} to sort</span>
            )}
          </div>
          {!allClear && (
            <p className="text-xs text-stone-400 mt-0.5">
              Make a quick decision on each.
            </p>
          )}
        </div>

        <div className="h-px bg-[#f0ede7] flex-shrink-0" />

        {/* Content */}
        {allClear ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 px-5 py-8">
            <div className="w-12 h-12 rounded-full bg-stone-50 border border-[#e8e4db] flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M4 10L8 14L16 6" stroke="#78716c" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-stone-800">All clear</p>
              <p className="text-xs text-stone-400 mt-1">
                {plannedCount > 0 && `${plannedCount} planned`}
                {plannedCount > 0 && deferredCount > 0 && " · "}
                {deferredCount > 0 && `${deferredCount} deferred`}
              </p>
              {scheduledTomorrow > 0 && (
                <p className="text-xs text-stone-400 mt-0.5">
                  {scheduledTomorrow} item{scheduledTomorrow !== 1 ? "s" : ""} on tomorrow&apos;s calendar
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {floating.map((c) => (
              <FloatingItem
                key={c.id}
                capture={c}
                onDefer={handleDefer}
                onPlanToday={handlePlanToday}
                onDone={handleLetGo}
              />
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-4 flex-shrink-0 border-t border-[#f0ede7]">
          <button
            onClick={() => handleClose(true)}
            className="w-full py-2.5 bg-stone-800 text-white text-sm font-medium rounded-xl hover:bg-stone-700 transition-colors active:scale-[0.98]"
          >
            Done for today
          </button>
        </div>
      </div>

      <style>{`
        @keyframes drawerSlideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes drawerSlideDown {
          from { transform: translateY(0); }
          to { transform: translateY(100%); }
        }
        @keyframes backdropIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes backdropOut {
          from { opacity: 1; }
          to { opacity: 0; }
        }
      `}</style>
    </>
  );
}
