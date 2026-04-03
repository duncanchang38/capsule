"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import type { Capture } from "@/lib/api";

const RESOURCE_ORDER = ["book", "article", "video", "course", "quote", "other"] as const;
const RESOURCE_LABELS: Record<string, string> = {
  book: "Books",
  article: "Articles",
  video: "Videos",
  course: "Courses",
  quote: "Quotes",
  other: "Other",
};

async function fetchReadingList(): Promise<Capture[]> {
  const res = await fetch("/api/captures?capture_type=to_learn");
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
}

async function markAbsorbed(id: number): Promise<void> {
  await fetch(`/api/captures/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "absorbed" }),
  });
}

function ResourceIcon({ type }: { type: string }) {
  const icons: Record<string, string> = {
    book: "📖", article: "📄", video: "▶️", course: "🎓", quote: "❝", other: "🔗",
  };
  return <span className="text-sm">{icons[type] ?? icons.other}</span>;
}

function ReadingCard({ capture, onAbsorbed }: { capture: Capture; onAbsorbed: (id: number) => void }) {
  const meta = capture.metadata;
  const isDone = capture.status !== "active";

  return (
    <div className={`bg-white border rounded-xl p-3 flex gap-3 ${isDone ? "opacity-50" : ""}`}>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium text-zinc-900 leading-snug ${isDone ? "line-through" : ""}`}>
          {capture.summary}
        </p>
        <div className="flex flex-wrap gap-x-3 mt-1">
          {!!meta?.author && (
            <span className="text-xs text-zinc-400">{meta.author as string}</span>
          )}
          {!!meta?.page && (
            <span className="text-xs text-zinc-400">p. {meta.page as string}</span>
          )}
          {!!meta?.topic && (
            <span className="text-xs text-zinc-400">{meta.topic as string}</span>
          )}
        </div>
        {!!meta?.url && (
          <a
            href={meta.url as string}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-500 hover:underline mt-0.5 block truncate"
          >
            {meta.url as string}
          </a>
        )}
      </div>
      {!isDone && (
        <button
          onClick={() => onAbsorbed(capture.id)}
          className="text-xs text-zinc-400 hover:text-zinc-700 flex-shrink-0 self-start mt-0.5 transition-colors"
        >
          Done
        </button>
      )}
    </div>
  );
}

function Section({ type, captures, onAbsorbed }: {
  type: string;
  captures: Capture[];
  onAbsorbed: (id: number) => void;
}) {
  const active = captures.filter(c => c.status === "active");
  if (captures.length === 0) return null;
  return (
    <section className="mb-6">
      <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2 px-1 flex items-center gap-2">
        <ResourceIcon type={type} />
        {RESOURCE_LABELS[type] ?? type}
        <span className="normal-case font-normal">({active.length} unread)</span>
      </h2>
      <div className="flex flex-col gap-2">
        {captures.map(c => <ReadingCard key={c.id} capture={c} onAbsorbed={onAbsorbed} />)}
      </div>
    </section>
  );
}

export default function ReadingPage() {
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCaptures(await fetchReadingList());
    } catch {
      setError("Couldn't load.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAbsorbed = async (id: number) => {
    await markAbsorbed(id);
    setCaptures(prev => prev.map(c => c.id === id ? { ...c, status: "absorbed" } : c));
  };

  const byType: Record<string, Capture[]> = {};
  for (const c of captures) {
    const type = (c.metadata?.resource_type as string) || "other";
    if (!byType[type]) byType[type] = [];
    byType[type].push(c);
  }

  if (loading) {
    return (
      <div className="p-4 max-w-2xl mx-auto flex flex-col gap-2">
        {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-xl bg-zinc-100 animate-pulse" />)}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center mt-16 max-w-2xl mx-auto">
        <p className="text-zinc-500 text-sm cursor-pointer hover:text-zinc-700" onClick={load}>
          Couldn&apos;t load. Tap to retry.
        </p>
      </div>
    );
  }

  if (captures.length === 0) {
    return (
      <div className="p-6 text-center mt-16 max-w-2xl mx-auto">
        <p className="text-zinc-500 text-sm">Nothing to read yet.</p>
        <Link href="/" className="text-zinc-400 text-sm hover:text-zinc-600 mt-1 inline-block">
          Start capturing →
        </Link>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h1 className="text-base font-semibold text-zinc-900 mb-4">Reading List</h1>
      {RESOURCE_ORDER.map(type => (
        <Section key={type} type={type} captures={byType[type] ?? []} onAbsorbed={handleAbsorbed} />
      ))}
    </div>
  );
}
