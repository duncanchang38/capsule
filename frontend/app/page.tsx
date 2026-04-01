"use client";

import { useChat } from "@/hooks/useChat";
import { MessageList } from "@/components/chat/MessageList";
import { InputBar } from "@/components/chat/InputBar";

export default function Home() {
  const { messages, isStreaming, sendMessage } = useChat();

  return (
    <div className="flex flex-col h-screen bg-[#212121] text-[#ececec]">
      <header className="text-center py-4 text-base font-semibold tracking-widest border-b border-[#2f2f2f]">
        Capsule
      </header>
      <MessageList messages={messages} isStreaming={isStreaming} />
      <InputBar onSend={sendMessage} disabled={isStreaming} />
    </div>
  );
}
