"use client";

import { useState, useRef } from "react";
import ReactMarkdown from "react-markdown";

async function callOrganize(text: string): Promise<string> {
  const res = await fetch("/api/organize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error("Request failed");
  const data = await res.json();
  return data.organized as string;
}

export default function OrganizePage() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleOrganize = async () => {
    if (!input.trim() || loading) return;
    setLoading(true);
    setOutput(null);
    try {
      const result = await callOrganize(input.trim());
      setOutput(result);
    } catch {
      setOutput("Something went wrong — try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!output) return;
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleReset = () => {
    setOutput(null);
    setInput("");
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  return (
    <div className="max-w-3xl mx-auto p-4 pt-6">
      <div className="mb-5">
        <h1 className="text-base font-semibold text-zinc-900">Organize</h1>
        <p className="text-sm text-zinc-400 mt-0.5">
          Paste anything — stream of consciousness, bullet dump, rough notes. Get back structured markdown.
        </p>
      </div>

      {!output ? (
        <div className="flex flex-col gap-3">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Dump your thoughts here..."
            className="w-full min-h-[280px] p-3 text-sm text-zinc-800 bg-white border border-zinc-200 rounded-xl resize-y focus:outline-none focus:ring-2 focus:ring-zinc-300 placeholder:text-zinc-400"
            autoFocus
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-400">{input.length} / 10,000</span>
            <button
              onClick={handleOrganize}
              disabled={!input.trim() || loading}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-zinc-900 text-white disabled:opacity-40 hover:bg-zinc-700 transition-colors"
            >
              {loading ? "Organizing…" : "Organize →"}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {/* Toolbar */}
          <div className="flex items-center justify-between">
            <button
              onClick={handleReset}
              className="text-sm text-zinc-400 hover:text-zinc-600 transition-colors"
            >
              ← Start over
            </button>
            <button
              onClick={handleCopy}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border border-zinc-200 text-zinc-600 hover:bg-zinc-50 transition-colors"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>

          {/* Organized output */}
          <div className="bg-white border border-zinc-200 rounded-xl p-5 prose prose-sm prose-zinc max-w-none">
            <ReactMarkdown>{output}</ReactMarkdown>
          </div>

          {/* Original */}
          <details className="mt-1">
            <summary className="text-xs text-zinc-400 cursor-pointer select-none hover:text-zinc-600">
              Show original
            </summary>
            <pre className="mt-2 text-xs text-zinc-500 whitespace-pre-wrap bg-zinc-50 rounded-lg p-3 leading-relaxed">
              {input}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}
