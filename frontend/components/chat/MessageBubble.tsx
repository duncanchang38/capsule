import type { Message } from "@/hooks/useChat";

interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
}

export function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
          isUser
            ? "bg-[#2f2f2f] text-[#ececec] rounded-br-sm"
            : "text-[#ececec] rounded-bl-sm"
        }`}
      >
        {message.content}
        {isStreaming && message.role === "assistant" && (
          <span className="inline-block w-0.5 h-4 bg-[#ececec] ml-0.5 align-text-bottom animate-pulse" />
        )}
      </div>
    </div>
  );
}
