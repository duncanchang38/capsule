"use client";

import { useState } from "react";
import Link from "next/link";
import { useCaptures } from "@/hooks/useCaptures";
import { TYPE_CONFIG } from "@/lib/typeConfig";
import { generateIdeaTasks, updateCaptureStage } from "@/lib/api";
import type { Capture } from "@/lib/api";

const COOK_STAGE_COLORS: Record<string, string> = {
  seed:       "text-zinc-400 bg-zinc-100",
  brewing:    "text-amber-600 bg-amber-50",
  developing: "text-blue-600 bg-blue-50",
  ready:      "text-green-600 bg-green-50",
  parked:     "text-zinc-300 bg-zinc-50",
};

const TYPE_ORDER = ["to_hit", "to_learn", "to_cook", "to_know"] as const;

function SkeletonCard() {
  return (
    <div className="rounded-xl bg-zinc-100 animate-pulse h-14" />
  );
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
        <ul className="flex flex-col gap-0.5 pl-2 border-l border-zinc-100">
          {threads.slice(0, 3).map((t, i) => (
            <li key={i} className="text-[10px] text-zinc-400 leading-snug">{t}</li>
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
            className="text-[10px] text-zinc-400 hover:text-zinc-700 transition-colors disabled:opacity-40"
          >
            {generating ? "Generating…" : "→ Tasks"}
          </button>
        )}
      </div>
    </div>
  );
}

function CaptureCard({ capture, onDone }: { capture: Capture; onDone: (id: number, status: string) => void }) {
  const config = TYPE_CONFIG[capture.capture_type as keyof typeof TYPE_CONFIG];
  const isDone = capture.status !== "active";

  return (
    <div className={`flex items-start gap-3 p-3 rounded-xl border bg-white ${isDone ? "opacity-50" : ""}`}>
      {config?.doneStatus ? (
        <span className="flex items-center justify-center min-w-[44px] min-h-[44px]">
          <button
            role="checkbox"
            aria-checked={isDone}
            onClick={() => onDone(capture.id, isDone ? "active" : config.doneStatus)}
            className={`w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
              isDone ? "bg-zinc-900 border-zinc-900" : "border-zinc-300 hover:border-zinc-500"
            }`}
          >
            {isDone && <span className="text-white text-xs">✓</span>}
          </button>
        </span>
      ) : (
        <div className="min-w-[44px] min-h-[44px] flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0 py-2.5">
        <p className={`text-sm text-zinc-900 ${isDone ? "line-through" : ""}`}>{capture.summary}</p>
        {capture.capture_type === "to_cook" && !isDone && (
          <CookIdeaExpansion capture={capture} />
        )}
        {capture.capture_type === "to_know" && (
          <p className={`text-xs mt-1 leading-relaxed ${
            capture.metadata?.answer
              ? "text-zinc-500"
              : "text-zinc-400 italic"
          }`}>
            {capture.metadata?.answer
              ? (capture.metadata.answer as string)
              : "Researching…"}
          </p>
        )}
        {capture.metadata?.url && (
          <a
            href={capture.metadata.url as string}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-500 hover:underline mt-0.5 block truncate"
          >
            {capture.metadata.url as string}
          </a>
        )}
        {capture.metadata?.source_title && (
          <p className="text-xs text-zinc-400 mt-0.5">from {capture.metadata.source_title as string}</p>
        )}
        {capture.metadata?.topic && capture.capture_type !== "to_know" && !capture.metadata?.source_title && (
          <p className="text-xs text-zinc-400 mt-0.5">{capture.metadata.topic as string}</p>
        )}
        {capture.deadline && (
          <p className="text-xs text-zinc-400 mt-0.5">Due {capture.deadline}</p>
        )}
      </div>
      {config && (
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 mt-2.5 ${config.bgClass}`}>
          {config.label}
        </span>
      )}
    </div>
  );
}

function Section({ type, captures, onDone }: { type: string; captures: Capture[]; onDone: (id: number, status: string) => void }) {
  const config = TYPE_CONFIG[type as keyof typeof TYPE_CONFIG];
  const active = captures.filter((c) => c.status === "active");
  const done = captures.filter((c) => c.status !== "active");

  if (captures.length === 0) return null;

  return (
    <section className="mb-6">
      <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2 px-1">
        {config?.label ?? type} <span className="normal-case font-normal">({active.length} active)</span>
      </h2>
      <div className="flex flex-col gap-2">
        {active.map((c) => <CaptureCard key={c.id} capture={c} onDone={onDone} />)}
        {done.map((c) => <CaptureCard key={c.id} capture={c} onDone={onDone} />)}
      </div>
    </section>
  );
}

const TODAY = new Date().toISOString().slice(0, 10);

export default function TodosPage() {
  const { captures, loading, error, refresh, markDone } = useCaptures();

  const todos = captures.filter(
    (c) => !["calendar", "inbox", "query"].includes(c.capture_type)
  );

  const overdue = todos.filter(
    (c) => c.status === "active" && c.deadline && c.deadline < TODAY
  );

  const overdueIds = new Set(overdue.map((c) => c.id));

  const byType: Record<string, Capture[]> = {};
  for (const c of todos) {
    if (overdueIds.has(c.id)) continue; // shown in Overdue section
    if (!byType[c.capture_type]) byType[c.capture_type] = [];
    byType[c.capture_type].push(c);
  }

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
        <p
          className="text-zinc-500 text-sm cursor-pointer hover:text-zinc-700"
          onClick={refresh}
        >
          Couldn&apos;t load. Tap to retry.
        </p>
      </div>
    );
  }

  if (todos.length === 0) {
    return (
      <div className="p-6 text-center mt-16 max-w-2xl mx-auto">
        <p className="text-zinc-500 text-sm">Nothing here yet.</p>
        <Link href="/" className="text-zinc-400 text-sm hover:text-zinc-600 mt-1 inline-block">
          Start capturing →
        </Link>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h1 className="text-base font-semibold text-zinc-900 mb-4">To-Dos</h1>

      {overdue.length > 0 && (
        <section className="mb-6">
          <h2 className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-2 px-1">
            Overdue <span className="normal-case font-normal">({overdue.length})</span>
          </h2>
          <div className="flex flex-col gap-2">
            {overdue.map((c) => <CaptureCard key={c.id} capture={c} onDone={markDone} />)}
          </div>
        </section>
      )}

      {TYPE_ORDER.map((type) => (
        <Section key={type} type={type} captures={byType[type] ?? []} onDone={markDone} />
      ))}
    </div>
  );
}
