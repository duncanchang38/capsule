"use client";

import { useState, useEffect, useCallback } from "react";

export interface RecentView {
  id: number;
  summary: string;
  capture_type: string;
  topic?: string;
  viewed_at: string;
}

const MAX = 10;

function storageKey(userId: string): string {
  return `capsule:recent_views:${userId}`;
}

export function useRecentViews(currentId?: number, userId?: string) {
  const [views, setViews] = useState<RecentView[]>([]);

  useEffect(() => {
    if (!userId) {
      setViews([]);
      return;
    }
    try {
      const raw = localStorage.getItem(storageKey(userId));
      if (raw) setViews(JSON.parse(raw));
      else setViews([]);
    } catch {}
  }, [userId]);

  const recordView = useCallback((capture: {
    id: number;
    summary: string;
    capture_type: string;
    metadata?: Record<string, unknown>;
  }) => {
    if (!userId) return;
    setViews((prev) => {
      const entry: RecentView = {
        id: capture.id,
        summary: capture.summary,
        capture_type: capture.capture_type,
        topic: capture.metadata?.topic as string | undefined,
        viewed_at: new Date().toISOString(),
      };
      const next = [entry, ...prev.filter((v) => v.id !== capture.id)].slice(0, MAX);
      try { localStorage.setItem(storageKey(userId), JSON.stringify(next)); } catch {}
      return next;
    });
  }, [userId]);

  const recentViews = currentId !== undefined
    ? views.filter((v) => v.id !== currentId)
    : views;

  return { recentViews, recordView };
}
