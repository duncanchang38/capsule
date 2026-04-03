"use client";

import Link from "next/link";
import { useCaptures } from "@/hooks/useCaptures";
import { TYPE_CONFIG } from "@/lib/typeConfig";
import type { Capture } from "@/lib/api";

function CaptureRow({ capture }: { capture: Capture }) {
  const cfg = TYPE_CONFIG[capture.capture_type as keyof typeof TYPE_CONFIG];
  const stage = capture.metadata?.stage as string | undefined;

  return (
    <Link
      href={`/captures/${capture.id}`}
      className="flex items-start gap-3 py-2.5 border-b border-stone-50 last:border-0 hover:bg-stone-50 rounded-lg px-2 -mx-2 transition-colors"
    >
      <div
        className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5"
        style={{ backgroundColor: cfg?.color ?? "#a8a29e" }}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-stone-800 leading-snug">{capture.summary}</p>
        {typeof capture.metadata?.author === "string" && (
          <p className="text-[10px] text-stone-400 mt-0.5">{capture.metadata.author}</p>
        )}
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {stage && (
          <span className="text-[10px] text-stone-300 capitalize">{stage}</span>
        )}
        {capture.notes && (
          <span className="text-[10px] text-stone-300" title="Has notes">✦</span>
        )}
      </div>
    </Link>
  );
}

function Section({
  id,
  label,
  captures,
  emptyText,
}: {
  id: string;
  label: string;
  captures: Capture[];
  emptyText: string;
}) {
  return (
    <section id={id} className="mb-8">
      <h2 className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-3">
        {label}
        <span className="normal-case font-normal ml-1 opacity-70">({captures.length})</span>
      </h2>
      {captures.length === 0 ? (
        <p className="text-sm text-stone-400 py-2">{emptyText}</p>
      ) : (
        <div className="bg-white border border-[#e8e4db] rounded-xl px-4 py-1">
          {captures.map((c) => <CaptureRow key={c.id} capture={c} />)}
        </div>
      )}
    </section>
  );
}

export default function LibraryPage() {
  const { captures, loading, error, refresh } = useCaptures();

  const ideas = captures.filter((c) => c.capture_type === "to_cook");
  const reading = captures.filter((c) => c.capture_type === "to_learn");
  const organize = captures.filter(
    (c) => !["inbox", "query", "calendar"].includes(c.capture_type) && c.status !== "active"
  );

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

  return (
    <div className="max-w-2xl mx-auto p-4 pt-6">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-base font-semibold text-stone-900">Library</h1>
        <div className="flex items-center gap-3 text-[10px] text-stone-400">
          <a href="#ideas" className="hover:text-stone-600 transition-colors">Ideas</a>
          <a href="#reading" className="hover:text-stone-600 transition-colors">Reading</a>
          <a href="#archive" className="hover:text-stone-600 transition-colors">Archive</a>
        </div>
      </div>

      <Section
        id="ideas"
        label="Ideas"
        captures={ideas}
        emptyText="No ideas yet."
      />
      <Section
        id="reading"
        label="Reading"
        captures={reading}
        emptyText="No reading yet."
      />
      <Section
        id="archive"
        label="Archive"
        captures={organize}
        emptyText="Nothing archived yet."
      />
    </div>
  );
}
