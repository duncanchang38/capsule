"use client";

import { useCaptures } from "@/hooks/useCaptures";
import type { Capture } from "@/lib/api";

const TYPE_CONFIG: Record<string, { label: string; doneLabel: string; doneStatus: string; color: string }> = {
  to_hit:   { label: "To Hit",   doneLabel: "Done",     doneStatus: "done",     color: "bg-orange-100 text-orange-700" },
  to_learn: { label: "To Learn", doneLabel: "Absorbed", doneStatus: "absorbed", color: "bg-blue-100 text-blue-700" },
  to_cook:  { label: "To Cook",  doneLabel: "",         doneStatus: "",         color: "bg-purple-100 text-purple-700" },
  to_know:  { label: "To Know",  doneLabel: "Answered", doneStatus: "answered", color: "bg-green-100 text-green-700" },
};

const TYPE_ORDER = ["to_hit", "to_learn", "to_cook", "to_know"];

function CaptureCard({ capture, onDone }: { capture: Capture; onDone: (id: number, status: string) => void }) {
  const config = TYPE_CONFIG[capture.capture_type];
  const isDone = capture.status !== "active";

  return (
    <div className={`flex items-start gap-3 p-3 rounded-xl border bg-white ${isDone ? "opacity-50" : ""}`}>
      {config?.doneStatus && (
        <button
          onClick={() => onDone(capture.id, isDone ? "active" : config.doneStatus)}
          className={`mt-0.5 w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
            isDone ? "bg-zinc-900 border-zinc-900" : "border-zinc-300 hover:border-zinc-500"
          }`}
        >
          {isDone && <span className="text-white text-xs">✓</span>}
        </button>
      )}
      {!config?.doneStatus && <div className="w-5 h-5 flex-shrink-0" />}
      <div className="flex-1 min-w-0">
        <p className={`text-sm text-zinc-900 ${isDone ? "line-through" : ""}`}>{capture.summary}</p>
        {capture.deadline && (
          <p className="text-xs text-zinc-400 mt-0.5">Due {capture.deadline}</p>
        )}
      </div>
      {config && (
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${config.color}`}>
          {config.label}
        </span>
      )}
    </div>
  );
}

function Section({ type, captures, onDone }: { type: string; captures: Capture[]; onDone: (id: number, status: string) => void }) {
  const config = TYPE_CONFIG[type];
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

export default function TodosPage() {
  const { captures, loading, markDone } = useCaptures();

  const todos = captures.filter((c) => c.capture_type !== "calendar" && c.capture_type !== "inbox");

  const byType: Record<string, Capture[]> = {};
  for (const c of todos) {
    if (!byType[c.capture_type]) byType[c.capture_type] = [];
    byType[c.capture_type].push(c);
  }

  if (loading) {
    return <div className="p-6 text-sm text-zinc-400 max-w-2xl mx-auto">Loading...</div>;
  }

  if (todos.length === 0) {
    return (
      <div className="p-6 text-center text-zinc-400 text-sm mt-16 max-w-2xl mx-auto">
        Nothing captured yet. Go to Capture to add something.
      </div>
    );
  }

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h1 className="text-base font-semibold text-zinc-900 mb-4">To-Dos</h1>
      {TYPE_ORDER.map((type) => (
        <Section key={type} type={type} captures={byType[type] ?? []} onDone={markDone} />
      ))}
    </div>
  );
}
