"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { getCapture, updateNotes, organizeNotes } from "@/lib/api";
import { TYPE_CONFIG } from "@/lib/typeConfig";
import type { Capture } from "@/lib/api";

export default function CaptureEditorPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);

  const [capture, setCapture] = useState<Capture | null>(null);
  const [notes, setNotes] = useState("");
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [organizing, setOrganizing] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved">("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    getCapture(id)
      .then((c) => {
        setCapture(c);
        setNotes(c.notes ?? "");
      })
      .catch(() => {/* 404 — handled below */})
      .finally(() => setLoading(false));
  }, [id]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";
    }
  }, [notes, mode]);

  const save = useCallback(async (value: string) => {
    setSaving(true);
    await updateNotes(id, value);
    setSaving(false);
    setSaveStatus("saved");
    setTimeout(() => setSaveStatus("idle"), 2000);
  }, [id]);

  const handleChange = (value: string) => {
    setNotes(value);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save(value), 800);
  };

  const handleOrganize = async () => {
    if (!notes.trim()) return;
    setOrganizing(true);
    try {
      const organized = await organizeNotes(id);
      setNotes(organized);
    } catch {
      // keep existing notes
    } finally {
      setOrganizing(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto p-4 pt-6">
        <div className="h-6 w-48 bg-stone-100 animate-pulse rounded mb-4" />
        <div className="h-64 bg-stone-100 animate-pulse rounded-xl" />
      </div>
    );
  }

  if (!capture) {
    return (
      <div className="p-6 text-center mt-16 max-w-2xl mx-auto">
        <p className="text-stone-500 text-sm">Capture not found.</p>
        <button onClick={() => router.back()} className="text-stone-400 text-sm hover:text-stone-600 mt-1">
          ← Go back
        </button>
      </div>
    );
  }

  const cfg = TYPE_CONFIG[capture.capture_type as keyof typeof TYPE_CONFIG];

  return (
    <div className="max-w-2xl mx-auto p-4 pt-6">
      {/* Back + type badge */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => router.back()}
          className="text-stone-400 hover:text-stone-700 transition-colors text-sm"
        >
          ←
        </button>
        {cfg && (
          <span className={`text-[10px] px-1.5 py-px rounded font-medium ${cfg.bgClass}`}>
            {cfg.label}
          </span>
        )}
        {capture.deadline && (
          <span className="text-[10px] text-stone-400">{capture.deadline}</span>
        )}
      </div>

      {/* Title */}
      <h1 className="text-lg font-semibold text-stone-900 leading-snug mb-6">
        {capture.summary}
      </h1>

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1 bg-stone-100 rounded-lg p-0.5">
          {(["edit", "preview"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors capitalize ${
                mode === m ? "bg-white text-stone-900 shadow-sm" : "text-stone-400 hover:text-stone-600"
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          {saveStatus === "saved" && (
            <span className="text-[10px] text-stone-300">saved</span>
          )}
          {saving && (
            <span className="text-[10px] text-stone-300">saving…</span>
          )}
          <button
            onClick={handleOrganize}
            disabled={organizing || !notes.trim()}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-[#e8e4db] text-stone-600 hover:bg-stone-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {organizing ? (
              <>
                <span className="w-3 h-3 border border-stone-400 border-t-transparent rounded-full animate-spin" />
                Organizing…
              </>
            ) : (
              <>✦ AI Organize</>
            )}
          </button>
        </div>
      </div>

      {/* Editor / Preview */}
      {mode === "edit" ? (
        <textarea
          ref={textareaRef}
          value={notes}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={getPlaceholder(capture.capture_type)}
          className="w-full min-h-[300px] resize-none bg-white border border-[#e8e4db] rounded-xl p-4 text-sm text-stone-800 leading-relaxed placeholder-stone-300 focus:outline-none focus:border-stone-400 transition-colors font-mono"
        />
      ) : (
        <div className="min-h-[300px] bg-white border border-[#e8e4db] rounded-xl p-4">
          {notes.trim() ? (
            <div className="prose prose-stone prose-sm max-w-none">
              <ReactMarkdown>{notes}</ReactMarkdown>
            </div>
          ) : (
            <p className="text-stone-300 text-sm italic">Nothing written yet.</p>
          )}
        </div>
      )}

      <p className="mt-3 text-[10px] text-stone-300">
        Markdown supported · auto-saves as you type
      </p>
    </div>
  );
}

function getPlaceholder(captureType: string): string {
  switch (captureType) {
    case "to_learn":
      return "Add quotes, key ideas, what you want to remember…";
    case "to_cook":
      return "What's the core insight? What would make this real? What's the first step?";
    case "to_hit":
      return "Sub-tasks, context, what you need to know to get this done…";
    case "to_know":
      return "What have you found so far? What's the answer?";
    default:
      return "Write anything…";
  }
}
