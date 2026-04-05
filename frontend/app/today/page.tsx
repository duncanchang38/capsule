"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useCaptures } from "@/hooks/useCaptures";
import { useReviewStreak } from "@/hooks/useReviewStreak";
import { useSelection } from "@/hooks/useSelection";
import { clearDeleted, updateCaptureStatus, deferCapture as deferCaptureApi, scheduleCapture } from "@/lib/api";
import { TYPE_CONFIG } from "@/lib/typeConfig";
import { CaptureListRow, TypeBadge } from "@/components/CaptureListRow";
import { SelectionToolbar } from "@/components/SelectionToolbar";
import type { Capture } from "@/lib/api";
import type { CaptureRowHandlers } from "@/components/CaptureListRow";

function getLocalToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isDeferred(c: Capture): boolean {
  const dt = c.metadata?.deferred_to as string | undefined;
  return !!dt && dt > getLocalToday();
}

function snippet(capture: Capture): React.ReactNode {
  if (capture.notes) {
    const text = capture.notes.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (text.length > 20) {
      return (
        <p className="text-[10px] text-stone-400 mt-0.5 line-clamp-1">
          {text.slice(0, 120)}
        </p>
      );
    }
  }
  const firstLine = capture.content.split("\n")[0].trim();
  if (
    firstLine.length > 15 &&
    firstLine.toLowerCase() !== capture.summary.toLowerCase()
  ) {
    return (
      <p className="text-[10px] text-stone-400 mt-0.5 line-clamp-1">
        {firstLine.slice(0, 120)}
      </p>
    );
  }
  return undefined;
}

function CalendarTodayRow({ capture }: { capture: Capture }) {
  const time = capture.metadata?.time as string | undefined;
  const location = typeof capture.metadata?.location === "string" ? capture.metadata.location : undefined;
  return (
    <Link
      href={`/captures/${capture.id}`}
      className="flex items-start gap-3 py-2 hover:bg-stone-50 rounded-lg px-1 -mx-1 transition-colors"
    >
      <div className="w-12 flex-shrink-0 text-right pt-0.5">
        <span className="text-[10px] text-stone-400 font-medium">{time ?? "—"}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-stone-800 leading-snug">{capture.summary}</p>
        {location && (
          <p className="text-[10px] text-stone-400 mt-0.5 line-clamp-1">{location}</p>
        )}
      </div>
      <TypeBadge type={capture.capture_type} />
    </Link>
  );
}

type TabId = "overdue" | "schedule" | "later" | "captured" | "archive";

const ARCHIVE_TTL_DAYS = 30;

function deletedDaysLeft(c: Capture): number | null {
  const deletedAt = c.metadata?.deleted_at as string | undefined;
  if (!deletedAt) return null;
  const expiresAt = new Date(deletedAt);
  expiresAt.setDate(expiresAt.getDate() + ARCHIVE_TTL_DAYS);
  return Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
}

interface Tab {
  id: TabId;
  label: string;
  count: number;
  red?: boolean;
}

function TabBar({
  tabs,
  active,
  streak,
  selecting,
  onChange,
  onSelect,
}: {
  tabs: Tab[];
  active: TabId;
  streak: number;
  selecting: boolean;
  onChange: (id: TabId) => void;
  onSelect: () => void;
}) {
  return (
    <div className="sticky top-0 z-20 bg-[#f7f5f0] border-b border-stone-100 -mx-4 px-4 mb-0">
      <div className="flex items-center gap-0 overflow-x-auto scrollbar-none">
        {tabs.map((tab) => {
          const isActive = tab.id === active;
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                isActive
                  ? tab.red
                    ? "border-red-400 text-red-500"
                    : "border-stone-800 text-stone-800"
                  : "border-transparent text-stone-400 hover:text-stone-600"
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className={`text-[10px] font-normal ${isActive ? (tab.red ? "text-red-400" : "text-stone-500") : "text-stone-300"}`}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
        <div className="ml-auto flex items-center gap-2 flex-shrink-0 pl-2">
          {streak > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-500 font-medium border border-amber-100">
              {streak}d
            </span>
          )}
          <button
            onClick={onSelect}
            className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${
              selecting ? "bg-stone-800 text-white" : "text-stone-400 hover:text-stone-700 hover:bg-stone-100"
            }`}
          >
            Select
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TodayPage() {
  const { captures, setCaptures, loading, error, refresh, markDone, deleteCapture, deferCapture, planToday } = useCaptures();
  const { streak, reviewedToday, markReviewDone } = useReviewStreak();
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("schedule");
  const [clearConfirm, setClearConfirm] = useState<"idle" | "first" | "second">("idle");
  const [clearing, setClearing] = useState(false);
  const { selecting, selectedIds, toggle, selectAll, cancel: cancelSelection, startSelecting } = useSelection();

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  const TODAY = getLocalToday();

  const calendarToday = captures
    .filter((c) => c.capture_type === "calendar" && c.deadline === TODAY && c.status === "active")
    .sort((a, b) => {
      const ta = (a.metadata?.time as string) ?? "99:99";
      const tb = (b.metadata?.time as string) ?? "99:99";
      return ta.localeCompare(tb);
    });

  // All non-calendar items due today (active + done), active first
  const scheduledToday = captures
    .filter(
      (c) =>
        !["calendar", "inbox", "query"].includes(c.capture_type) &&
        c.deadline === TODAY &&
        c.status !== "deleted"
    )
    .sort((a, b) => {
      const aActive = a.status === "active" ? 0 : 1;
      const bActive = b.status === "active" ? 0 : 1;
      return aActive - bActive;
    });

  const overdue = captures
    .filter(
      (c) =>
        !["calendar", "inbox", "query"].includes(c.capture_type) &&
        c.status === "active" &&
        c.deadline !== null &&
        c.deadline !== undefined &&
        c.deadline < TODAY &&
        !isDeferred(c)
    )
    .sort((a, b) => (a.deadline ?? "").localeCompare(b.deadline ?? ""));

  const pending = captures.filter(
    (c) =>
      !["calendar", "inbox", "query"].includes(c.capture_type) &&
      c.status === "active" &&
      !c.deadline &&
      !isDeferred(c)
  );

  const deferred = captures.filter(
    (c) =>
      !["calendar", "inbox", "query"].includes(c.capture_type) &&
      c.status === "active" &&
      isDeferred(c)
  );

  const alreadySurfacedIds = new Set([
    ...calendarToday.map((c) => c.id),
    ...scheduledToday.map((c) => c.id),
    ...overdue.map((c) => c.id),
    ...pending.map((c) => c.id),
  ]);

  const capturedToday = captures
    .filter(
      (c) =>
        !["inbox", "query"].includes(c.capture_type) &&
        c.status === "active" &&
        c.created_at?.slice(0, 10) === TODAY &&
        !alreadySurfacedIds.has(c.id)
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  const deleted = captures.filter(
    (c) => !["inbox", "query", "calendar"].includes(c.capture_type) && c.status === "deleted"
  );

  const scheduleCount = calendarToday.length + scheduledToday.length;

  const tabs: Tab[] = [
    ...(overdue.length > 0
      ? [{ id: "overdue" as const, label: "Overdue", count: overdue.length, red: true }]
      : []),
    { id: "schedule" as const, label: "Today", count: scheduleCount + pending.length },
    { id: "later" as const, label: "Later", count: deferred.length },
    ...(capturedToday.length > 0
      ? [{ id: "captured" as const, label: "Captured", count: capturedToday.length }]
      : []),
    { id: "archive" as const, label: "Deleted", count: deleted.length },
  ];

  const visibleIds = tabs.map((t) => t.id);
  const effectiveTab: TabId = visibleIds.includes(activeTab) ? activeTab : (visibleIds[0] ?? "schedule");

  // Reset to schedule when data loads and active tab no longer valid
  useEffect(() => {
    if (!loading && !visibleIds.includes(activeTab)) {
      setActiveTab(visibleIds[0] ?? "schedule");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const handlers: CaptureRowHandlers = {
    onPlanToday: planToday,
    onDefer: deferCapture,
    onDone: markDone,
    onDelete: deleteCapture,
  };

  const scheduledHandlers: CaptureRowHandlers = {
    onDefer: deferCapture,
    onDelete: deleteCapture,
    onCheckDone: markDone,
    onRestoreActive: async (id) => {
      setCaptures((prev) => prev.map((c) => c.id === id ? { ...c, status: "active" } : c));
    },
  };

  const currentTabItems: Capture[] = (() => {
    if (effectiveTab === "schedule") return [...calendarToday, ...scheduledToday, ...pending];
    if (effectiveTab === "later") return deferred;
    if (effectiveTab === "captured") return capturedToday;
    if (effectiveTab === "archive") return deleted;
    return [];
  })();

  const handleBulkDone = async () => {
    const ids = [...selectedIds];
    cancelSelection();
    await Promise.all(ids.map((id) => {
      const c = captures.find((x) => x.id === id);
      const cfg2 = c ? TYPE_CONFIG[c.capture_type as keyof typeof TYPE_CONFIG] : undefined;
      return updateCaptureStatus(id, cfg2?.doneStatus || "done");
    }));
    refresh();
  };

  const handleBulkDelete = async () => {
    const ids = [...selectedIds];
    cancelSelection();
    await Promise.all(ids.map((id) => updateCaptureStatus(id, "deleted")));
    refresh();
  };

  const handleBulkPlanToday = async () => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const ids = [...selectedIds];
    cancelSelection();
    await Promise.all(ids.map((id) => scheduleCapture(id, todayStr, null, null)));
    refresh();
  };

  const handleBulkDefer = async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);
    const ids = [...selectedIds];
    cancelSelection();
    await Promise.all(ids.map((id) => deferCaptureApi(id, tomorrowStr)));
    refresh();
  };

  if (!mounted || loading) {
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
    <>
    <div className="max-w-2xl mx-auto">
      {/* Tab bar */}
      <TabBar
        tabs={tabs}
        active={effectiveTab}
        streak={streak}
        selecting={selecting}
        onChange={(id) => { setActiveTab(id); cancelSelection(); window.scrollTo({ top: 0 }); }}
        onSelect={selecting ? cancelSelection : startSelecting}
      />

      <div ref={scrollRef} className="px-4 pt-4 pb-8">

        {/* OVERDUE */}
        {effectiveTab === "overdue" && (
          <section>
            <div className="bg-white border border-red-100 rounded-xl px-4 py-1">
              {overdue.map((c) => (
                <CaptureListRow key={c.id} capture={c} handlers={handlers} meta={snippet(c)} />
              ))}
            </div>
          </section>
        )}

        {/* TODAY — scheduled + pending + done */}
        {effectiveTab === "schedule" && (
          <section>
            {/* Review button at top */}
            <div className="mb-4">
              {reviewedToday ? (
                <p className="text-[11px] text-stone-300 text-center py-1">Daily review done</p>
              ) : (
                <button
                  onClick={markReviewDone}
                  className="w-full py-2.5 bg-stone-800 text-white text-sm font-medium rounded-xl hover:bg-stone-700 transition-colors active:scale-[0.98]"
                >
                  Mark daily review done
                </button>
              )}
            </div>

            {calendarToday.length === 0 && scheduledToday.length === 0 && pending.length === 0 ? (
              <p className="text-sm text-stone-400 py-2">Nothing on for today</p>
            ) : (
              <>
                {/* Scheduled today */}
                {(calendarToday.length > 0 || scheduledToday.length > 0) && (
                  <div className="mb-5">
                    <p className="text-[11px] font-medium text-stone-400 uppercase tracking-wide mb-2">Scheduled today</p>
                    <div className="bg-white border border-[#e8e4db] rounded-xl px-4 py-1">
                      {calendarToday.map((c) => <CalendarTodayRow key={c.id} capture={c} />)}
                      {scheduledToday.map((c) => (
                        <CaptureListRow key={c.id} capture={c} handlers={scheduledHandlers} meta={snippet(c)}
                          selecting={selecting} selected={selectedIds.has(c.id)} onSelect={toggle} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Pending */}
                {pending.length > 0 && (
                  <div>
                    <p className="text-[11px] font-medium text-stone-400 uppercase tracking-wide mb-2">Pending</p>
                    <div className="bg-white border border-[#e8e4db] rounded-xl px-4 py-1">
                      {pending.map((c) => (
                        <CaptureListRow key={c.id} capture={c} handlers={handlers} meta={snippet(c)}
                          selecting={selecting} selected={selectedIds.has(c.id)} onSelect={toggle} />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {/* LATER / DEFERRED */}
        {effectiveTab === "later" && (
          <section>
            <p className="text-xs text-stone-400 mb-4 leading-relaxed">
              Items you&apos;ve pushed to a future date. They&apos;ll surface back in Today when their date arrives.
            </p>
            {deferred.length === 0 ? (
              <p className="text-sm text-stone-400 py-2">Nothing deferred</p>
            ) : (
              <div className="bg-white border border-[#e8e4db] rounded-xl px-4 py-1">
                {deferred.map((c) => (
                  <CaptureListRow
                    key={c.id} capture={c} handlers={handlers} dimmed
                    selecting={selecting} selected={selectedIds.has(c.id)} onSelect={toggle}
                    meta={
                      (c.metadata?.deferred_to as string | undefined)
                        ? <p className="text-[10px] text-stone-400 mt-0.5">until {c.metadata?.deferred_to as string}</p>
                        : snippet(c)
                    }
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {/* CAPTURED TODAY */}
        {effectiveTab === "captured" && (
          <section>
            <div className="bg-white border border-[#e8e4db] rounded-xl px-4 py-1">
              {capturedToday.map((c) => (
                <CaptureListRow key={c.id} capture={c} handlers={handlers} meta={snippet(c)}
                  selecting={selecting} selected={selectedIds.has(c.id)} onSelect={toggle} />
              ))}
            </div>
          </section>
        )}

        {/* DELETED */}
        {effectiveTab === "archive" && (
          <section>
            {deleted.length > 0 && (
              <button
                onClick={() => setClearConfirm("first")}
                className="w-full mb-4 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-red-200 text-red-500 text-sm font-medium hover:bg-red-50 transition-colors active:scale-[0.98]"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2 3.5h10M5 3.5V2.5a.5.5 0 01.5-.5h3a.5.5 0 01.5.5v1M11 3.5l-.6 7a1 1 0 01-1 .9H4.6a1 1 0 01-1-.9L3 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Empty bin ({deleted.length} item{deleted.length !== 1 ? "s" : ""})
              </button>
            )}
            {deleted.length === 0 ? (
              <p className="text-sm text-stone-400 py-2">Deletion bin is empty</p>
            ) : (
              <div className="bg-white border border-[#e8e4db] rounded-xl px-4 py-1">
                {deleted.map((c) => {
                  const daysLeft = deletedDaysLeft(c) ?? 30;
                  const urgent = daysLeft <= 3;
                  return (
                    <CaptureListRow
                      key={c.id} capture={c}
                      selecting={selecting} selected={selectedIds.has(c.id)} onSelect={toggle}
                      rightExtras={
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {c.notes && <span className="text-[10px] text-stone-300" title="Has notes">✦</span>}
                          <span
                            className={`flex items-center gap-0.5 text-[10px] font-medium tabular-nums ${urgent ? "text-red-500" : "text-red-400"}`}
                            title={`Permanently deleted in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`}
                          >
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="flex-shrink-0">
                              <path d="M1.5 2.5h7M3.5 2.5V2a.5.5 0 01.5-.5h2a.5.5 0 01.5.5v.5M8 2.5l-.5 6a.5.5 0 01-.5.5H3a.5.5 0 01-.5-.5L2 2.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            {daysLeft}d
                          </span>
                        </div>
                      }
                    />
                  );
                })}
              </div>
            )}
          </section>
        )}

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
                  <h3 className="text-base font-semibold text-stone-900 mb-2">Empty bin?</h3>
                  <p className="text-sm text-stone-500 mb-5">
                    All {deleted.length} item{deleted.length !== 1 ? "s" : ""} in the bin will be permanently deleted. This cannot be undone.
                  </p>
                  <div className="flex gap-3">
                    <button onClick={() => setClearConfirm("idle")} className="flex-1 py-2.5 rounded-xl border border-stone-200 text-sm text-stone-600 hover:bg-stone-50">Cancel</button>
                    <button onClick={() => setClearConfirm("second")} className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-medium hover:bg-red-600">Delete all</button>
                  </div>
                </>
              ) : (
                <>
                  <h3 className="text-base font-semibold text-stone-900 mb-2">Are you sure?</h3>
                  <p className="text-sm text-stone-500 mb-5">There is no way to recover these items. They will be gone permanently.</p>
                  <div className="flex gap-3">
                    <button onClick={() => setClearConfirm("idle")} className="flex-1 py-2.5 rounded-xl border border-stone-200 text-sm text-stone-600 hover:bg-stone-50">Cancel</button>
                    <button
                      disabled={clearing}
                      onClick={async () => {
                        setClearing(true);
                        try { await clearDeleted(); await refresh(); setClearConfirm("idle"); }
                        finally { setClearing(false); }
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

      </div>
    </div>
    {selecting && (
      <SelectionToolbar
        count={selectedIds.size}
        total={currentTabItems.length}
        onSelectAll={() => selectAll(currentTabItems.map((c) => c.id))}
        onCancel={cancelSelection}
        onDone={effectiveTab !== "archive" ? handleBulkDone : undefined}
        onDelete={effectiveTab !== "archive" ? handleBulkDelete : undefined}
        onPlanToday={effectiveTab !== "archive" ? handleBulkPlanToday : undefined}
        onDefer={effectiveTab !== "archive" ? handleBulkDefer : undefined}
      />
    )}
    </>
  );
}
