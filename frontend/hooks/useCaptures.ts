"use client";

import { useState, useEffect, useCallback } from "react";
import { getCaptures, updateCaptureStatus, type Capture } from "@/lib/api";

export function useCaptures() {
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getCaptures();
      setCaptures(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const markDone = useCallback(async (id: number, status: string) => {
    await updateCaptureStatus(id, status);
    setCaptures((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status } : c))
    );
  }, []);

  return { captures, loading, refresh, markDone };
}
