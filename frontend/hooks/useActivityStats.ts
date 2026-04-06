"use client";

import { useState, useEffect } from "react";
import { getActivityStats, type ActivityStats } from "@/lib/api";

function getLocalToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const EMPTY: ActivityStats = {
  streak: 0,
  captured_today: 0,
  completed_today: 0,
  deferred_today: 0,
};

export function useActivityStats() {
  const [stats, setStats] = useState<ActivityStats>(EMPTY);

  useEffect(() => {
    getActivityStats(getLocalToday()).then(setStats).catch(() => {});
  }, []);

  return stats;
}
