import { Message } from "@/hooks/useChat";

function LoadingDots() {
  return (
    <span className="flex gap-1 items-center h-4 py-0.5">
      {[0, 160, 320].map((delay) => (
        <span
          key={delay}
          className="w-1.5 h-1.5 rounded-full bg-stone-300 animate-bounce"
          style={{ animationDelay: `${delay}ms`, animationDuration: "1s" }}
        />
      ))}
    </span>
  );
}

export function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-2.5`}>
      <div
        className={`msg-bubble max-w-[78%] px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? "bg-stone-800 text-white rounded-2xl rounded-br-[6px]"
            : "bg-white text-stone-800 rounded-2xl rounded-bl-[6px] border border-[#e8e4db] shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
        }`}
      >
        {message.text || <LoadingDots />}
      </div>
    </div>
  );
}
