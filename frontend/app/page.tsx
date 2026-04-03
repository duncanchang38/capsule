"use client";

import { useChat } from "@/hooks/useChat";
import { MessageList } from "@/components/chat/MessageList";
import { InputBar } from "@/components/chat/InputBar";

export default function Home() {
  const { messages, loading, send } = useChat();

  return (
    <div className="flex flex-col h-[calc(100vh-46px)] max-w-2xl mx-auto">
      <MessageList messages={messages} />
      <InputBar onSend={send} disabled={loading} />
    </div>
  );
}
