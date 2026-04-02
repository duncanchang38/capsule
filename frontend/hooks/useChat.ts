"use client";

import { useState, useCallback, useRef } from "react";
import { streamChat } from "@/lib/api";

export interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const sessionId = useRef(`session-${Date.now()}`);

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

    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", text: "" },
    ]);

    try {
      for await (const { event, data } of streamChat(text, sessionId.current)) {
        if (event === "message" && typeof data.text === "string") {
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

  return { messages, loading, send };
}
