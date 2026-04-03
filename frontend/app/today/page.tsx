"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useCaptures } from "@/hooks/useCaptures";
import { useReviewStreak } from "@/hooks/useReviewStreak";
import { TYPE_CONFIG } from "@/lib/typeConfig";
import type { Capture } from "@/lib/api";

function getLocalToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isDeferred(c: Capture): boolean {
  const dt = c.metadata?.deferred_to as string | undefined;
  return !!dt && dt > getLocalToday();
}

function TypeBadge({ type }: { type: string }) {
  const cfg = TYPE_CONFIG[type as keyof typeof TYPE_CONFIG];
  if (!cfg) return null;
  return (
    <span className={`text-[10px] px-1.5 py-px rounded font-medium flex-shrink-0 ${cfg.bgClass}`}>
      {cfg.label}
    </span>
  );
}

function FloatingItemRow({
  capture,
  onPlanToday,
  onDefer,
  onLetGo,
}: {
  capture: Capture;
  onPlanToday: (id: number) => Promise<void>;
  onDefer: (id: number) => Promise<void>;
  onLetGo: (id: number, status: string) => Promise<void>;
}) {
  const [processing, setProcessing] = useState(false);
  const [resolved, setResolved] = useState(false);
  const TODAY = getLocalToday();
  const isOverdue = capture.deadline && capture.deadline < TODAY;
  const cfg = TYPE_CONFIG[capture.capture_type as keyof typeof TYPE_CONFIG];

  const run = async (fn: () => Promise<void>) => {
    setProcessing(true);
    await fn();
    setResolved(true);
    setProcessing(false);
  };

  if (resolved) return null;

  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-stone-50 last:border-0">
      <div
        className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5"
        style={{ backgroundColor: cfg?.color ?? "#a8a29e" }}
      />
      <div className="flex-1 min-w-0">
        <Link href={`/captures/${capture.id}`} className="text-sm text-stone-800 leading-snug hover:text-stone-600 transition-colors">
          {capture.summary}
        </Link>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          {isOverdue && <span className="text-[10px] text-red-400 font-medium">overdue</span>}
          <TypeBadge type={capture.capture_type} />
        </div>
        {!processing && (
          <div className="flex items-center gap-2 mt-1.5">
            <button
              onClick={() => run(() => onPlanToday(capture.id))}
              className="text-[10px] px-2 py-0.5 rounded bg-stone-800 text-white font-medium hover:bg-stone-700 transition-colors"
            >
              Plan today
            </button>
            <button
              onClick={() => run(() => onDefer(capture.id))}
              className="text-[10px] text-stone-400 hover:text-stone-600 transition-colors"
            >
              Defer
            </button>
            {cfg?.doneStatus && (
              <button
                onClick={() => run(() => onLetGo(capture.id, cfg.doneStatus))}
                className="text-[10px] text-stone-300 hover:text-stone-500 transition-colors"
              >
                Let go
              </button>
            )}
          </div>
        )}
        {processing && <p className="text-[10px] text-stone-400 mt-1 italic">Saving…</p>}
      </div>
    </div>
  );
}

function TodayItemRow({ capture }: { capture: Capture }) {
  const cfg = TYPE_CONFIG[capture.capture_type as keyof typeof TYPE_CONFIG];
  const time = capture.metadata?.time as string | undefined;
  const isCalendar = capture.capture_type === "calendar";

  return (
    <Link
      href={`/captures/${capture.id}`}
      className="flex items-start gap-3 py-2 hover:bg-stone-50 rounded-lg px-1 -mx-1 transition-colors"
    >
      {isCalendar ? (
        <div className="w-12 flex-shrink-0 text-right">
          <span className="text-[10px] text-stone-400 font-medium">{time ?? "—"}</span>
        </div>
      ) : (
        <div
          className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5 ml-1"
          style={{ backgroundColor: cfg?.color ?? "#a8a29e" }}
        />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-stone-800 leading-snug">{capture.summary}</p>
      </div>
      {isCalendar ? (
        <span className="text-[10px] px-1.5 py-px rounded bg-blue-50 text-blue-600 font-medium flex-shrink-0">Event</span>
      ) : (
        <span className="text-[10px] text-stone-300 flex-shrink-0">planned</span>
      )}
    </Link>
  );
}

function CapturedRow({ capture }: { capture: Capture }) {
  const cfg = TYPE_CONFIG[capture.capture_type as keyof typeof TYPE_CONFIG];
  const time = capture.created_at?.slice(11, 16);

  return (
    <Link
      href={`/captures/${capture.id}`}
      className="flex items-start gap-3 py-2 hover:bg-stone-50 rounded-lg px-1 -mx-1 transition-colors"
    >
      <div
        className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5"
        style={{ backgroundColor: cfg?.color ?? "#a8a29e" }}
      />
      <p className="flex-1 text-sm text-stone-800 leading-snug min-w-0">{capture.summary}</p>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {cfg && <TypeBadge type={capture.capture_type} />}
        {time && <span className="text-[10px] text-stone-300">{time}</span>}
      </div>
    </Link>
  );
}

function SectionHeader({ label, count }: { label: string; count?: number }) {
  return (
    <h2 className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-2">
      {label}
      {count !== undefined && (
        <span className="normal-case font-normal ml-1 opacity-70">({count})</span>
      )}
    </h2>
  );
}

export default function TodayPage() {
  const { captures, loading, error, refresh, markDone, deferCapture, planToday } = useCaptures();
  const { streak, reviewedToday, markReviewDone } = useReviewStreak();
  const [mode, setMode] = useState<"morning" | "evening" | null>(null);
  const [manualOverride, setManualOverride] = useState(false);

  useEffect(() => {
    const h = new Date().getHours();
    setMode(h < 17 ? "morning" : "evening");
  }, []);

  const TODAY = getLocalToday();

  const calendarToday = captures
    .filter((c) => c.capture_type === "calendar" && c.deadline === TODAY && c.status === "active")
    .sort((a, b) => {
      const ta = (a.metadata?.time as string) ?? "99:99";
      const tb = (b.metadata?.time as string) ?? "99:99";
      return ta.localeCompare(tb);
    });

  const plannedToday = captures.filter(
    (c) =>
      !["calendar", "inbox", "query"].includes(c.capture_type) &&
      c.deadline === TODAY &&
      c.status === "active"
  );

  const carryIn = captures
    .filter(
      (c) =>
        !["calendar", "inbox", "query"].includes(c.capture_type) &&
        c.status === "active" &&
        c.deadline !== TODAY &&
        (c.deadline === null || c.deadline < TODAY) &&
        !isDeferred(c)
    )
    .sort((a, b) => {
      const aOver = a.deadline && a.deadline < TODAY ? 0 : 1;
      const bOver = b.deadline && b.deadline < TODAY ? 0 : 1;
      return aOver - bOver;
    })
    .slice(0, 5);

  const capturedToday = captures
    .filter(
      (c) =>
        !["inbox", "query"].includes(c.capture_type) &&
        c.created_at?.slice(0, 10) === TODAY
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  const doneToday = captures.filter(
    (c) =>
      !["calendar", "inbox", "query"].includes(c.capture_type) &&
      c.status !== "active" &&
      c.updated_at?.slice(0, 10) === TODAY
  ).length;

  const deferredToday = captures.filter(
    (c) =>
      (c.metadata?.deferred_to as string | undefined) &&
      (c.metadata.deferred_to as string) > TODAY &&
      c.updated_at?.slice(0, 10) === TODAY
  ).length;

  if (loading) {
    return (
      <div className="p-4 max-w-2xl mx-auto flex flex-col gap-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-14 rounded-xl bg-stone-100 animate-pulse" />
        ))}
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

  // Render skeleton while mode not yet hydrated
  if (mode === null) {
    return <div className="p-4 max-w-2xl mx-auto" />;
  }

  return (
    <div className="max-w-2xl mx-auto p-4 pt-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <h1 className="text-base font-semibold text-stone-900">Today</h1>
          {streak > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 font-medium border border-amber-100">
              {streak} day streak
            </span>
          )}
        </div>
        {/* Mode toggle */}
        <div className="flex items-center gap-1 bg-stone-100 rounded-lg p-0.5">
          {(["morning", "evening"] as const).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setManualOverride(true); }}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors capitalize ${
                mode === m ? "bg-white text-stone-900 shadow-sm" : "text-stone-400 hover:text-stone-600"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {manualOverride && (
        <p className="text-[10px] text-stone-300 mb-4 -mt-3">
          Manual override — auto-switches at {mode === "morning" ? "5pm" : "midnight"}
        </p>
      )}

      {mode === "morning" && (
        <>
          {/* Today section */}
          <section className="mb-6">
            <SectionHeader label="Today" />
            {calendarToday.length === 0 && plannedToday.length === 0 ? (
              <p className="text-sm text-stone-400 py-2">Nothing scheduled for today</p>
            ) : (
              <div>
                {calendarToday.map((c) => <TodayItemRow key={c.id} capture={c} />)}
                {plannedToday.map((c) => <TodayItemRow key={c.id} capture={c} />)}
              </div>
            )}
          </section>

          {/* Carry in */}
          <section className="mb-6">
            <SectionHeader label="Carry in" count={carryIn.length} />
            {carryIn.length === 0 ? (
              <p className="text-sm text-stone-400 py-2">All clear — nothing floating</p>
            ) : (
              <div className="bg-white border border-[#e8e4db] rounded-xl px-4 py-1">
                {carryIn.map((c) => (
                  <FloatingItemRow
                    key={c.id}
                    capture={c}
                    onPlanToday={planToday}
                    onDefer={deferCapture}
                    onLetGo={markDone}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {mode === "evening" && (
        <>
          {/* Captured today */}
          <section className="mb-6">
            <SectionHeader label="Captured today" count={capturedToday.length} />
            {capturedToday.length === 0 ? (
              <p className="text-sm text-stone-400 py-2">Nothing captured yet today</p>
            ) : (
              <div className="bg-white border border-[#e8e4db] rounded-xl px-4 py-1">
                {capturedToday.map((c) => <CapturedRow key={c.id} capture={c} />)}
              </div>
            )}
          </section>

          {/* Still floating */}
          <section className="mb-6">
            <SectionHeader label="Still floating" count={carryIn.length} />
            {carryIn.length === 0 ? (
              <p className="text-sm text-stone-400 py-2">Nothing floating — great day</p>
            ) : (
              <div className="bg-white border border-[#e8e4db] rounded-xl px-4 py-1">
                {carryIn.map((c) => (
                  <FloatingItemRow
                    key={c.id}
                    capture={c}
                    onPlanToday={planToday}
                    onDefer={deferCapture}
                    onLetGo={markDone}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Stats + Done for today */}
          <div className="mt-2 flex items-center justify-between">
            <p className="text-[11px] text-stone-400">
              <span className="font-semibold text-stone-600">{capturedToday.length}</span> captured
              {doneToday > 0 && (
                <> · <span className="font-semibold text-stone-600">{doneToday}</span> done</>
              )}
              {deferredToday > 0 && (
                <> · <span className="font-semibold text-stone-300">{deferredToday}</span> deferred</>
              )}
            </p>
          </div>

          <div className="mt-4">
            {reviewedToday ? (
              <p className="text-[11px] text-stone-300 text-center">✓ reviewed today</p>
            ) : (
              <button
                onClick={markReviewDone}
                className="w-full py-2.5 bg-stone-800 text-white text-sm font-medium rounded-xl hover:bg-stone-700 transition-colors active:scale-[0.98]"
              >
                Done for today
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
