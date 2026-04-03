"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useCaptures } from "@/hooks/useCaptures";
import { updateCaptureStage, generateIdeaTasks } from "@/lib/api";
import type { Capture } from "@/lib/api";

const STAGE_ORDER = ["seed", "brewing", "developing", "ready", "parked"] as const;
type Stage = typeof STAGE_ORDER[number];

const STAGE_CONFIG: Record<Stage, { label: string; color: string; bg: string; dot: string }> = {
  seed:       { label: "Seed",       color: "text-zinc-500",  bg: "bg-zinc-100",   dot: "bg-zinc-400" },
  brewing:    { label: "Brewing",    color: "text-amber-600", bg: "bg-amber-50",   dot: "bg-amber-400" },
  developing: { label: "Developing", color: "text-blue-600",  bg: "bg-blue-50",    dot: "bg-blue-400" },
  ready:      { label: "Ready",      color: "text-green-600", bg: "bg-green-50",   dot: "bg-green-400" },
  parked:     { label: "Parked",     color: "text-zinc-400",  bg: "bg-zinc-50",    dot: "bg-zinc-300" },
};

const NEXT_STAGE: Record<Stage, Stage> = {
  seed:       "brewing",
  brewing:    "developing",
  developing: "ready",
  ready:      "seed",
  parked:     "seed",
};

function StagePill({
  stage,
  onClick,
}: {
  stage: Stage;
  onClick: () => void;
}) {
  const cfg = STAGE_CONFIG[stage];
  return (
    <button
      onClick={onClick}
      title="Click to advance stage"
      className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${cfg.bg} ${cfg.color} transition-opacity hover:opacity-70`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </button>
  );
}

function IdeaCard({
  capture,
  onStageChange,
}: {
  capture: Capture;
  onStageChange: (id: number, stage: Stage) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [taskCount, setTaskCount] = useState<number | null>(null);

  const threads = (capture.metadata?.threads as string[] | undefined) ?? [];
  const domain = capture.metadata?.domain as string | undefined;
  const stage = (capture.metadata?.stage as Stage | undefined) ?? "seed";

  const handleAdvanceStage = () => {
    const next = stage === "parked" ? "seed" : NEXT_STAGE[stage];
    onStageChange(capture.id, next);
  };

  const handlePark = () => {
    onStageChange(capture.id, "parked");
  };

  const handleGenerateTasks = async () => {
    setGenerating(true);
    const count = await generateIdeaTasks(capture.id);
    setTaskCount(count);
    setGenerating(false);
    if (count > 0) {
      onStageChange(capture.id, "developing");
    }
  };

  return (
    <div className={`bg-white border rounded-xl p-4 flex flex-col gap-2 ${stage === "parked" ? "opacity-50" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-zinc-900 leading-snug flex-1">{capture.summary}</p>
        <StagePill stage={stage} onClick={handleAdvanceStage} />
      </div>

      {domain && (
        <p className="text-[10px] text-zinc-400 -mt-1">{domain}</p>
      )}

      {threads.length > 0 && (
        <div>
          <button
            onClick={() => setExpanded(v => !v)}
            className="text-[10px] text-zinc-400 hover:text-zinc-600 flex items-center gap-1"
          >
            <svg
              width="8" height="8" viewBox="0 0 8 8" fill="none"
              className={`transition-transform ${expanded ? "rotate-90" : ""}`}
            >
              <path d="M2 1L6 4L2 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            {threads.length} development thread{threads.length !== 1 ? "s" : ""}
          </button>
          {expanded && (
            <ul className="mt-1.5 flex flex-col gap-1 pl-3 border-l border-zinc-100">
              {threads.map((t, i) => (
                <li key={i} className="text-xs text-zinc-500 leading-snug">{t}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 mt-1">
        {taskCount !== null ? (
          <span className="text-[10px] text-green-600 font-medium">
            {taskCount > 0 ? `${taskCount} tasks added to To-Dos` : "Couldn't generate tasks"}
          </span>
        ) : (
          <button
            onClick={handleGenerateTasks}
            disabled={generating}
            className="text-[10px] text-zinc-400 hover:text-zinc-700 transition-colors disabled:opacity-40"
          >
            {generating ? "Generating…" : "→ Turn into tasks"}
          </button>
        )}

        {stage !== "parked" && (
          <button
            onClick={handlePark}
            className="text-[10px] text-zinc-300 hover:text-zinc-500 transition-colors ml-auto"
          >
            Park
          </button>
        )}
      </div>
    </div>
  );
}

function StageSection({
  stage,
  captures,
  onStageChange,
}: {
  stage: Stage;
  captures: Capture[];
  onStageChange: (id: number, stage: Stage) => void;
}) {
  if (captures.length === 0) return null;
  const cfg = STAGE_CONFIG[stage];
  return (
    <section className="mb-6">
      <h2 className={`text-xs font-semibold uppercase tracking-wider mb-2 px-1 flex items-center gap-2 ${cfg.color}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
        {cfg.label}
        <span className="normal-case font-normal text-zinc-400">({captures.length})</span>
      </h2>
      <div className="flex flex-col gap-2">
        {captures.map(c => (
          <IdeaCard key={c.id} capture={c} onStageChange={onStageChange} />
        ))}
      </div>
    </section>
  );
}

export default function IdeasPage() {
  const { captures, loading, error, refresh } = useCaptures();
  const [localStages, setLocalStages] = useState<Record<number, Stage>>({});

  const ideas = captures.filter(c => c.capture_type === "to_cook");

  const getStage = (c: Capture): Stage => {
    return localStages[c.id] ?? ((c.metadata?.stage as Stage | undefined) ?? "seed");
  };

  const handleStageChange = useCallback(async (id: number, stage: Stage) => {
    setLocalStages(prev => ({ ...prev, [id]: stage }));
    await updateCaptureStage(id, stage);
  }, []);

  const byStage: Record<Stage, Capture[]> = {
    seed: [], brewing: [], developing: [], ready: [], parked: [],
  };
  for (const c of ideas) {
    const s = getStage(c);
    byStage[s].push(c);
  }

  if (loading) {
    return (
      <div className="p-4 max-w-2xl mx-auto flex flex-col gap-2">
        {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-xl bg-zinc-100 animate-pulse" />)}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center mt-16 max-w-2xl mx-auto">
        <p className="text-zinc-500 text-sm cursor-pointer hover:text-zinc-700" onClick={refresh}>
          Couldn&apos;t load. Tap to retry.
        </p>
      </div>
    );
  }

  if (ideas.length === 0) {
    return (
      <div className="p-6 text-center mt-16 max-w-2xl mx-auto">
        <p className="text-zinc-500 text-sm">No ideas yet.</p>
        <Link href="/" className="text-zinc-400 text-sm hover:text-zinc-600 mt-1 inline-block">
          Start capturing →
        </Link>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h1 className="text-base font-semibold text-zinc-900 mb-4">Ideas</h1>
      {STAGE_ORDER.filter(s => s !== "parked").map(stage => (
        <StageSection key={stage} stage={stage} captures={byStage[stage]} onStageChange={handleStageChange} />
      ))}
      {byStage.parked.length > 0 && (
        <StageSection stage="parked" captures={byStage.parked} onStageChange={handleStageChange} />
      )}
    </div>
  );
}
