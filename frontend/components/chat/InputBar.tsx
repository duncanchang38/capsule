"use client";

import { useState, useRef, type KeyboardEvent } from "react";

interface InputBarProps {
  onSend: (content: string) => void;
  disabled?: boolean;
}

export function InputBar({ onSend, disabled }: InputBarProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    const content = value.trim();
    if (!content || disabled) return;
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    onSend(content);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  return (
    <div className="border-t border-[#2f2f2f] px-4 py-4">
      <div className="max-w-3xl mx-auto flex items-end gap-2 bg-[#2f2f2f] rounded-2xl px-4 py-3">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          rows={1}
          placeholder="Type anything..."
          className="flex-1 bg-transparent outline-none text-[#ececec] text-sm placeholder-[#666] resize-none max-h-40 leading-relaxed"
        />
        <button
          onClick={handleSend}
          disabled={disabled || !value.trim()}
          className="w-8 h-8 bg-[#ececec] rounded-lg flex items-center justify-center flex-shrink-0 hover:bg-[#ccc] disabled:bg-[#444] disabled:cursor-default transition-colors"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="#212121"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-4 h-4"
          >
            <line x1="12" y1="19" x2="12" y2="5" />
            <polyline points="5 12 12 5 19 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
