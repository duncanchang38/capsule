"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { TYPE_CONFIG } from "@/lib/typeConfig";
import { restoreCapture, updateCaptureStatus } from "@/lib/api";
import { useToast } from "@/hooks/useToast";
import type { Capture } from "@/lib/api";

function getLocalToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function TypeBadge({ type }: { type: string }) {
  const cfg = TYPE_CONFIG[type as keyof typeof TYPE_CONFIG];
  if (!cfg) return null;
  return (
    <span className={`text-[10px] px-1.5 py-px rounded font-medium flex-shrink-0 ${cfg.bgClass}`}>
      {cfg.label}
    </span>
  );
}

export interface CaptureRowHandlers {
  onPlanToday?: (id: number) => Promise<void>;
  onDefer?: (id: number) => Promise<void>;
  onDone?: (id: number, status: string) => Promise<void>;
  onDelete?: (id: number) => Promise<void>;
  // Inline circle-tap done — item stays visible, turns green
  onCheckDone?: (id: number, status: string) => Promise<void>;
  // Called after circle undo to sync parent state
  onRestoreActive?: (id: number) => Promise<void>;
}

export function CaptureListRow({
  capture,
  handlers,
  dimmed = false,
  meta,
  rightExtras,
  selecting = false,
  selected = false,
  onSelect,
  onPreview,
}: {
  capture: Capture;
  handlers?: CaptureRowHandlers;
  dimmed?: boolean;
  meta?: React.ReactNode;
  rightExtras?: React.ReactNode;
  selecting?: boolean;
  selected?: boolean;
  onSelect?: (id: number) => void;
  onPreview?: (capture: Capture) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [resolved, setResolved] = useState(false);
  const [checking, setChecking] = useState(false);
  const restoringRef = useRef(false);
  const { show: showToast } = useToast();

  const TODAY = getLocalToday();
  const deferredTo = capture.metadata?.deferred_to as string | undefined;
  const isItemDeferred = !!(deferredTo && deferredTo > TODAY);
  const isOverdue = !!(capture.deadline && capture.deadline < TODAY);
  const isPlannedToday = capture.deadline === TODAY && !isItemDeferred;
  const cfg = TYPE_CONFIG[capture.capture_type as keyof typeof TYPE_CONFIG];

  // Item is in a completed state (not active, not deleted)
  const isDone = capture.status !== "active" && capture.status !== "deleted";

  const hasActions = !!(
    handlers && (handlers.onPlanToday || handlers.onDefer || handlers.onDone || handlers.onDelete)
  );

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

  const handleCircleTap = async () => {
    if (checking) return;
    if (isDone) {
      // Restore to active
      setChecking(true);
      await updateCaptureStatus(capture.id, "active");
      await handlers?.onRestoreActive?.(capture.id);
      setChecking(false);
    } else {
      // Mark done
      const doneStatus = cfg?.doneStatus || "done";
      setChecking(true);
      await handlers?.onCheckDone?.(capture.id, doneStatus);
      setChecking(false);
    }
  };

  if (resolved) return null;

  // Left indicator: completion circle (when checkable) or colored dot
  const leftIndicator = handlers?.onCheckDone ? (
    <button
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleCircleTap(); }}
      className="flex-shrink-0 w-5 h-5 mt-[3px] rounded-full border-2 flex items-center justify-center transition-all active:scale-90"
      style={{
        borderColor: isDone ? "#22c55e" : "#d6d3d1",
        backgroundColor: isDone ? "#22c55e" : "transparent",
      }}
    >
      {isDone && (
        <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
          <path d="M1 3.5l2.5 2.5L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  ) : (
    <div
      className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-[7px]"
      style={{ backgroundColor: cfg?.color ?? "#a8a29e" }}
    />
  );

  // Apple-style circle checkbox for select mode (div — row button handles click)
  const checkbox = (
    <div
      className="flex-shrink-0 w-5 h-5 mt-[3px] rounded-full border-2 flex items-center justify-center transition-colors"
      style={{
        borderColor: selected ? (cfg?.color ?? "#44403c") : "#d6d3d1",
        backgroundColor: selected ? (cfg?.color ?? "#44403c") : "transparent",
      }}
    >
      {selected && (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  );

  const textBlock = (
    <div className="flex-1 min-w-0">
      <p className={`text-sm leading-snug transition-colors ${
        isDone && handlers?.onCheckDone ? "text-stone-400 line-through" : "text-stone-800"
      }`}>
        {capture.summary}
      </p>
      {meta}
      {(isOverdue || (dimmed && deferredTo)) && (
        <div className="flex items-center gap-1.5 mt-0.5">
          {isOverdue && <span className="text-[10px] text-red-400 font-medium">overdue</span>}
          {dimmed && deferredTo && <span className="text-[10px] text-stone-400">deferred · {deferredTo}</span>}
        </div>
      )}
    </div>
  );

  const rowBg = isDone && handlers?.onCheckDone
    ? "bg-green-50/60"
    : dimmed
    ? "opacity-40"
    : "";

  return (
    <div className={`border-b border-stone-50 last:border-0 ${rowBg}`}>
      <div className="flex items-center gap-2 py-2.5">
        {selecting ? (
          <button
            onClick={() => onSelect?.(capture.id)}
            className="flex items-start gap-3 flex-1 min-w-0 -mx-1 px-1 rounded-lg text-left"
          >
            {checkbox}
            {textBlock}
            {rightExtras}
            <TypeBadge type={capture.capture_type} />
          </button>
        ) : onPreview ? (
          // leftIndicator lives outside the row button to avoid nested <button> in HTML
          <>
            {leftIndicator}
            <button
              onClick={() => onPreview(capture)}
              className="flex items-start gap-3 flex-1 min-w-0 rounded-lg hover:bg-stone-50 transition-colors text-left"
            >
              {textBlock}
              {rightExtras}
              <TypeBadge type={capture.capture_type} />
            </button>
          </>
        ) : (
          <Link
            href={`/captures/${capture.id}`}
            className="flex items-start gap-3 flex-1 min-w-0 -mx-1 px-1 rounded-lg hover:bg-stone-50 transition-colors"
          >
            {leftIndicator}
            {textBlock}
            {rightExtras}
            <TypeBadge type={capture.capture_type} />
          </Link>
        )}

        {hasActions && !selecting && (
          <button
            onClick={() => setExpanded((e) => !e)}
            aria-label="Actions"
            className={`flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${
              expanded ? "bg-stone-100 text-stone-600" : "text-stone-300 hover:bg-stone-100 hover:text-stone-500"
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <circle cx="2.5" cy="7" r="1.2" />
              <circle cx="7" cy="7" r="1.2" />
              <circle cx="11.5" cy="7" r="1.2" />
            </svg>
          </button>
        )}
      </div>

      {expanded && !selecting && (
        <div className="flex gap-2 pb-3 pl-4 pr-1">
          {handlers?.onPlanToday && (
            <button
              onClick={() =>
                !isPlannedToday && fireAction("Scheduled for today", () => handlers.onPlanToday!(capture.id))
              }
              className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl transition-all active:scale-[0.97] ${
                isPlannedToday ? "bg-stone-800 text-white cursor-default" : "border border-stone-200 text-stone-600 hover:bg-stone-50"
              }`}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="2" y="3" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
                <path d="M5 2v2M11 2v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                <path d="M2 7h12" stroke="currentColor" strokeWidth="1.3" />
                <path d="M8 10v3M6.5 11.5h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
              <span className="text-[10px] font-semibold">{isPlannedToday ? "Planned" : "Do today"}</span>
            </button>
          )}
          {handlers?.onDefer && (
            <button
              onClick={() =>
                !isItemDeferred && fireAction("Deferred", () => handlers.onDefer!(capture.id))
              }
              className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl transition-all active:scale-[0.97] ${
                isItemDeferred ? "bg-stone-800 text-white cursor-default" : "border border-stone-200 text-stone-600 hover:bg-stone-50"
              }`}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.3" />
                <path d="M8 6v2.5l1.5 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M5.5 2.5l5 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
              <span className="text-[10px] font-semibold">{isItemDeferred ? "Deferred" : "Defer"}</span>
            </button>
          )}
          {handlers?.onDone && cfg?.doneStatus && (
            <button
              onClick={() => fireAction(cfg.doneLabel || "Done", () => handlers.onDone!(capture.id, cfg.doneStatus))}
              className="flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl border border-stone-200 text-stone-600 hover:bg-stone-50 active:scale-[0.97] transition-all"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" />
                <path d="M5 8l2.5 2.5L11 5.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="text-[10px] font-semibold">{cfg.doneLabel || "Done"}</span>
            </button>
          )}
          {handlers?.onDelete && (
            <button
              onClick={() => fireAction("Deleted", () => handlers.onDelete!(capture.id))}
              className="flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl border border-stone-200 text-stone-400 hover:text-red-500 hover:border-red-200 hover:bg-red-50 active:scale-[0.97] transition-all"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 5h10M6 5V3.5a.5.5 0 01.5-.5h3a.5.5 0 01.5.5V5M12.5 5l-.7 7.5a1 1 0 01-1 .9H5.2a1 1 0 01-1-.9L3.5 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="text-[10px] font-semibold">Delete</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
