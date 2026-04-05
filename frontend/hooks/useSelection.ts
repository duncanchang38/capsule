"use client";

import { useState, useCallback } from "react";

export function useSelection() {
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const startSelecting = useCallback(() => setSelecting(true), []);

  const cancel = useCallback(() => {
    setSelecting(false);
    setSelectedIds(new Set());
  }, []);

  const toggle = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback((ids: number[]) => {
    setSelectedIds(new Set(ids));
  }, []);

  return { selecting, selectedIds, toggle, selectAll, cancel, startSelecting };
}
