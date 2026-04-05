"use client";

import { useState, useEffect, useCallback } from "react";
import { getCapturesByTopic } from "@/lib/api";
import type { Capture } from "@/lib/api";

export function useTopicCaptures(topic: string) {
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getCapturesByTopic(topic);
      setCaptures(data);
    } catch {
      setError("Couldn't load.");
    } finally {
      setLoading(false);
    }
  }, [topic]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { captures, loading, error, refresh: fetch };
}
