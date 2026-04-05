"use client";

interface SelectionToolbarProps {
  count: number;
  total: number;
  onSelectAll: () => void;
  onCancel: () => void;
  onDone?: () => void;
  onDelete?: () => void;
  onPlanToday?: () => void;
  onDefer?: () => void;
}

export function SelectionToolbar({
  count,
  total,
  onSelectAll,
  onCancel,
  onDone,
  onDelete,
  onPlanToday,
  onDefer,
}: SelectionToolbarProps) {
  const allSelected = count === total;

  return (
    <div className="fixed bottom-6 inset-x-0 flex justify-center z-40 px-4 pointer-events-none">
      <div className="pointer-events-auto w-full max-w-sm bg-stone-900 rounded-2xl shadow-xl overflow-hidden">
        {/* Count + select-all row */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <span className="text-sm font-medium text-white">
            {count === 0 ? "None selected" : `${count} selected`}
          </span>
          <button
            onClick={allSelected ? onCancel : onSelectAll}
            className="text-xs text-stone-400 hover:text-white transition-colors"
          >
            {allSelected ? "Deselect all" : "Select all"}
          </button>
        </div>

        {/* Actions */}
        <div className="flex border-t border-stone-700">
          {onPlanToday && (
            <button
              disabled={count === 0}
              onClick={onPlanToday}
              className="flex-1 flex flex-col items-center gap-1 py-3 text-stone-300 hover:text-white hover:bg-stone-800 transition-colors disabled:opacity-30"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <rect x="2.5" y="3.5" width="13" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
                <path d="M6 2.5v2M12 2.5v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                <path d="M2.5 7.5h13" stroke="currentColor" strokeWidth="1.4" />
                <path d="M9 11v3M7.5 12.5h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              <span className="text-[10px] font-medium">Do today</span>
            </button>
          )}
          {onDefer && (
            <button
              disabled={count === 0}
              onClick={onDefer}
              className="flex-1 flex flex-col items-center gap-1 py-3 text-stone-300 hover:text-white hover:bg-stone-800 transition-colors disabled:opacity-30"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <circle cx="9" cy="10" r="6" stroke="currentColor" strokeWidth="1.4" />
                <path d="M9 7v3l1.5 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M6.5 3h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              <span className="text-[10px] font-medium">Defer</span>
            </button>
          )}
          {onDone && (
            <button
              disabled={count === 0}
              onClick={onDone}
              className="flex-1 flex flex-col items-center gap-1 py-3 text-stone-300 hover:text-white hover:bg-stone-800 transition-colors disabled:opacity-30"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.4" />
                <path d="M5.5 9l2.5 2.5L12.5 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="text-[10px] font-medium">Done</span>
            </button>
          )}
          {onDelete && (
            <button
              disabled={count === 0}
              onClick={onDelete}
              className="flex-1 flex flex-col items-center gap-1 py-3 text-stone-300 hover:text-red-400 hover:bg-stone-800 transition-colors disabled:opacity-30"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M3 5h12M7 5V3.5a.5.5 0 01.5-.5h3a.5.5 0 01.5.5V5M14 5l-.8 9a1 1 0 01-1 .9H5.8a1 1 0 01-1-.9L4 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="text-[10px] font-medium">Delete</span>
            </button>
          )}
          <button
            onClick={onCancel}
            className="flex-1 flex flex-col items-center gap-1 py-3 text-stone-400 hover:text-white hover:bg-stone-800 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M4.5 4.5l9 9M13.5 4.5l-9 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <span className="text-[10px] font-medium">Cancel</span>
          </button>
        </div>
      </div>
    </div>
  );
}
