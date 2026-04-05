"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useCaptures } from "@/hooks/useCaptures";
import { getTopics, clearDeleted } from "@/lib/api";
import { CaptureListRow } from "@/components/CaptureListRow";
import type { CaptureRowHandlers } from "@/components/CaptureListRow";
import type { Capture, Topic } from "@/lib/api";

const ARCHIVE_TTL_DAYS = 30; // must match backend ARCHIVE_TTL_DAYS

function getLocalToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function deletedDaysLeft(capture: Capture): number | null {
  const deletedAt = capture.metadata?.deleted_at as string | undefined;
  if (!deletedAt) return null;
  const expiresAt = new Date(deletedAt);
  expiresAt.setDate(expiresAt.getDate() + ARCHIVE_TTL_DAYS);
  const msLeft = expiresAt.getTime() - Date.now();
  return Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));
}

function isDeferred(c: Capture): boolean {
  const dt = c.metadata?.deferred_to as string | undefined;
  return !!dt && dt > getLocalToday();
}

function Section({
  id,
  label,
  captures,
  emptyText,
  handlers,
}: {
  id: string;
  label: string;
  captures: Capture[];
  emptyText: string;
  handlers?: CaptureRowHandlers;
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
          {captures.map((c) => (
            <CaptureListRow
              key={c.id}
              capture={c}
              handlers={handlers}
              dimmed={isDeferred(c)}
              meta={(() => {
                const author = typeof c.metadata?.author === "string" ? c.metadata.author as string : null;
                const url = typeof c.metadata?.url === "string" ? c.metadata.url as string : null;
                const domain = url ? (() => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return null; } })() : null;
                const sub = author || domain;
                return sub ? <p className="text-[10px] text-stone-400 mt-0.5">{sub}</p> : undefined;
              })()}
              rightExtras={
                (c.metadata?.stage || c.notes)
                  ? (
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {c.metadata?.stage && (
                        <span className="text-[10px] text-stone-300 capitalize">{c.metadata.stage as string}</span>
                      )}
                      {c.notes && (
                        <span className="text-[10px] text-stone-300" title="Has notes">✦</span>
                      )}
                    </div>
                  )
                  : undefined
              }
            />
          ))}
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
  const { captures, loading: capturesLoading, error, refresh, markDone, deleteCapture, deferCapture, planToday } = useCaptures();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [topicsLoading, setTopicsLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [clearConfirm, setClearConfirm] = useState<"idle" | "first" | "second">("idle");
  const [clearing, setClearing] = useState(false);

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

  const sortActiveFirst = (list: Capture[]) =>
    [...list].sort((a, b) => (isDeferred(a) ? 1 : 0) - (isDeferred(b) ? 1 : 0));

  const ideas = sortActiveFirst(filterCaptures(captures.filter((c) => c.capture_type === "to_cook" && c.status === "active")));
  const reading = sortActiveFirst(filterCaptures(captures.filter((c) => c.capture_type === "to_learn" && c.status === "active")));
  const archive = filterCaptures(
    captures.filter(
      (c) => !["inbox", "query", "calendar"].includes(c.capture_type) && c.status === "deleted"
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
              {searchResults.map((c) => <CaptureListRow key={c.id} capture={c} />)}
            </div>
          )}
        </section>
      ) : (
        <>
          <TopicChips topics={topics} loading={topicsLoading} />
          <Section
            id="ideas"
            label="Ideas"
            captures={ideas}
            emptyText="No ideas yet."
            handlers={{ onPlanToday: planToday, onDefer: deferCapture, onDone: markDone, onDelete: deleteCapture }}
          />
          <Section
            id="reading"
            label="Reading"
            captures={reading}
            emptyText="No reading yet."
            handlers={{ onPlanToday: planToday, onDefer: deferCapture, onDone: markDone, onDelete: deleteCapture }}
          />

          {/* Collapsible archive */}
          <section id="archive" className="mb-8">
            <button
              onClick={() => setArchiveOpen((o) => !o)}
              className="w-full flex items-center justify-between mb-3 group"
            >
              <h2 className="text-xs font-semibold text-stone-400 uppercase tracking-wider">
                Archive
                <span className="normal-case font-normal ml-1 opacity-70">({archive.length})</span>
              </h2>
              <svg
                width="12" height="12" viewBox="0 0 12 12" fill="none"
                className={`text-stone-300 transition-transform duration-150 ${archiveOpen ? "rotate-180" : ""}`}
              >
                <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {archiveOpen && (
              archive.length === 0 ? (
                <p className="text-sm text-stone-400 py-2">Nothing archived yet.</p>
              ) : (
                <>
                  <div className="bg-white border border-[#e8e4db] rounded-xl px-4 py-1 mb-3">
                    {archive.map((c) => {
                      const daysLeft = deletedDaysLeft(c);
                      const urgent = daysLeft !== null && daysLeft <= 3;
                      return (
                        <CaptureListRow
                          key={c.id}
                          capture={c}
                          rightExtras={
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              {c.metadata?.stage && (
                                <span className="text-[10px] text-stone-300 capitalize">{c.metadata.stage as string}</span>
                              )}
                              {c.notes && (
                                <span className="text-[10px] text-stone-300" title="Has notes">✦</span>
                              )}
                              {daysLeft !== null && (
                                <span
                                  className={`text-[10px] font-medium tabular-nums ${
                                    urgent ? "text-red-400" : "text-stone-300"
                                  }`}
                                  title={`Deleted in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`}
                                >
                                  {daysLeft}d
                                </span>
                              )}
                            </div>
                          }
                        />
                      );
                    })}
                  </div>
                  <button
                    onClick={() => setClearConfirm("first")}
                    className="w-full py-2 text-[11px] text-stone-300 hover:text-red-400 transition-colors"
                  >
                    Clear archive
                  </button>
                </>
              )
            )}
          </section>

          {/* Clear archive confirmation modal */}
          {clearConfirm !== "idle" && (
            <div
              className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4"
              onClick={() => setClearConfirm("idle")}
            >
              <div
                className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                {clearConfirm === "first" ? (
                  <>
                    <h3 className="text-base font-semibold text-stone-900 mb-2">Clear archive?</h3>
                    <p className="text-sm text-stone-500 mb-5">
                      All {archive.length} archived item{archive.length !== 1 ? "s" : ""} will be permanently deleted. This cannot be undone.
                    </p>
                    <div className="flex gap-3">
                      <button
                        onClick={() => setClearConfirm("idle")}
                        className="flex-1 py-2.5 rounded-xl border border-stone-200 text-sm text-stone-600 hover:bg-stone-50"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => setClearConfirm("second")}
                        className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-medium hover:bg-red-600"
                      >
                        Delete all
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <h3 className="text-base font-semibold text-stone-900 mb-2">Are you sure?</h3>
                    <p className="text-sm text-stone-500 mb-5">
                      There is no way to recover these items. They will be gone permanently.
                    </p>
                    <div className="flex gap-3">
                      <button
                        onClick={() => setClearConfirm("idle")}
                        className="flex-1 py-2.5 rounded-xl border border-stone-200 text-sm text-stone-600 hover:bg-stone-50"
                      >
                        Cancel
                      </button>
                      <button
                        disabled={clearing}
                        onClick={async () => {
                          setClearing(true);
                          try {
                            await clearDeleted();
                            await refresh();
                            setClearConfirm("idle");
                            setArchiveOpen(false);
                          } finally {
                            setClearing(false);
                          }
                        }}
                        className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
                      >
                        {clearing ? "Deleting…" : "Yes, delete forever"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
