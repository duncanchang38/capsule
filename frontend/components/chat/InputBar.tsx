"use client";

import { useState, KeyboardEvent, useRef, useEffect } from "react";

interface Props {
  onSend: (text: string) => void;
  disabled?: boolean;
}

export function InputBar({ onSend, disabled }: Props) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea to content
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    // Reset height after clearing
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const hasValue = value.trim().length > 0;

  return (
    <div className="px-4 pb-5 pt-2 bg-white border-t border-[#e8e4db]">
      <div
        className="capsule-input flex items-end gap-1 bg-[#f7f5f0] rounded-[18px] border border-[#e8e4db] transition-[border-color,box-shadow] duration-150 max-w-2xl mx-auto pr-2 pb-2"
      >
        <textarea
          ref={textareaRef}
          className="flex-1 resize-none bg-transparent px-4 pt-3 pb-1 text-sm text-stone-800 placeholder-stone-400 focus:outline-none leading-relaxed min-h-[44px] max-h-40"
          placeholder="Drop something in…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          disabled={disabled}
        />
        <button
          onClick={submit}
          disabled={disabled || !hasValue}
          aria-label="Send"
          className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-[transform,opacity,background-color] duration-100 active:scale-[0.92] ${
            hasValue && !disabled
              ? "bg-stone-800 text-white hover:bg-stone-700"
              : "bg-stone-200 text-stone-400 cursor-not-allowed"
          }`}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path
              d="M8 13V3M3 8L8 3L13 8"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
      <p className="text-center text-[10px] text-stone-400 mt-2 max-w-2xl mx-auto">
        Enter to send · Shift+Enter for new line
      </p>
    </div>
  );
}
