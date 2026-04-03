"use client";

import { useState, useEffect, useCallback } from "react";
import { getCaptures, updateCaptureStatus, type Capture } from "@/lib/api";

export function useCaptures() {
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getCaptures();
      setCaptures(data);
    } catch {
      setError("Couldn't load captures.");
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

  return { captures, loading, error, refresh, markDone };
}
