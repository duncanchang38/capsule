"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { deleteCapture } from "@/lib/api";
import type { SavedCapture } from "@/hooks/useChat";

function getLabel(saved: SavedCapture): string {
  if (saved.type === "bulk") return `Saved ${saved.count} items`;
  const topic = saved.topic;
  if (topic) return `Saved to ${topic}`;
  const labels: Record<string, string> = {
    to_hit: "Task added",
    calendar: "Added to calendar",
    to_learn: "Saved",
    to_cook: "Idea saved",
    to_know: "Question captured",
    inbox: "Saved",
  };
  return labels[saved.capture_type ?? ""] ?? "Saved";
}

interface ToastProps {
  saved: SavedCapture;
  onDismiss: () => void;
}

export function Toast({ saved, onDismiss }: ToastProps) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timer.current = setTimeout(onDismiss, 4000);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [onDismiss]);

  const handleUndo = async () => {
    if (saved.id) {
      await deleteCapture(saved.id);
    }
    onDismiss();
  };

  const label = getLabel(saved);

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-stone-900 text-white text-sm px-4 py-3 rounded-2xl shadow-lg whitespace-nowrap animate-in fade-in slide-in-from-bottom-2 duration-200">
      <span className="text-stone-200">{label}</span>
      <div className="flex items-center gap-2 ml-1">
        {saved.id && (
          <Link
            href={`/captures/${saved.id}`}
            onClick={onDismiss}
            className="text-stone-400 hover:text-white transition-colors text-xs"
          >
            Open
          </Link>
        )}
        {saved.id && (
          <button
            onClick={handleUndo}
            className="text-stone-400 hover:text-white transition-colors text-xs"
          >
            Undo
          </button>
        )}
      </div>
    </div>
  );
}
