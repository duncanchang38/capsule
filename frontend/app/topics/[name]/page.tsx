"use client";

import { use, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTopicCaptures } from "@/hooks/useTopicCaptures";
import { renameTopic, getCaptureTags } from "@/lib/api";
import { CaptureListRow } from "@/components/CaptureListRow";
import { CapturePreviewDrawer } from "@/components/CapturePreviewDrawer";
import { useCaptures } from "@/hooks/useCaptures";
import { TYPE_CONFIG } from "@/lib/typeConfig";
import type { Capture } from "@/lib/api";

// Ordered sections for the MOC view
const MOC_SECTIONS: { key: string; label: string; types: string[] }[] = [
  { key: "projects",  label: "Projects",          types: ["project"] },
  { key: "ideas",     label: "Ideas",             types: ["to_cook"] },
  { key: "learning",  label: "Reading & Research", types: ["to_learn"] },
  { key: "questions", label: "Questions",          types: ["to_know"] },
  { key: "tasks",     label: "Tasks",              types: ["to_hit"] },
  { key: "events",    label: "Events",             types: ["calendar"] },
];

function getRelatedTags(captures: Capture[], currentTag: string): string[] {
  const freq: Record<string, number> = {};
  for (const c of captures) {
    for (const t of getCaptureTags(c)) {
      if (t !== currentTag) freq[t] = (freq[t] ?? 0) + 1;
    }
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([t]) => t);
}

export default function TopicPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = use(params);
  const topic = decodeURIComponent(name);
  const router = useRouter();
  const { captures, loading, error, refresh } = useTopicCaptures(topic);
  const { markDone, deleteCapture, deferCapture, planToday, patchSummary } = useCaptures();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(topic);
  const [saving, setSaving] = useState(false);
  const [previewId, setPreviewId] = useState<number | null>(null);
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

  const relatedTags = getRelatedTags(captures, topic);

  return (
    <div className="max-w-2xl mx-auto p-4 pt-6 pb-20">
      <button
        onClick={() => router.back()}
        className="text-stone-400 hover:text-stone-700 transition-colors text-sm mb-4 block"
      >
        ←
      </button>

      {/* Header */}
      <div className="mb-4">
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
        <p className="text-xs text-stone-400">
          {captures.length} {captures.length === 1 ? "capture" : "captures"} · tap name to rename
        </p>
      </div>

      {/* Related tags row */}
      {relatedTags.length > 0 && (
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          <span className="text-[10px] text-stone-400 flex-shrink-0">Also in:</span>
          {relatedTags.map((t) => (
            <Link
              key={t}
              href={`/topics/${encodeURIComponent(t)}`}
              className="text-[11px] px-2.5 py-0.5 rounded-full bg-stone-100 text-stone-600 border border-stone-200 hover:bg-stone-200 transition-colors"
            >
              {t}
            </Link>
          ))}
        </div>
      )}

      {captures.length === 0 ? (
        <p className="text-sm text-stone-400">Nothing here yet.</p>
      ) : (
        <div className="flex flex-col gap-6">
          {MOC_SECTIONS.map(({ key, label, types }) => {
            const sectionCaptures = captures.filter((c) => types.includes(c.capture_type));
            if (sectionCaptures.length === 0) return null;
            return (
              <section key={key}>
                <div className="flex items-center gap-2 mb-2">
                  {types.map((t) => {
                    const cfg = TYPE_CONFIG[t as keyof typeof TYPE_CONFIG];
                    return cfg ? (
                      <div key={t} className="w-2 h-2 rounded-full" style={{ backgroundColor: cfg.color }} />
                    ) : null;
                  })}
                  <h2 className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider">{label}</h2>
                  <span className="text-[10px] text-stone-300">{sectionCaptures.length}</span>
                </div>
                <div className="bg-white border border-[#e8e4db] rounded-xl px-4 py-1">
                  {sectionCaptures.map((c) => (
                    <CaptureListRow
                      key={c.id}
                      capture={c}
                      handlers={{ onPlanToday: planToday, onDefer: deferCapture, onDone: markDone, onDelete: deleteCapture }}
                      onPreview={(cap) => setPreviewId(cap.id)}
                      meta={
                        typeof c.metadata?.author === "string"
                          ? <p className="text-[10px] text-stone-400 mt-0.5">{c.metadata.author as string}</p>
                          : undefined
                      }
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <CapturePreviewDrawer
        captureId={previewId}
        onClose={() => setPreviewId(null)}
        onSummaryChange={patchSummary}
      />
    </div>
  );
}
