"use client";

import { useState, useCallback, useRef } from "react";
import { streamChat } from "@/lib/api";

export interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
}

export interface SavedCapture {
  type: "capture" | "bulk";
  id?: number;
  capture_type?: string;
  summary?: string;
  topic?: string | null;
  count?: number;
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [savedCapture, setSavedCapture] = useState<SavedCapture | null>(null);
  const sessionId = useRef(`session-${Date.now()}`);

  const clearSaved = useCallback(() => setSavedCapture(null), []);

  const send = useCallback(async (text: string) => {
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      text,
    };

    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    const assistantId = crypto.randomUUID();
    let accumulated = "";
    let hasAssistantMsg = false;

    try {
      for await (const { event, data } of streamChat(text, sessionId.current)) {
        if (event === "saved") {
          setSavedCapture(data as unknown as SavedCapture);
        }
        if (event === "message" && typeof data.text === "string") {
          if (!hasAssistantMsg) {
            hasAssistantMsg = true;
            setMessages((prev) => [
              ...prev,
              { id: assistantId, role: "assistant", text: "" },
            ]);
          }
          accumulated += data.text;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, text: accumulated } : m
            )
          );
        }
        if (event === "done") break;
      }
    } finally {
      setLoading(false);
    }
  }, []);

  return { messages, loading, send, savedCapture, clearSaved };
}
