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

  // Enrichment runs async on the backend (1-3s after capture).
  // Re-fetch once after a short delay so enriched topics/summaries show up
  // without requiring a manual refresh.
  useEffect(() => {
    const t = setTimeout(refresh, 3500);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markDone = useCallback(async (id: number, status: string) => {
    await updateCaptureStatus(id, status);
    setCaptures((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status } : c))
    );
  }, []);

  const deleteCapture = useCallback(async (id: number) => {
    const deletedAt = new Date().toISOString();
    setCaptures((prev) =>
      prev.map((c) => c.id === id
        ? { ...c, status: "deleted", metadata: { ...c.metadata, deleted_at: deletedAt } }
        : c)
    );
    await updateCaptureStatus(id, "deleted");
  }, [setCaptures]);

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

  const patchSummary = useCallback((id: number, summary: string) => {
    setCaptures((prev) =>
      prev.map((c) => (c.id === id ? { ...c, summary } : c))
    );
  }, []);

  const planToday = useCallback(async (id: number) => {
    // Use local date so it matches how the user thinks about "today"
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    await scheduleCaptureApi(id, today, null, null);
    await refresh();
  }, [refresh]);

  return { captures, setCaptures, loading, error, refresh, markDone, deleteCapture, deferCapture, planToday, patchSummary };
}
