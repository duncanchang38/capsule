"use client";

import { useState, KeyboardEvent } from "react";

interface Props {
  onSend: (text: string) => void;
  disabled?: boolean;
}

export function InputBar({ onSend, disabled }: Props) {
  const [value, setValue] = useState("");

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="border-t border-zinc-200 px-4 py-3 bg-white">
      <div className="flex items-end gap-2 max-w-2xl mx-auto">
        <textarea
          className="flex-1 resize-none border border-zinc-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 min-h-[44px] max-h-32"
          placeholder="Type anything..."
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          disabled={disabled}
        />
        <button
          onClick={submit}
          disabled={disabled || !value.trim()}
          className="px-4 py-2 bg-zinc-900 text-white rounded-xl text-sm disabled:opacity-40 hover:bg-zinc-700 transition-colors"
        >
          Send
        </button>
      </div>
    </div>
  );
}
