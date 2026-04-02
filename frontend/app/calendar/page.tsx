"use client";

import { useState, useRef } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { useCaptures } from "@/hooks/useCaptures";
import type { EventInput } from "@fullcalendar/core";
import type { CalendarApi } from "@fullcalendar/core";

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  calendar: { bg: "#3b82f6", text: "#ffffff" },
  to_hit:   { bg: "#f97316", text: "#ffffff" },
  to_know:  { bg: "#8b5cf6", text: "#ffffff" },
  to_learn: { bg: "#10b981", text: "#ffffff" },
  to_cook:  { bg: "#ec4899", text: "#ffffff" },
};

const SOURCE_LABELS: Record<string, string> = {
  calendar: "Events",
  to_hit:   "Tasks",
  to_know:  "Questions",
  to_learn: "Learning",
  to_cook:  "Ideas",
};

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
  const today = new Date();
  const todayStr = today.toDateString();
  const selectedStr = selectedDate.toDateString();

  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  return (
    <div className="px-3 py-3 select-none">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold text-zinc-700 tracking-tight">{monthName}</span>
        <div className="flex gap-0.5">
          <button
            onClick={() => setViewDate(new Date(year, month - 1, 1))}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M6.5 1.5L3 5L6.5 8.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
          </button>
          <button
            onClick={() => setViewDate(new Date(year, month + 1, 1))}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M3.5 1.5L7 5L3.5 8.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 mb-1">
        {["S","M","T","W","T","F","S"].map((d, i) => (
          <div key={i} className="text-center text-[9px] text-zinc-400 font-medium h-5 flex items-center justify-center">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {cells.map((date, i) => {
          if (!date) return <div key={`e-${i}`} className="h-6" />;
          const isToday = date.toDateString() === todayStr;
          const isSelected = date.toDateString() === selectedStr && !isToday;
          return (
            <button
              key={i}
              onClick={() => onDateClick(date)}
              className={`h-6 w-6 mx-auto flex items-center justify-center text-[11px] rounded-full transition-colors ${
                isToday
                  ? "bg-blue-500 text-white font-semibold"
                  : isSelected
                  ? "bg-zinc-200 text-zinc-900"
                  : "text-zinc-600 hover:bg-zinc-100"
              }`}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function CalendarPage() {
  const { captures, loading } = useCaptures();
  const calendarRef = useRef<{ getApi: () => CalendarApi } | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set());

  const toggleType = (type: string) => {
    setHiddenTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const events: EventInput[] = captures
    .filter((c) => {
      if (hiddenTypes.has(c.capture_type)) return false;
      if (c.capture_type === "calendar") return !!c.deadline;
      if (c.capture_type === "to_hit") return !!c.deadline;
      return false;
    })
    .map((c) => {
      const colors = TYPE_COLORS[c.capture_type] ?? { bg: "#6b7280", text: "#ffffff" };
      return {
        id: String(c.id),
        title: c.summary,
        date: c.deadline!,
        backgroundColor: colors.bg,
        borderColor: colors.bg,
        textColor: colors.text,
        extendedProps: { capture: c },
      };
    });

  const handleDateClick = (date: Date) => {
    setSelectedDate(date);
    if (calendarRef.current) {
      calendarRef.current.getApi().gotoDate(date);
    }
  };

  if (loading) {
    return <div className="p-6 text-sm text-zinc-400">Loading...</div>;
  }

  return (
    <div className="flex h-[calc(100vh-45px)] bg-white">
      {/* Left sidebar */}
      <div className="w-[220px] flex-shrink-0 border-r border-zinc-100 flex flex-col overflow-y-auto">
        <MiniCalendar selectedDate={selectedDate} onDateClick={handleDateClick} />

        {/* Divider */}
        <div className="mx-3 border-t border-zinc-100 my-1" />

        {/* Calendar sources */}
        <div className="px-3 py-2">
          <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-2 px-1">My Capsule</p>
          <div className="flex flex-col gap-0.5">
            {Object.entries(TYPE_COLORS).map(([type, { bg }]) => {
              const hidden = hiddenTypes.has(type);
              return (
                <button
                  key={type}
                  onClick={() => toggleType(type)}
                  className="flex items-center gap-2 px-1 py-1 rounded-md hover:bg-zinc-50 text-left w-full group"
                >
                  <div
                    className={`w-3 h-3 rounded-sm flex-shrink-0 transition-opacity ${hidden ? "opacity-30" : ""}`}
                    style={{ backgroundColor: bg }}
                  />
                  <span className={`text-xs text-zinc-600 transition-opacity ${hidden ? "opacity-40" : ""}`}>
                    {SOURCE_LABELS[type] ?? type}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main calendar */}
      <div className="flex-1 min-w-0 overflow-hidden">
        <FullCalendar
          ref={calendarRef as never}
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
          eventClick={(info) => {
            const c = info.event.extendedProps.capture;
            alert(`${c.summary}\n\nType: ${c.capture_type}\nDate: ${c.deadline}`);
          }}
          datesSet={(info) => setSelectedDate(info.view.currentStart)}
        />
      </div>
    </div>
  );
}
