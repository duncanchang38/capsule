"use client";

import { use, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTopicCaptures } from "@/hooks/useTopicCaptures";
import { renameTopic } from "@/lib/api";
import { CaptureListRow } from "@/components/CaptureListRow";
import { useCaptures } from "@/hooks/useCaptures";

export default function TopicPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = use(params);
  const topic = decodeURIComponent(name);
  const router = useRouter();
  const { captures, loading, error, refresh } = useTopicCaptures(topic);
  const { markDone, deleteCapture, deferCapture, planToday } = useCaptures();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(topic);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = () => {
    setDraft(topic);
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const commit = async () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === topic) { setEditing(false); return; }
    setSaving(true);
    try {
      await renameTopic(topic, trimmed);
      router.replace(`/topics/${encodeURIComponent(trimmed)}`);
    } catch {
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") commit();
    if (e.key === "Escape") setEditing(false);
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto p-4 pt-6">
        <div className="h-8 w-40 bg-stone-100 animate-pulse rounded mb-2" />
        <div className="h-4 w-20 bg-stone-100 animate-pulse rounded mb-6" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-10 rounded-lg bg-stone-100 animate-pulse mb-2" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center mt-16 max-w-2xl mx-auto">
        <p className="text-stone-500 text-sm cursor-pointer hover:text-stone-700" onClick={refresh}>
          Couldn&apos;t load. Tap to retry.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 pt-6">
      <button
        onClick={() => router.back()}
        className="text-stone-400 hover:text-stone-700 transition-colors text-sm mb-4 block"
      >
        ←
      </button>

      {/* Editable topic name */}
      <div className="flex items-center gap-2 mb-1">
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={onKeyDown}
            disabled={saving}
            className="text-2xl font-bold text-stone-900 leading-tight bg-transparent border-b-2 border-stone-400 focus:outline-none focus:border-stone-700 w-full"
            autoFocus
          />
        ) : (
          <button
            onClick={startEdit}
            className="text-2xl font-bold text-stone-900 leading-tight hover:text-stone-600 transition-colors text-left"
            title="Rename topic"
          >
            {topic}
          </button>
        )}
        {saving && <span className="text-[11px] text-stone-400 italic flex-shrink-0">saving…</span>}
      </div>
      <p className="text-xs text-stone-400 mb-6">
        {captures.length} {captures.length === 1 ? "capture" : "captures"} · tap name to rename
      </p>

      {captures.length === 0 ? (
        <p className="text-sm text-stone-400">Nothing here yet.</p>
      ) : (
        <>
          <div className="bg-white border border-[#e8e4db] rounded-xl px-4 py-1">
            {captures.map((c) => (
              <CaptureListRow
                key={c.id}
                capture={c}
                handlers={{ onPlanToday: planToday, onDefer: deferCapture, onDone: markDone, onDelete: deleteCapture }}
                meta={
                  typeof c.metadata?.author === "string"
                    ? <p className="text-[10px] text-stone-400 mt-0.5">{c.metadata.author as string}</p>
                    : undefined
                }
              />
            ))}
          </div>
          {captures.length === 1 && (
            <p className="text-xs text-stone-400 mt-3">Only this one so far.</p>
          )}
        </>
      )}
    </div>
  );
}
