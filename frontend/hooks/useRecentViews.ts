"use client";

import { useState, useEffect, useCallback } from "react";

export interface RecentView {
  id: number;
  summary: string;
  capture_type: string;
  topic?: string;
  viewed_at: string;
}

const KEY = "capsule:recent_views";
const MAX = 10;

export function useRecentViews(currentId?: number) {
  const [views, setViews] = useState<RecentView[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setViews(JSON.parse(raw));
    } catch {}
  }, []);

  const recordView = useCallback((capture: {
    id: number;
    summary: string;
    capture_type: string;
    metadata?: Record<string, unknown>;
  }) => {
    setViews((prev) => {
      const entry: RecentView = {
        id: capture.id,
        summary: capture.summary,
        capture_type: capture.capture_type,
        topic: capture.metadata?.topic as string | undefined,
        viewed_at: new Date().toISOString(),
      };
      const next = [entry, ...prev.filter((v) => v.id !== capture.id)].slice(0, MAX);
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const recentViews = currentId !== undefined
    ? views.filter((v) => v.id !== currentId)
    : views;

  return { recentViews, recordView };
}
