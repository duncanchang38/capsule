"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getCaptures,
  updateCaptureStatus,
  deferCapture as deferCaptureApi,
  scheduleCapture as scheduleCaptureApi,
  type Capture,
} from "@/lib/api";

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

  const deferCapture = useCallback(async (id: number, deferTo?: string) => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const deferToISO = deferTo ?? tomorrow.toISOString().slice(0, 10);
    setCaptures((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, metadata: { ...c.metadata, deferred_to: deferToISO } }
          : c
      )
    );
    await deferCaptureApi(id, deferTo);
  }, []);

  const planToday = useCallback(async (id: number) => {
    const today = new Date().toISOString().slice(0, 10);
    setCaptures((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, deadline: today } : c
      )
    );
    await scheduleCaptureApi(id, today, null, null);
  }, []);

  return { captures, setCaptures, loading, error, refresh, markDone, deferCapture, planToday };
}
