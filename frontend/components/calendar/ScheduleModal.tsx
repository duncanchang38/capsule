"use client";

import { useState, useEffect, useRef } from "react";
import type { Capture } from "@/lib/api";
import { scheduleCapture, createSprints, sprintPreview } from "@/lib/api";
import { TYPE_CONFIG } from "@/lib/typeConfig";

// ── Types ────────────────────────────────────────────────────────────────

interface ScheduleModalProps {
  capture: Capture;
  prefillDate?: string;  // ISO date from drag position
  prefillTime?: string;  // HH:MM from drag position
  onClose: () => void;
  onScheduled: () => void;
}

const DURATION_OPTIONS = [
  { label: "30m",  mins: 30 },
  { label: "45m",  mins: 45 },
  { label: "1h",   mins: 60 },
  { label: "1.5h", mins: 90 },
  { label: "2h",   mins: 120 },
  { label: "3h",   mins: 180 },
];

function tomorrowISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function pluralSessions(n: number) {
  return n === 1 ? "1 session" : `${n} sessions`;
}

// ── Sprint names list ─────────────────────────────────────────────────────

function SprintNamesList({
  names,
  loading,
}: {
  names: string[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex gap-1 items-center py-2 px-3">
        {[0, 150, 300].map((d) => (
          <span
            key={d}
            className="w-1.5 h-1.5 rounded-full bg-stone-300 animate-bounce"
            style={{ animationDelay: `${d}ms`, animationDuration: "1s" }}
          />
        ))}
        <span className="text-xs text-stone-400 ml-1">Generating session names…</span>
      </div>
    );
  }

  return (
    <ol className="flex flex-col gap-1.5 py-1">
      {names.map((name, i) => (
        <li
          key={i}
          className="flex items-start gap-2 text-xs text-stone-600 leading-snug"
          style={{
            animation: `fadeSlideIn 200ms cubic-bezier(0.23,1,0.32,1) ${i * 50}ms both`,
          }}
        >
          <span className="flex-shrink-0 w-4 h-4 rounded-full bg-stone-100 text-stone-400 text-[9px] flex items-center justify-center font-semibold mt-0.5">
            {i + 1}
          </span>
          <span>{name}</span>
        </li>
      ))}
    </ol>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────

export function ScheduleModal({
  capture,
  prefillDate,
  prefillTime,
  onClose,
  onScheduled,
}: ScheduleModalProps) {
  const [durationMins, setDurationMins] = useState(60);
  const [splitting, setSplitting] = useState(false);
  const [sessionCount, setSessionCount] = useState(3);
  const [sprintNames, setSprintNames] = useState<string[]>([]);
  const [sprintNamesLoading, setSprintNamesLoading] = useState(false);
  const [startDate, setStartDate] = useState(prefillDate ?? tomorrowISO());
  const [startTime, setStartTime] = useState(prefillTime ?? "09:00");
  const [submitting, setSubmitting] = useState(false);
  const previewFetched = useRef<string>("");

  const cfg = TYPE_CONFIG[capture.capture_type as keyof typeof TYPE_CONFIG];

  // Fetch preview names when session count or splitting changes
  useEffect(() => {
    if (!splitting) return;
    const key = `${capture.id}-${sessionCount}`;
    if (previewFetched.current === key) return;
    previewFetched.current = key;

    setSprintNamesLoading(true);
    setSprintNames([]);
    sprintPreview(capture.id, sessionCount).then((names) => {
      setSprintNames(names);
      setSprintNamesLoading(false);
    });
  }, [splitting, sessionCount, capture.id]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      if (!splitting) {
        await scheduleCapture(capture.id, startDate, startTime, durationMins);
      } else {
        await createSprints(capture.id, sessionCount, durationMins, startDate, startTime);
      }
      onScheduled();
      onClose();
    } catch {
      setSubmitting(false);
    }
  };

  const adjustSessions = (delta: number) => {
    setSessionCount((n) => Math.max(2, Math.min(8, n + delta)));
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/10 backdrop-blur-[2px]"
        style={{ animation: "backdropIn 150ms ease-out both" }}
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-white rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.12)] border border-[#e8e4db] overflow-hidden"
        style={{ animation: "scheduleModalIn 180ms cubic-bezier(0.23,1,0.32,1) both" }}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3">
          <div className="flex items-start justify-between gap-3 mb-1">
            <div>
              {cfg && (
                <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${cfg.bgClass} inline-block mb-1.5`}>
                  {cfg.label}
                </span>
              )}
              <p className="text-sm font-semibold text-stone-900 leading-snug">
                {capture.summary}
              </p>
            </div>
            <button
              onClick={onClose}
              className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-stone-300 hover:text-stone-500 hover:bg-stone-100 transition-colors mt-0.5 active:scale-90"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </div>

        <div className="h-px bg-[#f0ede7] mx-5" />

        <div className="px-5 py-4 flex flex-col gap-4">

          {/* Duration */}
          <div>
            <label className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider mb-2 block">
              Duration
            </label>
            <div className="flex flex-wrap gap-1.5">
              {DURATION_OPTIONS.map(({ label, mins }) => (
                <button
                  key={mins}
                  onClick={() => setDurationMins(mins)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-all duration-100 active:scale-[0.94] ${
                    durationMins === mins
                      ? "bg-stone-800 text-white"
                      : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Split sessions toggle */}
          <div>
            <button
              onClick={() => setSplitting((v) => !v)}
              className="flex items-center gap-2 group"
            >
              <div
                className={`w-8 h-4.5 rounded-full relative transition-colors duration-150 ${
                  splitting ? "bg-stone-800" : "bg-stone-200"
                }`}
                style={{ height: "18px" }}
              >
                <div
                  className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-transform duration-150 ${
                    splitting ? "translate-x-[17px]" : "translate-x-0.5"
                  }`}
                />
              </div>
              <span className="text-xs font-medium text-stone-600 group-hover:text-stone-800 transition-colors">
                Break into sessions
              </span>
            </button>

            {splitting && (
              <div className="mt-3 pl-0">
                {/* Session count stepper */}
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-xs text-stone-500">Sessions</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => adjustSessions(-1)}
                      disabled={sessionCount <= 2}
                      className="w-6 h-6 rounded-full bg-stone-100 flex items-center justify-center text-stone-500 disabled:opacity-30 hover:bg-stone-200 transition-colors active:scale-90"
                    >
                      <svg width="8" height="2" viewBox="0 0 8 2" fill="none">
                        <path d="M1 1H7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    </button>
                    <span className="text-sm font-semibold text-stone-800 w-4 text-center">{sessionCount}</span>
                    <button
                      onClick={() => adjustSessions(1)}
                      disabled={sessionCount >= 8}
                      className="w-6 h-6 rounded-full bg-stone-100 flex items-center justify-center text-stone-500 disabled:opacity-30 hover:bg-stone-200 transition-colors active:scale-90"
                    >
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                        <path d="M4 1V7M1 4H7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    </button>
                  </div>
                  <span className="text-xs text-stone-400">× {durationMins}m each</span>
                </div>

                <SprintNamesList names={sprintNames} loading={sprintNamesLoading} />
              </div>
            )}
          </div>

          {/* Date + Time */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider mb-1.5 block">
                {splitting ? "Starting" : "Date"}
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full text-xs text-stone-700 bg-stone-50 border border-[#e8e4db] rounded-lg px-3 py-2 focus:outline-none focus:border-stone-400 transition-colors"
              />
            </div>
            <div className="flex-1">
              <label className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider mb-1.5 block">
                Time
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full text-xs text-stone-700 bg-stone-50 border border-[#e8e4db] rounded-lg px-3 py-2 focus:outline-none focus:border-stone-400 transition-colors"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pb-5">
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full py-2.5 bg-stone-800 text-white text-sm font-medium rounded-xl hover:bg-stone-700 transition-colors disabled:opacity-50 active:scale-[0.98]"
          >
            {submitting
              ? "Scheduling…"
              : splitting
              ? `Block ${pluralSessions(sessionCount)} on calendar`
              : "Block on calendar"}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes scheduleModalIn {
          from { opacity: 0; transform: translate(-50%, -48%) scale(0.96); }
          to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  );
}
