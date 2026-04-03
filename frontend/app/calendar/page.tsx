"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin, { Draggable } from "@fullcalendar/interaction";
import { useCaptures } from "@/hooks/useCaptures";
import { TYPE_CONFIG } from "@/lib/typeConfig";
import { scheduleCapture } from "@/lib/api";
import { ScheduleModal } from "@/components/calendar/ScheduleModal";
import type { EventInput } from "@fullcalendar/core";
import type { Capture } from "@/lib/api";

// ── Helpers ──────────────────────────────────────────────────────────────

function formatTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

/** Compute ISO end time from date + HH:MM start + duration in minutes */
function computeEnd(date: string, time: string, durationMins: number): string {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, m] = time.split(":").map(Number);
  const end = new Date(y, mo - 1, d, h, m + durationMins);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}T${pad(end.getHours())}:${pad(end.getMinutes())}:00`;
}

/** Extract HH:MM from a Date in local time */
function toTimeStr(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

// ── Mini Calendar ─────────────────────────────────────────────────────────

function MiniCalendar({
  selectedDate,
  onDateClick,
}: {
  selectedDate: Date;
  onDateClick: (date: Date) => void;
}) {
  const [viewDate, setViewDate] = useState(new Date(selectedDate));
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const monthName = viewDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = new Date().toDateString();
  const selectedStr = selectedDate.toDateString();

  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  return (
    <div className="px-3 py-3 select-none">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold text-zinc-700 tracking-tight">{monthName}</span>
        <div className="flex gap-0.5">
          {[
            { dir: -1, d: "M6.5 1.5L3 5L6.5 8.5" },
            { dir:  1, d: "M3.5 1.5L7 5L3.5 8.5" },
          ].map(({ dir, d }) => (
            <button
              key={dir}
              onClick={() => setViewDate(new Date(year, month + dir, 1))}
              className="w-5 h-5 flex items-center justify-center rounded text-zinc-400"
              style={{ transition: "background-color 100ms cubic-bezier(0.23,1,0.32,1), transform 80ms cubic-bezier(0.23,1,0.32,1)" }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#f4f4f3")}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = "")}
              onMouseDown={e => (e.currentTarget.style.transform = "scale(0.86)")}
              onMouseUp={e => (e.currentTarget.style.transform = "")}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d={d} stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {["S","M","T","W","T","F","S"].map((d, i) => (
          <div key={i} className="text-center text-[9px] text-zinc-400 font-medium h-5 flex items-center justify-center">{d}</div>
        ))}
      </div>
      <div key={`${year}-${month}`} className="grid grid-cols-7 mini-cal-in">
        {cells.map((date, i) => {
          if (!date) return <div key={`e-${i}`} className="h-6" />;
          const isToday = date.toDateString() === todayStr;
          const isSelected = date.toDateString() === selectedStr && !isToday;
          return (
            <button
              key={i}
              onClick={() => onDateClick(date)}
              className={`h-6 w-6 mx-auto flex items-center justify-center text-[11px] rounded-full ${
                isToday    ? "bg-blue-500 text-white font-semibold" :
                isSelected ? "bg-zinc-200 text-zinc-900" :
                             "text-zinc-600"
              }`}
              style={{ transition: "background-color 100ms cubic-bezier(0.23,1,0.32,1), transform 80ms cubic-bezier(0.23,1,0.32,1)" }}
              onMouseEnter={e => { if (!isToday && !isSelected) e.currentTarget.style.backgroundColor = "#f4f4f3"; }}
              onMouseLeave={e => { if (!isToday && !isSelected) e.currentTarget.style.backgroundColor = ""; }}
              onMouseDown={e => (e.currentTarget.style.transform = "scale(0.88)")}
              onMouseUp={e => (e.currentTarget.style.transform = "")}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Event Detail Popover ──────────────────────────────────────────────────

interface EventAnchor {
  capture: Capture;
  left: number;
  top: number;
  transformOrigin: string;
}

const PANEL_W = 288;
const PANEL_H = 220;
const GAP = 10;

function EventPopover({
  anchor,
  onClose,
  onDone,
  onReschedule,
}: {
  anchor: EventAnchor;
  onClose: () => void;
  onDone: (id: number, status: string) => void;
  onReschedule: (capture: Capture) => void;
}) {
  const { capture } = anchor;
  const cfg = TYPE_CONFIG[capture.capture_type as keyof typeof TYPE_CONFIG];
  const colors = cfg ? { bg: cfg.color } : { bg: "#6b7280" };
  const time = capture.metadata?.time as string | undefined;
  const location = capture.metadata?.location as string | undefined;
  const durationMins = capture.metadata?.duration_mins as number | undefined;
  const sprintIndex = capture.metadata?.sprint_index as number | undefined;
  const sprintTotal = capture.metadata?.sprint_total as number | undefined;
  const isDone = capture.status !== "active";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        style={{ animation: "backdropIn 120ms ease-out both" }}
      />
      <div
        className="fixed z-50 w-72 bg-white rounded-xl border border-zinc-100 shadow-lg shadow-black/[0.06] p-4"
        style={{
          left: anchor.left,
          top: anchor.top,
          transformOrigin: anchor.transformOrigin,
          animation: "popoverIn 150ms cubic-bezier(0.23,1,0.32,1) both",
        }}
      >
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: colors.bg }} />
            <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">
              {cfg?.displayLabel ?? capture.capture_type}
            </span>
            {sprintIndex && sprintTotal && (
              <span className="text-[10px] text-zinc-400">
                · {sprintIndex}/{sprintTotal}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-zinc-300"
            style={{ transition: "color 100ms cubic-bezier(0.23,1,0.32,1), transform 80ms cubic-bezier(0.23,1,0.32,1)" }}
            onMouseEnter={e => (e.currentTarget.style.color = "#71717a")}
            onMouseLeave={e => (e.currentTarget.style.color = "")}
            onMouseDown={e => (e.currentTarget.style.transform = "scale(0.88)")}
            onMouseUp={e => (e.currentTarget.style.transform = "")}
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M1 1L12 12M12 1L1 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <p className="text-[13px] font-medium text-zinc-900 leading-snug mb-2.5">
          {capture.summary}
        </p>

        <div className="flex flex-col gap-1.5">
          {capture.deadline && (
            <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                <rect x="1" y="2" width="10" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
                <path d="M4 1V3M8 1V3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                <path d="M1 5H11" stroke="currentColor" strokeWidth="1.2"/>
              </svg>
              {capture.deadline}{time ? ` · ${formatTime(time)}` : ""}
              {durationMins ? ` · ${durationMins < 60 ? `${durationMins}m` : `${durationMins / 60}h`}` : ""}
            </div>
          )}
          {location && (
            <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                <path d="M6 1C4.07 1 2.5 2.57 2.5 4.5C2.5 7.25 6 11 6 11C6 11 9.5 7.25 9.5 4.5C9.5 2.57 7.93 1 6 1Z" stroke="currentColor" strokeWidth="1.2"/>
                <circle cx="6" cy="4.5" r="1.25" stroke="currentColor" strokeWidth="1.2"/>
              </svg>
              {location}
            </div>
          )}
        </div>

        {capture.content && capture.content !== capture.summary && (
          <p className="text-[11px] text-zinc-500 mt-3 pt-3 border-t border-zinc-50 leading-relaxed">
            {capture.content}
          </p>
        )}

        <div className="mt-3 pt-3 border-t border-zinc-50 flex items-center gap-2">
          {cfg?.doneStatus && (
            <button
              onClick={() => { onDone(capture.id, isDone ? "active" : cfg.doneStatus); onClose(); }}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                isDone ? "bg-zinc-100 text-zinc-500 hover:bg-zinc-200" : "bg-zinc-900 text-white hover:bg-zinc-700"
              }`}
            >
              {isDone ? "Mark active" : (cfg.doneLabel || "Done")}
            </button>
          )}
          <button
            onClick={() => { onReschedule(capture); onClose(); }}
            className="text-xs px-3 py-1.5 rounded-lg font-medium bg-stone-100 text-stone-600 hover:bg-stone-200 transition-colors"
          >
            Reschedule
          </button>
        </div>
      </div>
    </>
  );
}

// ── Unscheduled sidebar item ──────────────────────────────────────────────

function UnscheduledItem({
  capture,
  onSchedule,
}: {
  capture: Capture;
  onSchedule: (c: Capture) => void;
}) {
  const cfg = TYPE_CONFIG[capture.capture_type as keyof typeof TYPE_CONFIG];

  return (
    <div
      className="group px-2 py-2 rounded-lg hover:bg-[#f7f5f0] transition-colors duration-100 cursor-grab active:cursor-grabbing"
      data-draggable
      data-id={capture.id}
      data-title={capture.summary}
      data-duration="01:00"
    >
      <div className="flex items-start gap-1.5">
        <div
          className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5"
          style={{ backgroundColor: cfg?.color ?? "#6b7280" }}
        />
        <p className="text-[11px] text-zinc-700 leading-snug flex-1 min-w-0 line-clamp-2">
          {capture.summary}
        </p>
      </div>
      <div className="flex items-center justify-between mt-1 pl-3">
        <span className={`text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${cfg?.bgClass ?? ""}`}>
          {cfg?.label ?? capture.capture_type}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); onSchedule(capture); }}
          className="text-[10px] text-stone-400 opacity-0 group-hover:opacity-100 hover:text-stone-600 transition-all duration-100 font-medium"
        >
          Schedule →
        </button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const { captures, loading, markDone, refresh, setCaptures } = useCaptures();
  const calendarRef = useRef<FullCalendar>(null);
  const unscheduledRef = useRef<HTMLDivElement>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set());
  const [eventAnchor, setEventAnchor] = useState<EventAnchor | null>(null);
  const [scheduleTarget, setScheduleTarget] = useState<{
    capture: Capture;
    prefillDate?: string;
    prefillTime?: string;
  } | null>(null);

  const toggleType = (type: string) => {
    setHiddenTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) { next.delete(type); } else { next.add(type); }
      return next;
    });
  };

  // Initialize FullCalendar external draggable on unscheduled items
  useEffect(() => {
    const container = unscheduledRef.current;
    if (!container) return;
    const draggable = new Draggable(container, {
      itemSelector: "[data-draggable]",
      eventData: (el: HTMLElement) => ({
        id: el.dataset.id,
        title: el.dataset.title ?? "",
        duration: el.dataset.duration ?? "01:00",
        create: false,
      }),
    });
    return () => draggable.destroy();
  }, [captures]); // Re-init when captures change so new items are draggable

  // All captures with a deadline go on the calendar (with duration as end time)
  const events: EventInput[] = captures
    .filter(c => {
      if (hiddenTypes.has(c.capture_type)) return false;
      if (!c.deadline) return false;
      return !["inbox", "query"].includes(c.capture_type);
    })
    .map(c => {
      const cfg = TYPE_CONFIG[c.capture_type as keyof typeof TYPE_CONFIG];
      const color = cfg?.color ?? "#6b7280";
      const time = c.metadata?.time as string | undefined;
      const durationMins = (c.metadata?.duration_mins as number | undefined) ?? 60;
      const start = time ? `${c.deadline}T${time}:00` : c.deadline!;
      const end = time ? computeEnd(c.deadline!, time, durationMins) : undefined;
      return {
        id: String(c.id),
        title: c.summary,
        start,
        end,
        backgroundColor: color,
        borderColor: color,
        textColor: "#ffffff",
        extendedProps: { capture: c },
      };
    });

  // Captures without deadline, not sprinted
  const unscheduled = captures.filter(
    c => !c.deadline
      && c.status === "active"
      && !["inbox", "query"].includes(c.capture_type)
      && !hiddenTypes.has(c.capture_type)
      && !c.metadata?.sprint_count
  );

  const handleDateClick = (date: Date) => {
    setSelectedDate(date);
    calendarRef.current?.getApi().gotoDate(date);
  };

  const handleScheduled = useCallback(() => {
    refresh();
  }, [refresh]);

  if (loading) return <div className="p-6 text-sm text-zinc-400">Loading…</div>;

  return (
    <>
      <div className="flex h-[calc(100vh-45px)] bg-white">

        {/* ── Sidebar ── */}
        <div className="w-[220px] flex-shrink-0 border-r border-zinc-100 flex flex-col overflow-y-auto">
          <MiniCalendar selectedDate={selectedDate} onDateClick={handleDateClick} />

          <div className="mx-3 border-t border-zinc-100 my-1" />

          {/* Source toggles */}
          <div className="px-3 py-2">
            <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-2 px-1">My Capsule</p>
            <div className="flex flex-col gap-0.5">
              {(Object.entries(TYPE_CONFIG) as [keyof typeof TYPE_CONFIG, typeof TYPE_CONFIG[keyof typeof TYPE_CONFIG]][]).map(([type, cfg]) => {
                const hidden = hiddenTypes.has(type);
                return (
                  <button
                    key={type}
                    onClick={() => toggleType(type)}
                    className="flex items-center gap-2 px-1 py-1 rounded-md text-left w-full"
                    style={{ transition: "background-color 100ms cubic-bezier(0.23,1,0.32,1), transform 80ms cubic-bezier(0.23,1,0.32,1)" }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#f9f9f8")}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = "")}
                    onMouseDown={e => (e.currentTarget.style.transform = "scale(0.97)")}
                    onMouseUp={e => (e.currentTarget.style.transform = "")}
                  >
                    <div
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0 border"
                      style={{
                        backgroundColor: hidden ? "transparent" : cfg.color,
                        borderColor: cfg.color,
                        transition: "background-color 150ms cubic-bezier(0.23,1,0.32,1)",
                      }}
                    />
                    <span className="text-xs text-zinc-600" style={{ opacity: hidden ? 0.38 : 1, transition: "opacity 150ms" }}>
                      {cfg.sourceLabel}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Unscheduled — draggable */}
          {unscheduled.length > 0 && (
            <>
              <div className="mx-3 border-t border-zinc-100 my-1" />
              <div className="px-3 py-2">
                <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5 px-1">
                  Unscheduled
                  <span className="ml-1 font-normal normal-case">({unscheduled.length})</span>
                </p>
                <p className="text-[9px] text-zinc-300 px-1 mb-2">Drag to calendar or tap Schedule →</p>
                <div ref={unscheduledRef} className="flex flex-col gap-0.5">
                  {unscheduled.map(c => (
                    <UnscheduledItem
                      key={c.id}
                      capture={c}
                      onSchedule={(c) => setScheduleTarget({ capture: c })}
                    />
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── Main calendar ── */}
        <div className="flex-1 min-w-0 overflow-hidden">
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="timeGridWeek"
            headerToolbar={{
              left: "prev,next today",
              center: "title",
              right: "timeGridWeek,dayGridMonth",
            }}
            buttonText={{ today: "Today", week: "Week", month: "Month" }}
            events={events}
            height="100%"
            nowIndicator
            allDaySlot
            slotMinTime="06:00:00"
            slotMaxTime="23:00:00"
            slotDuration="00:30:00"
            dayHeaderFormat={{ weekday: "short", day: "numeric" }}
            // Drag + drop
            editable
            droppable
            // External drop (from unscheduled sidebar)
            drop={async (info) => {
              const captureId = parseInt(info.draggedEl.dataset.id ?? "0");
              if (!captureId) return;
              const d = info.date;
              const deadline = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
              const time = info.allDay ? null : toTimeStr(d);
              await scheduleCapture(captureId, deadline, time, 60);
              refresh();
            }}
            // Move existing event — optimistic update, no flicker
            eventDrop={async (info) => {
              const captureId = parseInt(info.event.id);
              const start = info.event.start!;
              const deadline = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
              const time = info.event.allDay ? null : toTimeStr(start);
              // Optimistic: update local state immediately (FullCalendar already shows the new position)
              setCaptures(prev =>
                prev.map(c =>
                  c.id === captureId
                    ? { ...c, deadline, metadata: { ...c.metadata, ...(time ? { time } : {}) } }
                    : c
                )
              );
              try {
                await scheduleCapture(captureId, deadline, time, null);
              } catch {
                info.revert(); // Roll back FullCalendar position on failure
                refresh();    // Reload correct state
              }
            }}
            // Resize existing event (change duration)
            eventResize={async (info) => {
              const captureId = parseInt(info.event.id);
              const start = info.event.start!;
              const end = info.event.end;
              if (!end) return;
              const durationMins = Math.round((end.getTime() - start.getTime()) / 60000);
              await scheduleCapture(captureId, null, null, durationMins);
              // Don't call refresh — FullCalendar already shows the new size
            }}
            // Click event → popover
            eventClick={info => {
              const capture = info.event.extendedProps.capture as Capture;
              const rect = info.el.getBoundingClientRect();

              let left: number;
              let originX: string;
              if (rect.right + GAP + PANEL_W < window.innerWidth - 16) {
                left = rect.right + GAP;
                originX = "left";
              } else if (rect.left - GAP - PANEL_W > 16) {
                left = rect.left - GAP - PANEL_W;
                originX = "right";
              } else {
                left = Math.max(16, (window.innerWidth - PANEL_W) / 2);
                originX = "center";
              }
              const top = Math.min(Math.max(rect.top, 60), window.innerHeight - PANEL_H - 16);
              const originY = top <= rect.top ? "top" : "bottom";
              setEventAnchor({ capture, left, top, transformOrigin: `${originX} ${originY}` });
            }}
            dateClick={info => {
              const api = calendarRef.current?.getApi();
              if (!api) return;
              setSelectedDate(info.date);
              if (api.view.type === "dayGridMonth") {
                api.changeView("timeGridWeek", info.date);
              }
            }}
            datesSet={info => setSelectedDate(info.view.currentStart)}
          />
        </div>
      </div>

      {/* Event detail popover */}
      {eventAnchor && (
        <EventPopover
          anchor={eventAnchor}
          onClose={() => setEventAnchor(null)}
          onDone={markDone}
          onReschedule={(capture) => setScheduleTarget({ capture })}
        />
      )}

      {/* Schedule / sprint modal */}
      {scheduleTarget && (
        <ScheduleModal
          capture={scheduleTarget.capture}
          prefillDate={scheduleTarget.prefillDate}
          prefillTime={scheduleTarget.prefillTime}
          onClose={() => setScheduleTarget(null)}
          onScheduled={handleScheduled}
        />
      )}
    </>
  );
}
