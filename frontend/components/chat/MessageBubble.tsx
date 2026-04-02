import { Message } from "@/hooks/useChat";

export function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-3`}>
      <div
        className={`max-w-[75%] px-4 py-2 rounded-2xl text-sm leading-relaxed ${
          isUser
            ? "bg-zinc-800 text-white rounded-br-sm"
            : "bg-zinc-100 text-zinc-900 rounded-bl-sm"
        }`}
      >
        {message.text || <span className="opacity-40">...</span>}
      </div>
    </div>
  );
}
