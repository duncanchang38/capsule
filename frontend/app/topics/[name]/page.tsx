"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTopicCaptures } from "@/hooks/useTopicCaptures";
import { TYPE_CONFIG } from "@/lib/typeConfig";
import type { Capture } from "@/lib/api";

function CaptureRow({ capture }: { capture: Capture }) {
  const cfg = TYPE_CONFIG[capture.capture_type as keyof typeof TYPE_CONFIG];
  return (
    <Link
      href={`/captures/${capture.id}`}
      className="flex items-start gap-3 py-2.5 border-b border-stone-50 last:border-0 hover:bg-stone-50 rounded-lg px-2 -mx-2 transition-colors"
    >
      <div
        className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5"
        style={{ backgroundColor: cfg?.color ?? "#a8a29e" }}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-stone-800 leading-snug">{capture.summary}</p>
        {typeof capture.metadata?.author === "string" && (
          <p className="text-[10px] text-stone-400 mt-0.5">{capture.metadata.author}</p>
        )}
      </div>
      {capture.notes && (
        <span className="text-[10px] text-stone-300 flex-shrink-0" title="Has notes">✦</span>
      )}
    </Link>
  );
}

export default function TopicPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = use(params);
  const topic = decodeURIComponent(name);
  const router = useRouter();
  const { captures, loading, error, refresh } = useTopicCaptures(topic);

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
        <p
          className="text-stone-500 text-sm cursor-pointer hover:text-stone-700"
          onClick={refresh}
        >
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

      <h1 className="text-2xl font-bold text-stone-900 leading-tight">{topic}</h1>
      <p className="text-xs text-stone-400 mt-1 mb-6">
        {captures.length} {captures.length === 1 ? "capture" : "captures"}
      </p>

      {captures.length === 0 ? (
        <p className="text-sm text-stone-400">Nothing here yet.</p>
      ) : (
        <>
          <div className="bg-white border border-[#e8e4db] rounded-xl px-4 py-1">
            {captures.map((c) => (
              <CaptureRow key={c.id} capture={c} />
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
