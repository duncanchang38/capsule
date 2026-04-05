"use client";

import { useState, useCallback, useRef } from "react";
import { ToastContext } from "@/hooks/useToast";
import type { Toast, ToastAction } from "@/hooks/useToast";

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const t = timers.current.get(id);
    if (t) { clearTimeout(t); timers.current.delete(id); }
  }, []);

  const show = useCallback((message: string, action?: ToastAction, durationMs = 3500) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev.slice(-2), { id, message, action, durationMs }]);
    const t = setTimeout(() => dismiss(id), durationMs);
    timers.current.set(id, t);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="fixed bottom-20 inset-x-0 flex flex-col items-center gap-2 z-50 pointer-events-none px-4">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="pointer-events-auto flex items-center gap-3 px-4 py-2.5 bg-stone-800 text-white rounded-xl shadow-lg text-sm animate-in fade-in slide-in-from-bottom-2 duration-200"
          >
            <span className="text-stone-200">{toast.message}</span>
            {toast.action && (
              <button
                onClick={() => { toast.action!.onClick(); dismiss(toast.id); }}
                className="font-semibold text-white hover:text-stone-300 transition-colors ml-1"
              >
                {toast.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
