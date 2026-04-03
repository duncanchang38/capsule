"use client";

import { useState, useCallback, useEffect } from "react";

const STORAGE_KEY = "capsule:reviews";

function getTodayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseReviews(): string[] {
  try {
    if (typeof window === "undefined") return [];
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function computeStreak(reviews: string[]): number {
  if (reviews.length === 0) return 0;
  const sorted = [...new Set(reviews)].sort().reverse();
  let streak = 0;
  const today = getTodayISO();
  let cursor = new Date(today + "T00:00:00");
  for (const date of sorted) {
    const d = new Date(date + "T00:00:00");
    const diffDays = Math.round((cursor.getTime() - d.getTime()) / 86_400_000);
    if (diffDays === 0 || diffDays === 1) {
      streak++;
      cursor = d;
    } else {
      break;
    }
  }
  return streak;
}

export function useReviewStreak() {
  const [streak, setStreak] = useState(0);
  const [reviewedToday, setReviewedToday] = useState(false);

  useEffect(() => {
    const reviews = parseReviews();
    setReviewedToday(reviews.includes(getTodayISO()));
    setStreak(computeStreak(reviews));
  }, []);

  const markReviewDone = useCallback(() => {
    const reviews = parseReviews();
    const today = getTodayISO();
    if (!reviews.includes(today)) {
      reviews.push(today);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(reviews));
    }
    setReviewedToday(true);
    setStreak(computeStreak(reviews));
  }, []);

  return { streak, reviewedToday, markReviewDone };
}
