"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useCaptures } from "@/hooks/useCaptures";
import { getTopics } from "@/lib/api";
import { TYPE_CONFIG } from "@/lib/typeConfig";
import type { Capture, Topic } from "@/lib/api";

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

function TopicChips({ topics, loading }: { topics: Topic[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex gap-2 overflow-x-auto scrollbar-none pb-2 -mx-4 px-4 mb-5">
        {[60, 80, 55, 70].map((w, i) => (
          <div
            key={i}
            className="flex-shrink-0 h-7 rounded-full bg-stone-100 animate-pulse"
            style={{ width: w }}
          />
        ))}
      </div>
    );
  }

  if (topics.length === 0) return null;

  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-none pb-2 -mx-4 px-4 mb-5">
      {topics.map((t) => (
        <Link
          key={t.topic}
          href={`/topics/${encodeURIComponent(t.topic)}`}
          className="flex-shrink-0 min-h-[36px] flex items-center px-3 rounded-full bg-stone-100 text-stone-600 text-xs whitespace-nowrap hover:bg-stone-200 transition-colors"
        >
          {t.topic}
        </Link>
      ))}
    </div>
  );
}

export default function LibraryPage() {
  const { captures, loading: capturesLoading, error, refresh } = useCaptures();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [topicsLoading, setTopicsLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    getTopics()
      .then(setTopics)
      .catch(() => setTopics([]))
      .finally(() => setTopicsLoading(false));
  }, []);

  const q = query.trim().toLowerCase();

  const filterCaptures = (list: Capture[]) =>
    q
      ? list.filter(
          (c) =>
            c.summary.toLowerCase().includes(q) ||
            (c.content && c.content.toLowerCase().includes(q)) ||
            (typeof c.metadata?.topic === "string" && c.metadata.topic.toLowerCase().includes(q)) ||
            (typeof c.metadata?.author === "string" && c.metadata.author.toLowerCase().includes(q))
        )
      : list;

  const ideas = filterCaptures(captures.filter((c) => c.capture_type === "to_cook"));
  const reading = filterCaptures(captures.filter((c) => c.capture_type === "to_learn"));
  const archive = filterCaptures(
    captures.filter(
      (c) => !["inbox", "query", "calendar"].includes(c.capture_type) && c.status !== "active"
    )
  );

  if (capturesLoading) {
    return (
      <div className="p-4 max-w-2xl mx-auto">
        <div className="flex gap-2 mb-5">
          {[60, 80, 55, 70].map((w, i) => (
            <div key={i} className="flex-shrink-0 h-7 rounded-full bg-stone-100 animate-pulse" style={{ width: w }} />
          ))}
        </div>
        <div className="flex flex-col gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 rounded-xl bg-stone-100 animate-pulse" />
          ))}
        </div>
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

  const isSearching = q.length > 0;
  const searchResults = isSearching ? filterCaptures(captures) : [];

  return (
    <div className="max-w-2xl mx-auto p-4 pt-6">
      {/* Search bar */}
      <div className="relative mb-5">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
          <path d="M9.5 9.5L12.5 12.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your library…"
          className="w-full pl-8 pr-4 py-2.5 bg-stone-50 border border-[#e8e4db] rounded-xl text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-300"
        />
        {query && (
          <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        )}
      </div>

      {isSearching ? (
        <section>
          {searchResults.length === 0 ? (
            <p className="text-sm text-stone-400 py-4 text-center">Nothing matches &ldquo;{query}&rdquo;</p>
          ) : (
            <div className="bg-white border border-[#e8e4db] rounded-xl px-4 py-1">
              {searchResults.map((c) => <CaptureRow key={c.id} capture={c} />)}
            </div>
          )}
        </section>
      ) : (
        <>
          <TopicChips topics={topics} loading={topicsLoading} />
          <Section id="ideas" label="Ideas" captures={ideas} emptyText="No ideas yet." />
          <Section id="reading" label="Reading" captures={reading} emptyText="No reading yet." />
          <Section id="archive" label="Archive" captures={archive} emptyText="Nothing archived yet." />
        </>
      )}
    </div>
  );
}
