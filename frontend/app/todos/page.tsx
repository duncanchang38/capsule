"use client";

import { useState } from "react";
import Link from "next/link";
import { useCaptures } from "@/hooks/useCaptures";
import { useReviewStreak } from "@/hooks/useReviewStreak";
import { RetroDrawer } from "@/components/RetroDrawer";
import { TYPE_CONFIG } from "@/lib/typeConfig";
import { generateIdeaTasks, updateCaptureStage } from "@/lib/api";
import type { Capture } from "@/lib/api";

const TODAY = new Date().toISOString().slice(0, 10);
const TOMORROW = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
})();

function isDeferred(c: Capture): boolean {
  const dt = c.metadata?.deferred_to as string | undefined;
  return !!dt && dt > TODAY;
}

const COOK_STAGE_COLORS: Record<string, string> = {
  seed:       "text-stone-400 bg-stone-100",
  brewing:    "text-amber-600 bg-amber-50",
  developing: "text-blue-600 bg-blue-50",
  ready:      "text-green-600 bg-green-50",
  parked:     "text-stone-300 bg-stone-50",
};

function SkeletonCard() {
  return <div className="rounded-xl bg-stone-100 animate-pulse h-14" />;
}

function CookIdeaExpansion({ capture }: { capture: Capture }) {
  const [generating, setGenerating] = useState(false);
  const [taskCount, setTaskCount] = useState<number | null>(null);
  const threads = (capture.metadata?.threads as string[] | undefined) ?? [];
  const stage = (capture.metadata?.stage as string | undefined) ?? "seed";
  const stageClass = COOK_STAGE_COLORS[stage] ?? COOK_STAGE_COLORS.seed;

  const handleGenerateTasks = async () => {
    setGenerating(true);
    const count = await generateIdeaTasks(capture.id);
    setTaskCount(count);
    setGenerating(false);
    if (count > 0) await updateCaptureStage(capture.id, "developing");
  };

  return (
    <div className="mt-1.5 flex flex-col gap-1.5">
      {threads.length > 0 && (
        <ul className="flex flex-col gap-0.5 pl-2 border-l border-stone-100">
          {threads.slice(0, 3).map((t, i) => (
            <li key={i} className="text-[10px] text-stone-400 leading-snug">{t}</li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2">
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${stageClass}`}>{stage}</span>
        {taskCount !== null ? (
          <span className="text-[10px] text-green-600">{taskCount > 0 ? `${taskCount} tasks added` : "No tasks generated"}</span>
        ) : (
          <button
            onClick={handleGenerateTasks}
            disabled={generating}
            className="text-[10px] text-stone-400 hover:text-stone-700 transition-colors disabled:opacity-40"
          >
            {generating ? "Generating…" : "→ Tasks"}
          </button>
        )}
      </div>
    </div>
  );
}

function CaptureCard({
  capture,
  onDone,
  onDefer,
  onPlanToday,
  showPlanDefer,
}: {
  capture: Capture;
  onDone: (id: number, status: string) => void;
  onDefer?: (id: number) => void;
  onPlanToday?: (id: number) => void;
  showPlanDefer?: boolean;
}) {
  const config = TYPE_CONFIG[capture.capture_type as keyof typeof TYPE_CONFIG];
  const isDone = capture.status !== "active";
  const deferred = isDeferred(capture);

  return (
    <div className={`flex items-start gap-3 p-3 rounded-xl border border-[#e8e4db] bg-white transition-opacity ${isDone || deferred ? "opacity-50" : ""}`}>
      {config?.doneStatus ? (
        <span className="flex items-center justify-center min-w-[44px] min-h-[44px]">
          <button
            role="checkbox"
            aria-checked={isDone}
            onClick={() => onDone(capture.id, isDone ? "active" : config.doneStatus)}
            className={`w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
              isDone ? "bg-stone-800 border-stone-800" : "border-stone-300 hover:border-stone-500"
            }`}
          >
            {isDone && (
              <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                <path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </button>
        </span>
      ) : (
        <div className="min-w-[44px] min-h-[44px] flex-shrink-0" />
      )}

      <div className="flex-1 min-w-0 py-2.5">
        <p className={`text-sm text-stone-900 leading-snug ${isDone ? "line-through" : ""}`}>{capture.summary}</p>

        {capture.capture_type === "to_cook" && !isDone && (
          <CookIdeaExpansion capture={capture} />
        )}
        {capture.capture_type === "to_know" && (
          <p className={`text-xs mt-1 leading-relaxed ${
            capture.metadata?.answer ? "text-stone-500" : "text-stone-400 italic"
          }`}>
            {capture.metadata?.answer ? (capture.metadata.answer as string) : "Researching…"}
          </p>
        )}
        {!!capture.metadata?.url && (
          <a
            href={capture.metadata.url as string}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-500 hover:underline mt-0.5 block truncate"
          >
            {capture.metadata.url as string}
          </a>
        )}
        {!!capture.metadata?.source_title && (
          <p className="text-xs text-stone-400 mt-0.5">from {capture.metadata.source_title as string}</p>
        )}
        {capture.deadline && (
          <p className={`text-xs mt-0.5 ${capture.deadline < TODAY ? "text-red-400" : "text-stone-400"}`}>
            {capture.deadline < TODAY ? `Overdue · ${capture.deadline}` : `Due ${capture.deadline}`}
          </p>
        )}
        {deferred && (
          <p className="text-xs text-stone-300 mt-0.5">
            Deferred · {capture.metadata.deferred_to as string}
          </p>
        )}

        {showPlanDefer && !isDone && !deferred && (
          <div className="flex items-center gap-2 mt-1.5">
            {onPlanToday && (
              <button
                onClick={() => onPlanToday(capture.id)}
                className="text-[10px] text-stone-500 hover:text-stone-800 transition-colors font-medium"
              >
                Plan today
              </button>
            )}
            {onDefer && (
              <>
                <span className="text-stone-200">·</span>
                <button
                  onClick={() => onDefer(capture.id)}
                  className="text-[10px] text-stone-400 hover:text-stone-600 transition-colors"
                >
                  Defer
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {config && !isDone && (
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 mt-2.5 ${config.bgClass}`}>
          {config.label}
        </span>
      )}
    </div>
  );
}

function SectionHeader({
  label,
  count,
  accent,
}: {
  label: string;
  count: number;
  accent?: "red" | "amber" | "default";
}) {
  const colorClass =
    accent === "red" ? "text-red-400" :
    accent === "amber" ? "text-amber-500" :
    "text-stone-400";
  return (
    <h2 className={`text-xs font-semibold uppercase tracking-wider mb-2 px-1 ${colorClass}`}>
      {label} <span className="normal-case font-normal opacity-70">({count})</span>
    </h2>
  );
}

export default function TodosPage() {
  const { captures, loading, error, refresh, markDone, deferCapture, planToday } = useCaptures();
  const { streak, reviewedToday, markReviewDone } = useReviewStreak();
  const [showDrawer, setShowDrawer] = useState(false);

  // All non-calendar/inbox/query items
  const todos = captures.filter(
    (c) => !["calendar", "inbox", "query"].includes(c.capture_type)
  );

  // Temporal buckets
  const overdue = todos.filter(
    (c) => c.status === "active" && c.deadline && c.deadline < TODAY && !isDeferred(c)
  );
  const dueToday = todos.filter(
    (c) => c.status === "active" && c.deadline === TODAY && !isDeferred(c)
  );
  const scheduled = todos.filter(
    (c) => c.status === "active" && c.deadline && c.deadline > TODAY && !isDeferred(c)
  );
  const unplanned = todos.filter(
    (c) => c.status === "active" && !c.deadline && !isDeferred(c) && c.capture_type !== "to_cook"
  );
  const ideas = todos.filter(
    (c) => c.capture_type === "to_cook" && c.status === "active"
  );
  const deferred = todos.filter(
    (c) => c.status === "active" && isDeferred(c)
  );
  const done = todos.filter((c) => c.status !== "active");

  // Floating = items that need a decision (for RetroDrawer)
  const floating = [...overdue, ...unplanned];

  // Items scheduled for tomorrow (for RetroDrawer "all clear" context)
  const scheduledTomorrow = captures.filter(
    (c) => c.deadline === TOMORROW && c.status === "active"
  ).length;

  if (loading) {
    return (
      <div className="p-4 max-w-2xl mx-auto flex flex-col gap-2">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
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

  if (todos.length === 0) {
    return (
      <div className="p-6 text-center mt-16 max-w-2xl mx-auto">
        <p className="text-stone-500 text-sm">Nothing here yet.</p>
        <Link href="/" className="text-stone-400 text-sm hover:text-stone-600 mt-1 inline-block">
          Start capturing →
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="p-4 max-w-2xl mx-auto">
        {/* Page header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <h1 className="text-base font-semibold text-stone-900">To-Dos</h1>
            {streak > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 font-medium border border-amber-100">
                {streak} day{streak !== 1 ? "s" : ""} reviewed
              </span>
            )}
            {reviewedToday && (
              <span className="text-xs text-stone-300">reviewed today</span>
            )}
          </div>
          {floating.length > 0 && (
            <button
              onClick={() => setShowDrawer(true)}
              className="text-xs px-3 py-1.5 rounded-lg bg-stone-800 text-white font-medium hover:bg-stone-700 transition-colors active:scale-[0.96]"
            >
              Review day ({floating.length})
            </button>
          )}
          {floating.length === 0 && !reviewedToday && todos.length > 0 && (
            <button
              onClick={() => { markReviewDone(); }}
              className="text-xs px-3 py-1.5 rounded-lg border border-[#e8e4db] text-stone-500 font-medium hover:bg-stone-50 transition-colors active:scale-[0.96]"
            >
              Mark reviewed
            </button>
          )}
        </div>

        {/* Overdue */}
        {overdue.length > 0 && (
          <section className="mb-5">
            <SectionHeader label="Overdue" count={overdue.length} accent="red" />
            <div className="flex flex-col gap-2">
              {overdue.map((c) => (
                <CaptureCard
                  key={c.id}
                  capture={c}
                  onDone={markDone}
                  onDefer={deferCapture}
                  onPlanToday={planToday}
                  showPlanDefer
                />
              ))}
            </div>
          </section>
        )}

        {/* Due today */}
        {dueToday.length > 0 && (
          <section className="mb-5">
            <SectionHeader label="Today" count={dueToday.length} accent="amber" />
            <div className="flex flex-col gap-2">
              {dueToday.map((c) => (
                <CaptureCard key={c.id} capture={c} onDone={markDone} />
              ))}
            </div>
          </section>
        )}

        {/* Unplanned */}
        {unplanned.length > 0 && (
          <section className="mb-5">
            <SectionHeader label="Unplanned" count={unplanned.length} />
            <div className="flex flex-col gap-2">
              {unplanned.map((c) => (
                <CaptureCard
                  key={c.id}
                  capture={c}
                  onDone={markDone}
                  onDefer={deferCapture}
                  onPlanToday={planToday}
                  showPlanDefer
                />
              ))}
            </div>
          </section>
        )}

        {/* Ideas (to_cook — persistent) */}
        {ideas.length > 0 && (
          <section className="mb-5">
            <SectionHeader label="Ideas" count={ideas.length} />
            <div className="flex flex-col gap-2">
              {ideas.map((c) => (
                <CaptureCard key={c.id} capture={c} onDone={markDone} />
              ))}
            </div>
          </section>
        )}

        {/* Scheduled */}
        {scheduled.length > 0 && (
          <section className="mb-5">
            <SectionHeader label="Scheduled" count={scheduled.length} />
            <div className="flex flex-col gap-2">
              {scheduled.map((c) => (
                <CaptureCard key={c.id} capture={c} onDone={markDone} />
              ))}
            </div>
          </section>
        )}

        {/* Deferred */}
        {deferred.length > 0 && (
          <section className="mb-5">
            <SectionHeader label="Deferred" count={deferred.length} />
            <div className="flex flex-col gap-2">
              {deferred.map((c) => (
                <CaptureCard key={c.id} capture={c} onDone={markDone} />
              ))}
            </div>
          </section>
        )}

        {/* Done */}
        {done.length > 0 && (
          <section className="mb-5">
            <SectionHeader label="Done" count={done.length} />
            <div className="flex flex-col gap-2">
              {done.map((c) => (
                <CaptureCard key={c.id} capture={c} onDone={markDone} />
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Retro drawer */}
      {showDrawer && (
        <RetroDrawer
          floating={floating}
          scheduledTomorrow={scheduledTomorrow}
          onDefer={deferCapture}
          onPlanToday={planToday}
          onLetGo={markDone}
          onComplete={markReviewDone}
          onClose={() => setShowDrawer(false)}
        />
      )}
    </>
  );
}
