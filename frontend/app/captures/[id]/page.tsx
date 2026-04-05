"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Link2 from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import Typography from "@tiptap/extension-typography";
import { getCapture, updateNotes, organizeNotes, getRelatedCaptures, updateCaptureStatus, deferCapture as deferCaptureApi, scheduleCapture, dismissMergeSuggestion, mergeCapture, reEnrich } from "@/lib/api";
import { TYPE_CONFIG } from "@/lib/typeConfig";
import type { Capture } from "@/lib/api";

const RELATED_TYPES = new Set(["to_learn", "to_cook", "to_know"]);

/** True if a string is a bare URL (http/https, no surrounding text). */
function _isBareUrl(s: string): boolean {
  return /^https?:\/\/\S+$/.test(s.trim());
}

/**
 * Extract the text content of the first heading tag, stripping inner HTML.
 * Returns null if the string doesn't start with a heading.
 */
function _headingText(html: string): string | null {
  const m = html.match(/^<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i);
  if (!m) return null;
  // Strip any inner tags (e.g. <a href="...">url</a>) to get plain text
  return m[1].replace(/<[^>]+>/g, "").trim();
}

/**
 * Build the initial editor HTML for a capture.
 * Rules (in priority order):
 *  1. No notes → <h1>summary</h1>
 *  2. Empty heading → inject summary into the heading
 *  3. Heading whose text is a bare URL → replace with summary (URL link stays in body)
 *  4. Heading with real content → use as-is
 *  5. No heading → prepend <h1>summary</h1>
 */
function buildEditorContent(notes: string | null | undefined, summary: string): string {
  const raw = notes?.trim() ?? "";
  if (!raw) return `<h1>${summary}</h1>`;

  // Empty heading at start → fill it with summary
  if (/^<h[1-6][^>]*>\s*<\/h[1-6]>/i.test(raw)) {
    return raw.replace(/^(<h[1-6][^>]*>)\s*(<\/h[1-6]>)/i, `$1${summary}$2`);
  }

  if (/^<h[1-6]/i.test(raw)) {
    const headingText = _headingText(raw);
    // Heading contains only a bare URL → swap it for the human summary
    if (headingText && _isBareUrl(headingText)) {
      return raw.replace(/^(<h[1-6][^>]*>)[\s\S]*?(<\/h[1-6]>)/i, `$1${summary}$2`);
    }
    // Heading has real content → use as-is
    return raw;
  }

  // No heading at all → prepend one
  return `<h1>${summary}</h1>${raw}`;
}

function formatDate(raw: string): string {
  const d = new Date(raw.replace(" ", "T"));
  return d.toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function RelatedSection({ capture }: { capture: Capture }) {
  const topic = capture.metadata?.topic as string | undefined;
  const [related, setRelated] = useState<Capture[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getRelatedCaptures(capture.id, 5)
      .then(setRelated)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [capture.id]);

  if (!loading && related.length === 0) return null;

  return (
    <div className="mt-10 pt-6 border-t border-stone-100">
      <h3 className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-3">
        {topic ? `Related · ${topic}` : "Related"}
      </h3>
      {loading ? (
        <div className="flex flex-col gap-2">
          {[1, 2].map((i) => <div key={i} className="h-8 rounded-lg bg-stone-100 animate-pulse" />)}
        </div>
      ) : related.length === 0 ? null : (
        <>
          <div className="flex flex-col gap-1">
            {related.map((c) => {
              const cfg = TYPE_CONFIG[c.capture_type as keyof typeof TYPE_CONFIG];
              return (
                <Link key={c.id} href={`/captures/${c.id}`}
                  className="flex items-start gap-3 py-2 rounded-lg hover:bg-stone-50 px-2 -mx-2 transition-colors">
                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5"
                    style={{ backgroundColor: cfg?.color ?? "#a8a29e" }} />
                  <p className="text-sm text-stone-700 leading-snug">{c.summary}</p>
                </Link>
              );
            })}
          </div>
          {topic && (
            <Link href={`/topics/${encodeURIComponent(topic)}`}
              className="text-xs text-stone-400 hover:text-stone-600 mt-3 block transition-colors">
              See all {topic} →
            </Link>
          )}
        </>
      )}
    </div>
  );
}

interface MergeSuggestion {
  capture_id: number;
  summary: string;
  topic?: string;
  reason: "topic_match" | "llm_similarity";
  detail?: string;
}

function MergeSuggestionBanner({
  captureId,
  suggestion,
  onDismiss,
  onMerged,
}: {
  captureId: number;
  suggestion: MergeSuggestion;
  onDismiss: () => void;
  onMerged: () => void;
}) {
  const [status, setStatus] = useState<"idle" | "merging" | "done" | "error">("idle");
  const router = useRouter();

  const handleMerge = async () => {
    setStatus("merging");
    try {
      await mergeCapture(captureId, suggestion.capture_id);
      setStatus("done");
      onMerged();
      setTimeout(() => router.replace(`/captures/${suggestion.capture_id}`), 800);
    } catch {
      setStatus("error");
    }
  };

  const handleDismiss = async () => {
    await dismissMergeSuggestion(captureId);
    onDismiss();
  };

  return (
    <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-amber-700 mb-0.5">Related capture found</p>
          <p className="text-xs text-amber-600 leading-snug">
            &ldquo;{suggestion.summary}&rdquo;
            {suggestion.topic && (
              <span className="ml-1 opacity-70">· {suggestion.topic}</span>
            )}
          </p>
          {suggestion.detail && (
            <p className="text-[10px] text-amber-500 mt-1">{suggestion.detail}</p>
          )}
        </div>
        <button
          onClick={handleDismiss}
          className="text-amber-300 hover:text-amber-500 flex-shrink-0 mt-0.5 transition-colors"
          aria-label="Dismiss"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
      {status === "error" && (
        <p className="text-[10px] text-red-500 mt-2">Something went wrong. Try again.</p>
      )}
      <div className="flex gap-2 mt-3">
        <Link
          href={`/captures/${suggestion.capture_id}`}
          className="flex-1 py-1.5 rounded-lg border border-amber-200 text-amber-700 text-xs font-medium text-center hover:bg-amber-100 transition-colors"
        >
          View
        </Link>
        <button
          onClick={handleMerge}
          disabled={status === "merging" || status === "done"}
          className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            status === "done"
              ? "bg-green-600 text-white"
              : "bg-amber-700 text-white hover:bg-amber-800 disabled:opacity-60"
          }`}
        >
          {status === "merging" ? "Merging…" : status === "done" ? "Merged ✓" : "Merge into it"}
        </button>
      </div>
    </div>
  );
}

function getLocalToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function CaptureEditorPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);

  const [capture, setCapture] = useState<Capture | null>(null);
  const [loading, setLoading] = useState(true);
  const [organizing, setOrganizing] = useState(false);
  const [actionStatus, setActionStatus] = useState<"idle" | "saving">("idle");
  const [organizePreview, setOrganizePreview] = useState<string | null>(null);
  const [organizeClusterSize, setOrganizeClusterSize] = useState(1);
  const [mergeSuggestion, setMergeSuggestion] = useState<MergeSuggestion | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [bubblePos, setBubblePos] = useState<{ top: number; left: number } | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(async (html: string) => {
    setSaveStatus("saving");
    await updateNotes(id, html);
    setSaveStatus("saved");
    setTimeout(() => setSaveStatus("idle"), 2000);
  }, [id]);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Link2.configure({ openOnClick: true, autolink: true }),
      Image.configure({ inline: false }),
      Typography,
      Placeholder.configure({
        showOnlyCurrent: false,
        placeholder: ({ node }) => {
          if (node.type.name === "heading") return "Title";
          return "Add a note…";
        },
      }),
    ],
    content: "<h1></h1>",
    editorProps: {
      attributes: {
        class: "prose prose-stone prose-base max-w-none focus:outline-none min-h-[300px]",
      },
    },
    onUpdate({ editor }) {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => save(editor.getHTML()), 800);
    },
    onSelectionUpdate({ editor }) {
      const { from, to } = editor.state.selection;
      if (from === to) { setBubblePos(null); return; }
      const view = editor.view;
      const start = view.coordsAtPos(from);
      const end = view.coordsAtPos(to);
      const editorEl = view.dom.getBoundingClientRect();
      setBubblePos({
        top: start.top - editorEl.top - 44,
        left: Math.max(0, (start.left + end.left) / 2 - editorEl.left - 80),
      });
    },
    onBlur() { setBubblePos(null); },
  });

  useEffect(() => {
    setLoading(true);
    setCapture(null);
    if (editor) editor.commands.clearContent();

    let enrichPollTimer: ReturnType<typeof setTimeout> | null = null;

    getCapture(id)
      .then((c) => {
        setCapture(c);
        setMergeSuggestion((c.metadata?.merge_suggestion as MergeSuggestion) ?? null);
        if (editor) {
          editor.commands.setContent(buildEditorContent(c.notes, c.summary));
        }
        // If enrichment hasn't finished yet (no topic), re-fetch after 4 s to pick
        // up the async-written metadata (topic, search_queries, link_title, etc.)
        const needsEnrichPoll =
          c.capture_type === "to_learn" &&
          !c.metadata?.topic &&
          !c.metadata?.search_queries;
        if (needsEnrichPoll) {
          enrichPollTimer = setTimeout(() => {
            getCapture(id).then((fresh) => {
              setCapture(fresh);
              setMergeSuggestion((fresh.metadata?.merge_suggestion as MergeSuggestion) ?? null);
            }).catch(() => {});
          }, 4000);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    return () => { if (enrichPollTimer) clearTimeout(enrichPollTimer); };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Set content once editor is ready and capture is loaded (race condition fallback)
  useEffect(() => {
    if (editor && capture && editor.state.doc.textContent.trim() === "") {
      editor.commands.setContent(buildEditorContent(capture.notes, capture.summary));
    }
  }, [editor, capture]);

  const handlePlanToday = async () => {
    if (!capture) return;
    setActionStatus("saving");
    const today = getLocalToday();
    await scheduleCapture(id, today, null, null);
    setCapture((prev) => prev ? { ...prev, deadline: today } : prev);
    setActionStatus("idle");
  };

  const handleDefer = async () => {
    if (!capture) return;
    setActionStatus("saving");
    await deferCaptureApi(id);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const deferTo = tomorrow.toISOString().slice(0, 10);
    setCapture((prev) => prev ? { ...prev, metadata: { ...prev.metadata, deferred_to: deferTo } } : prev);
    setActionStatus("idle");
  };

  const handleArchive = async () => {
    if (!capture) return;
    setActionStatus("saving");
    const cfg = TYPE_CONFIG[capture.capture_type as keyof typeof TYPE_CONFIG];
    const archiveStatus = cfg?.doneStatus || "done";
    await updateCaptureStatus(id, archiveStatus);
    setCapture((prev) => prev ? { ...prev, status: archiveStatus } : prev);
    setActionStatus("idle");
  };

  const handleReopen = async () => {
    if (!capture) return;
    setActionStatus("saving");
    await updateCaptureStatus(id, "active");
    setCapture((prev) => {
      if (!prev) return prev;
      const { deferred_to: _, ...restMeta } = prev.metadata as Record<string, unknown>;
      return { ...prev, status: "active", metadata: restMeta };
    });
    setActionStatus("idle");
  };

  const handleOrganize = async () => {
    if (!editor || editor.state.doc.textContent.trim() === "") return;
    setOrganizing(true);
    try {
      const result = await organizeNotes(id);
      setOrganizePreview(result.notes);
      setOrganizeClusterSize(result.cluster_size);
      if (result.merge_suggestion) {
        setMergeSuggestion(result.merge_suggestion as typeof mergeSuggestion);
      }
    } catch { /* keep existing */ }
    finally { setOrganizing(false); }
  };

  const applyOrganize = () => {
    if (!editor || !organizePreview) return;
    editor.commands.setContent(organizePreview);
    setOrganizePreview(null);
  };

  const handleImageUpload = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file || !editor) return;
      const reader = new FileReader();
      reader.onload = () => {
        editor.chain().focus().setImage({ src: reader.result as string }).run();
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }, [editor]);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 pt-6">
        <div className="h-3 w-24 bg-stone-100 animate-pulse rounded mb-6 mx-auto" />
        <div className="h-7 w-64 bg-stone-100 animate-pulse rounded mb-4" />
        <div className="h-48 bg-stone-100 animate-pulse rounded" />
      </div>
    );
  }

  if (!capture) {
    return (
      <div className="p-6 text-center mt-16 max-w-2xl mx-auto">
        <p className="text-stone-500 text-sm">Capture not found.</p>
        <button onClick={() => router.back()} className="text-stone-400 text-sm hover:text-stone-600 mt-1">← Go back</button>
      </div>
    );
  }

  const cfg = TYPE_CONFIG[capture.capture_type as keyof typeof TYPE_CONFIG];

  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 pb-24">
      {/* Nav */}
      <div className="flex items-center justify-between mb-8">
        <button onClick={() => router.back()} className="text-stone-400 hover:text-stone-700 text-sm transition-colors">←</button>
        <div className="flex items-center gap-3">
          {saveStatus === "saving" && <span className="text-[10px] text-stone-300">saving…</span>}
          {saveStatus === "saved" && <span className="text-[10px] text-stone-300">saved</span>}
        </div>
      </div>

      {/* Date + meta */}
      <div className="flex flex-col items-center gap-1.5 mb-6">
        <div className="flex items-center gap-2">
          <p className="text-xs text-stone-400">{formatDate(capture.created_at)}</p>
          {cfg && (
            <span className={`text-[10px] px-1.5 py-px rounded font-medium ${cfg.bgClass}`}>{cfg.label}</span>
          )}
          {capture.deadline && (
            <span className="text-[10px] text-stone-400">{capture.deadline}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {capture.metadata?.topic ? (
            <Link
              href={`/topics/${encodeURIComponent(capture.metadata.topic as string)}`}
              className="text-xs text-stone-400 hover:text-stone-700 transition-colors"
            >
              {capture.metadata.topic as string} →
            </Link>
          ) : (
            (capture.capture_type === "to_learn" || capture.capture_type === "to_know") && (
              <span className="text-xs text-stone-300 italic">no topic yet</span>
            )
          )}
          {(capture.capture_type === "to_learn" || capture.capture_type === "to_know") && (
            <button
              onClick={async () => {
                await reEnrich(id);
                // Poll after 4 s for the enrichment result
                setTimeout(() => {
                  getCapture(id).then((fresh) => {
                    setCapture(fresh);
                    setMergeSuggestion((fresh.metadata?.merge_suggestion as MergeSuggestion) ?? null);
                    if (editor && fresh.notes?.trim()) {
                      editor.commands.setContent(fresh.notes);
                    }
                  }).catch(() => {});
                }, 4000);
              }}
              title="Re-fetch title and topic"
              className="text-[10px] text-stone-300 hover:text-stone-500 transition-colors"
            >
              ↺
            </button>
          )}
        </div>
      </div>

      {/* Action bar — not shown for calendar or inbox types */}
      {capture.capture_type !== "calendar" && capture.capture_type !== "inbox" && (
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          {capture.status === "active" ? (
            <>
              {capture.deadline !== getLocalToday() && (
                <ActionPill
                  onClick={handlePlanToday}
                  disabled={actionStatus === "saving"}
                  label="Plan today"
                  icon={
                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                      <rect x="1.5" y="2.5" width="11" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
                      <path d="M4.5 1.5v2M9.5 1.5v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                      <path d="M1.5 6h11" stroke="currentColor" strokeWidth="1.3"/>
                      <path d="M7 9v2.5M5.75 10.25h2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                    </svg>
                  }
                />
              )}
              <ActionPill
                onClick={handleDefer}
                disabled={actionStatus === "saving"}
                label="Defer"
                icon={
                  <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                    <circle cx="7" cy="7.5" r="5" stroke="currentColor" strokeWidth="1.3"/>
                    <path d="M7 5v2.5l1.5 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M4.5 2h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                  </svg>
                }
              />
              <ActionPill
                onClick={handleArchive}
                disabled={actionStatus === "saving"}
                label="Archive"
                variant="ghost"
                icon={
                  <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                    <rect x="1.5" y="5" width="11" height="7.5" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
                    <path d="M1 3.5h12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                    <rect x="1" y="1.5" width="12" height="2" rx="1" stroke="currentColor" strokeWidth="1.3"/>
                    <path d="M5.5 9h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                  </svg>
                }
              />
            </>
          ) : (
            <ActionPill
              onClick={handleReopen}
              disabled={actionStatus === "saving"}
              label="↩ Reopen"
            />
          )}
          {actionStatus === "saving" && (
            <span className="text-[10px] text-stone-300 italic">Saving…</span>
          )}
        </div>
      )}

      {/* to_know / to_learn: AI answer + search chips */}
      {(capture.capture_type === "to_know" || capture.capture_type === "to_learn") &&
        (capture.metadata?.answer || (capture.metadata?.search_queries as string[] | undefined)?.length) && (
        <div className="mb-5 rounded-xl border border-stone-100 bg-stone-50 px-4 py-3 space-y-3">
          {!!capture.metadata?.answer && (
            <div>
              <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider mb-1">AI Answer</p>
              <p className="text-sm text-stone-700 leading-snug whitespace-pre-wrap">
                {capture.metadata.answer as string}
              </p>
            </div>
          )}
          {((capture.metadata?.search_queries as string[] | undefined) ?? []).length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider mb-2">Search</p>
              <div className="flex flex-wrap gap-1.5">
                {(capture.metadata.search_queries as string[]).map((q, i) => (
                  <a
                    key={i}
                    href={`https://www.google.com/search?q=${encodeURIComponent(q)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border border-stone-200 text-xs text-stone-600 hover:bg-stone-100 hover:border-stone-300 transition-colors"
                  >
                    {q}
                    <svg width="9" height="9" viewBox="0 0 9 9" fill="none" className="text-stone-300 flex-shrink-0">
                      <path d="M2 1h6v6M8 1L1 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                    </svg>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Merge suggestion */}
      {mergeSuggestion && (
        <MergeSuggestionBanner
          captureId={id}
          suggestion={mergeSuggestion}
          onDismiss={() => setMergeSuggestion(null)}
          onMerged={() => setMergeSuggestion(null)}
        />
      )}

      {/* Editor */}
      <div className="relative">
        {editor && bubblePos && (
          <div
            className="absolute z-50 flex items-center gap-0.5 bg-stone-900 rounded-lg px-1.5 py-1 shadow-lg"
            style={{ top: bubblePos.top, left: bubblePos.left }}
            onMouseDown={(e) => e.preventDefault()}
          >
            <BubbleBtn active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} label="B" bold />
            <BubbleBtn active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} label="I" italic />
            <BubbleBtn active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()} label="S" strike />
            <div className="w-px h-4 bg-stone-700 mx-1" />
            <BubbleBtn active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} label="H1" />
            <BubbleBtn active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} label="H2" />
            <div className="w-px h-4 bg-stone-700 mx-1" />
            <BubbleBtn active={editor.isActive("link")} onClick={() => {
              const url = window.prompt("URL");
              if (url) editor.chain().focus().setLink({ href: url }).run();
              else if (editor.isActive("link")) editor.chain().focus().unsetLink().run();
            }} label="↗" />
          </div>
        )}
        <EditorContent editor={editor} />
      </div>

      {/* Bottom toolbar */}
      <div className="fixed bottom-16 left-0 right-0 flex justify-center pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-1 bg-white border border-[#e8e4db] rounded-2xl px-3 py-2 shadow-sm">
          <ToolbarBtn onClick={() => editor?.chain().focus().toggleBulletList().run()}
            active={editor?.isActive("bulletList")} title="List">
            <ListIcon />
          </ToolbarBtn>
          <ToolbarBtn onClick={() => editor?.chain().focus().toggleOrderedList().run()}
            active={editor?.isActive("orderedList")} title="Numbered">
            <OListIcon />
          </ToolbarBtn>
          <ToolbarBtn onClick={() => editor?.chain().focus().toggleTaskList().run()}
            active={editor?.isActive("taskList")} title="Checklist">
            <CheckIcon />
          </ToolbarBtn>
          <div className="w-px h-4 bg-stone-200 mx-0.5" />
          <ToolbarBtn onClick={handleImageUpload} title="Image">
            <ImgIcon />
          </ToolbarBtn>
          <ToolbarBtn onClick={() => editor?.chain().focus().toggleBlockquote().run()}
            active={editor?.isActive("blockquote")} title="Quote">
            <QuoteIcon />
          </ToolbarBtn>
          <ToolbarBtn onClick={() => editor?.chain().focus().toggleCode().run()}
            active={editor?.isActive("code")} title="Code">
            <CodeIcon />
          </ToolbarBtn>
          <div className="w-px h-4 bg-stone-200 mx-0.5" />
          <ToolbarBtn onClick={handleOrganize} disabled={organizing || !editor || editor.isEmpty} title="AI Organize">
            {organizing
              ? <span className="w-3 h-3 border border-stone-400 border-t-transparent rounded-full animate-spin inline-block" />
              : <span className="text-[11px] leading-none">✦</span>}
          </ToolbarBtn>
        </div>
      </div>

      {RELATED_TYPES.has(capture.capture_type) && <RelatedSection capture={capture} />}

      {/* AI Organize confirmation */}
      {organizePreview && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px]" onClick={() => setOrganizePreview(null)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-[0_-8px_40px_rgba(0,0,0,0.12)] border-t border-[#e8e4db] max-h-[70vh] flex flex-col"
            style={{ animation: "drawerSlideUp 280ms ease-out both" }}>
            <div className="flex justify-center pt-3 pb-2 flex-shrink-0">
              <div className="w-8 h-1 rounded-full bg-stone-200" />
            </div>
            <div className="px-5 pb-3 flex-shrink-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-stone-900">Preview</p>
                {organizeClusterSize > 1 && (
                  <span className="text-[10px] px-1.5 py-px rounded-full bg-amber-100 text-amber-700 font-medium">
                    {organizeClusterSize} captures synthesized
                  </span>
                )}
              </div>
              <p className="text-xs text-stone-400 mt-0.5">
                {organizeClusterSize > 1
                  ? "AI synthesized related captures into one document."
                  : "AI reorganized your notes."}
                {" "}Replace existing content?
              </p>
            </div>
            <div className="h-px bg-[#f0ede7] flex-shrink-0" />
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div
                className="prose prose-stone prose-sm max-w-none text-stone-700"
                dangerouslySetInnerHTML={{ __html: organizePreview }}
              />
            </div>
            <div className="px-5 py-4 flex gap-3 flex-shrink-0 border-t border-[#f0ede7]">
              <button onClick={() => setOrganizePreview(null)}
                className="flex-1 py-2.5 rounded-xl border border-[#e8e4db] text-stone-600 text-sm font-medium hover:bg-stone-50 transition-colors">
                Keep original
              </button>
              <button onClick={applyOrganize}
                className="flex-1 py-2.5 rounded-xl bg-stone-900 text-white text-sm font-medium hover:bg-stone-700 transition-colors">
                Apply
              </button>
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes drawerSlideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .ProseMirror .is-empty::before {
          content: attr(data-placeholder);
          color: #d6d3d1;
          pointer-events: none;
          float: left;
          height: 0;
        }
        .ProseMirror p { margin-top: 0.4em; margin-bottom: 0.4em; }
        .ProseMirror h1 { margin-bottom: 0.5em; }
        .ProseMirror ul[data-type="taskList"] { list-style: none; padding: 0; }
        .ProseMirror ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 8px; }
        .ProseMirror ul[data-type="taskList"] li > label { margin-top: 2px; flex-shrink: 0; }
        .ProseMirror ul[data-type="taskList"] li > label input[type="checkbox"] {
          width: 16px; height: 16px; cursor: pointer; accent-color: #1c1917;
        }
        .ProseMirror ul[data-type="taskList"] li[data-checked="true"] > div { text-decoration: line-through; opacity: 0.5; }
        .ProseMirror a { color: #3b82f6; text-decoration: underline; }
        .ProseMirror img { max-width: 100%; border-radius: 8px; margin: 8px 0; }
        .ProseMirror blockquote { border-left: 3px solid #e7e5e4; padding-left: 16px; color: #78716c; }
      `}</style>
    </div>
  );
}

function ActionPill({
  icon,
  label,
  onClick,
  disabled,
  variant = "default",
}: {
  icon?: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "ghost";
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors disabled:opacity-40 active:scale-[0.97] ${
        variant === "ghost"
          ? "border-stone-200 text-stone-400 hover:text-stone-600 hover:bg-stone-50"
          : "border-stone-200 text-stone-600 hover:bg-stone-50"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function BubbleBtn({ active, onClick, label, bold, italic, strike }: {
  active: boolean; onClick: () => void; label: string;
  bold?: boolean; italic?: boolean; strike?: boolean;
}) {
  return (
    <button onClick={onClick}
      className={`px-2 py-0.5 rounded text-xs transition-colors ${active ? "bg-white text-stone-900" : "text-stone-400 hover:text-white"} ${bold ? "font-bold" : ""} ${italic ? "italic" : ""} ${strike ? "line-through" : ""}`}>
      {label}
    </button>
  );
}

function ToolbarBtn({ children, onClick, active, disabled, title }: {
  children: React.ReactNode; onClick?: () => void; active?: boolean; disabled?: boolean; title?: string;
}) {
  return (
    <button onClick={onClick} title={title} disabled={disabled}
      className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${active ? "bg-stone-100 text-stone-800" : "text-stone-400 hover:text-stone-700 hover:bg-stone-50"} disabled:opacity-40 disabled:cursor-not-allowed`}>
      {children}
    </button>
  );
}

// SVG icons
const ListIcon = () => <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M2.5 4h10M2.5 7.5h10M2.5 11h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>;
const OListIcon = () => <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M5.5 4h7M5.5 7.5h7M5.5 11h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><text x="1.5" y="5" fontSize="4" fill="currentColor">1</text><text x="1.5" y="8.5" fontSize="4" fill="currentColor">2</text><text x="1.5" y="12" fontSize="4" fill="currentColor">3</text></svg>;
const CheckIcon = () => <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><rect x="2" y="3.5" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.2"/><path d="M3 5.5l1 1 2-2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/><path d="M8.5 5.5h4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><rect x="2" y="9.5" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.2"/><path d="M8.5 11.5h4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>;
const ImgIcon = () => <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><rect x="1.5" y="2.5" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><circle cx="5" cy="5.5" r="1" fill="currentColor"/><path d="M1.5 10l3.5-3 2.5 2.5 2-2 3.5 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>;
const QuoteIcon = () => <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M3 5.5C3 4.12 4.12 3 5.5 3H6v1.5h-.5C4.95 4.5 4.5 4.95 4.5 5.5V6H6v3H3V5.5zM8 5.5C8 4.12 9.12 3 10.5 3H11v1.5h-.5c-.55 0-1 .45-1 1V6H11v3H8V5.5z" fill="currentColor"/></svg>;
const CodeIcon = () => <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M9.5 3.5l3 4-3 4M5.5 3.5l-3 4 3 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
