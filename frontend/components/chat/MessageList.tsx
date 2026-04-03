"use client";

import { useEffect, useRef } from "react";
import { Message } from "@/hooks/useChat";
import { MessageBubble } from "./MessageBubble";

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-4 mt-24 px-6 text-center select-none">
      {/* Capsule illustration */}
      <div className="relative w-16 h-9 flex-shrink-0">
        <div className="absolute inset-0 rounded-full border-[2px] border-stone-200 bg-white" />
        <div className="absolute inset-y-0 left-1/2 right-0 rounded-r-full bg-stone-100 border-y-[2px] border-r-[2px] border-stone-200" />
        <div className="absolute inset-y-0 left-[calc(50%-1px)] w-px bg-stone-200" />
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="text-stone-600 text-sm font-medium">
          What do you want to capture?
        </p>
        <p className="text-stone-400 text-xs leading-relaxed max-w-[200px]">
          Tasks, ideas, questions, events — just type it in.
        </p>
      </div>
    </div>
  );
}

export function MessageList({ messages }: { messages: Message[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4">
      {messages.length === 0 && <EmptyState />}
      {messages.map((m) => (
        <MessageBubble key={m.id} message={m} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
