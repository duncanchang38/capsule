"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Link2 from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import Typography from "@tiptap/extension-typography";
import { getCapture, updateNotes, updateCaptureSummary, updateCaptureType, suggestTitle, updateCaptureTags, getAllTags, getCaptureTags, getBacklinks } from "@/lib/api";
import { TYPE_CONFIG } from "@/lib/typeConfig";
import type { Capture } from "@/lib/api";

// ─── helpers ────────────────────────────────────────────────────────────────

function _isBareUrl(s: string): boolean {
  return /^https?:\/\/\S+$/.test(s.trim());
}

function _headingText(html: string): string | null {
  const m = html.match(/^<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i);
  if (!m) return null;
  return m[1].replace(/<[^>]+>/g, "").trim();
}

function buildEditorContent(notes: string | null | undefined, summary: string): string {
  const raw = notes?.trim() ?? "";
  if (!raw) return `<h1>${summary}</h1>`;
  if (/^<h[1-6][^>]*>\s*<\/h[1-6]>/i.test(raw))
    return raw.replace(/^(<h[1-6][^>]*>)\s*(<\/h[1-6]>)/i, `$1${summary}$2`);
  if (/^<h[1-6]/i.test(raw)) {
    const headingText = _headingText(raw);
    if (headingText && _isBareUrl(headingText))
      return raw.replace(/^(<h[1-6][^>]*>)[\s\S]*?(<\/h[1-6]>)/i, `$1${summary}$2`);
    return raw;
  }
  return `<h1>${summary}</h1>${raw}`;
}

function formatDate(raw: string): string {
  const d = new Date(raw.replace(" ", "T"));
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

const DEFAULT_WIDTH = 480;
const MIN_WIDTH = 320;
const MAX_WIDTH_RATIO = 0.92;

function getSavedWidth(): number {
  if (typeof window === "undefined") return DEFAULT_WIDTH;
  const saved = localStorage.getItem("capsule-drawer-width");
  return saved ? Math.max(MIN_WIDTH, parseInt(saved, 10)) : DEFAULT_WIDTH;
}

// ─── TypePicker ──────────────────────────────────────────────────────────────

const TYPE_OPTIONS = Object.entries(TYPE_CONFIG).filter(([k]) => k !== "inbox");

function TypePicker({ current, onSelect }: { current: string; onSelect: (type: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const cfg = TYPE_CONFIG[current as keyof typeof TYPE_CONFIG];

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`text-[10px] px-2 py-1 rounded-lg font-medium transition-all flex items-center gap-1 ${cfg?.bgClass ?? "bg-stone-100 text-stone-500"} hover:opacity-80 active:scale-95`}
        title="Change type"
      >
        {cfg?.displayLabel ?? current}
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" className="opacity-60">
          <path d="M1.5 3l2.5 2.5L6.5 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && (
        <div className="absolute top-full mt-1.5 left-0 bg-white border border-[#e8e4db] rounded-xl shadow-lg z-10 py-1 min-w-[140px]">
          {TYPE_OPTIONS.map(([key, tcfg]) => (
            <button
              key={key}
              onClick={() => { onSelect(key); setOpen(false); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-stone-50 transition-colors ${key === current ? "opacity-50 cursor-default" : ""}`}
            >
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: tcfg.color }} />
              <span className="text-xs text-stone-700">{tcfg.displayLabel}</span>
              {key === current && (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="ml-auto text-stone-400">
                  <path d="M2 5l2.5 2.5L8 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── DrawerContent — keyed per captureId so editor remounts fresh ─────────────

function DrawerContent({
  captureId,
  onClose,
  onSummaryChange,
}: {
  captureId: number;
  onClose: () => void;
  onSummaryChange?: (id: number, summary: string) => void;
}) {
  const router = useRouter();
  const [capture, setCapture] = useState<Capture | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [titleSuggest, setTitleSuggest] = useState<{ suggested: string; loading: boolean } | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [allTags, setAllTags] = useState<string[]>([]);
  const [backlinks, setBacklinks] = useState<import("@/lib/api").Capture[]>([]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const summaryRef = useRef<string>("");
  const captureIdRef = useRef(captureId);

  // Load capture and all tags on mount
  useEffect(() => {
    getCapture(captureId)
      .then((c) => {
        setCapture(c);
        summaryRef.current = c.summary;
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    getAllTags().then(setAllTags).catch(() => {});
    getBacklinks(captureId).then(setBacklinks).catch(() => {});
  }, [captureId]);

  const save = useCallback(async (html: string) => {
    setSaveStatus("saving");
    await updateNotes(captureIdRef.current, html);
    const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (h1Match) {
      const h1Text = h1Match[1].replace(/<[^>]+>/g, "").trim();
      if (h1Text && h1Text !== summaryRef.current) {
        summaryRef.current = h1Text;
        await updateCaptureSummary(captureIdRef.current, h1Text);
        setCapture((prev) => prev ? { ...prev, summary: h1Text } : prev);
      }
    }
    setSaveStatus("saved");
    setTimeout(() => setSaveStatus("idle"), 2000);
  }, []);

  const editorRef = useRef<Editor | null>(null);

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
        class: "prose prose-stone prose-base max-w-none focus:outline-none min-h-[200px]",
      },
    },
    onUpdate({ editor: e }) {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => save(e.getHTML()), 800);
    },
  });

  // Keep editorRef current so callbacks always have the latest editor
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  // Set content once capture loads
  useEffect(() => {
    if (editor && capture) {
      editor.commands.setContent(buildEditorContent(capture.notes, capture.summary));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capture]);

  // Flush pending save on unmount
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const handleTypeChange = useCallback(async (newType: string) => {
    setCapture((prev) => prev ? { ...prev, capture_type: newType } : prev);
    await updateCaptureType(captureId, newType);
  }, [captureId]);

  const handleSuggestTitle = useCallback(async () => {
    setTitleSuggest({ suggested: "", loading: true });
    try {
      const result = await suggestTitle(captureId);
      setTitleSuggest({ suggested: result.suggested, loading: false });
    } catch {
      setTitleSuggest(null);
    }
  }, [captureId]);

  const handleAcceptTitle = useCallback(async (title: string) => {
    setTitleSuggest(null);
    const ed = editorRef.current;
    let newHtml: string | undefined;
    if (ed) {
      const currentHtml = ed.getHTML();
      const h1Regex = /<h1[^>]*>[\s\S]*?<\/h1>/i;
      newHtml = h1Regex.test(currentHtml)
        ? currentHtml.replace(h1Regex, `<h1>${title}</h1>`)
        : `<h1>${title}</h1>${currentHtml}`;
      // setContent without emitUpdate — we save explicitly below via updateNotes
      ed.commands.setContent(newHtml);
      // Also persist the notes change immediately
      await updateNotes(captureIdRef.current, newHtml);
    }
    summaryRef.current = title;
    await updateCaptureSummary(captureIdRef.current, title);
    // Update both summary AND notes in local state so the capture-change useEffect
    // doesn't revert the editor back to the old H1 title.
    setCapture((prev) => prev ? { ...prev, summary: title, ...(newHtml ? { notes: newHtml } : {}) } : prev);
    onSummaryChange?.(captureIdRef.current, title);
  }, [onSummaryChange]);

  const currentTags = capture ? getCaptureTags(capture) : [];

  const handleAddTag = useCallback(async (tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed || !capture) return;
    const existing = getCaptureTags(capture);
    if (existing.includes(trimmed)) { setTagInput(""); return; }
    const next = [...existing, trimmed];
    setCapture((prev) => prev ? { ...prev, metadata: { ...prev.metadata, tags: next, topic: next[0] } } : prev);
    setTagInput("");
    await updateCaptureTags(captureIdRef.current, next);
    if (!allTags.includes(trimmed)) setAllTags((prev) => [...prev, trimmed].sort());
  }, [capture, allTags]);

  const handleRemoveTag = useCallback(async (tag: string) => {
    if (!capture) return;
    const next = getCaptureTags(capture).filter((t) => t !== tag);
    setCapture((prev) => prev ? { ...prev, metadata: { ...prev.metadata, tags: next, topic: next[0] ?? null } } : prev);
    await updateCaptureTags(captureIdRef.current, next);
  }, [capture]);

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[#e8e4db] flex-shrink-0">
        <button
          onClick={onClose}
          className="text-stone-400 hover:text-stone-700 transition-colors w-8 h-8 flex items-center justify-center rounded-lg hover:bg-stone-100"
          aria-label="Close"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>

        <div className="flex items-center gap-2 flex-1 justify-center">
          {capture && (
            <TypePicker current={capture.capture_type} onSelect={handleTypeChange} />
          )}
          {capture && (
            <span className="text-[10px] text-stone-400">{formatDate(capture.created_at)}</span>
          )}
          {saveStatus === "saving" && <span className="text-[10px] text-stone-300">saving…</span>}
          {saveStatus === "saved" && <span className="text-[10px] text-stone-300">saved</span>}
          {capture && !loading && !titleSuggest && (
            <button
              onClick={handleSuggestTitle}
              title="AI-suggest a better title"
              className="flex items-center gap-1 text-[10px] text-stone-400 hover:text-stone-700 transition-colors px-1.5 py-0.5 rounded-md hover:bg-stone-100"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M5 1v1.5M5 7.5V9M1 5h1.5M7.5 5H9M2.2 2.2l1.1 1.1M6.7 6.7l1.1 1.1M7.8 2.2L6.7 3.3M3.3 6.7L2.2 7.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
              Title
            </button>
          )}
        </div>

        <button
          onClick={() => router.push(`/captures/${captureId}`)}
          className="text-stone-400 hover:text-stone-700 transition-colors w-8 h-8 flex items-center justify-center rounded-lg hover:bg-stone-100"
          aria-label="Open full page"
          title="Open full page"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M8 2h4v4M12 2L7 7M6 3H3a1 1 0 00-1 1v7a1 1 0 001 1h7a1 1 0 001-1V8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      {/* Title suggestion strip */}
      {titleSuggest && (
        <div className="flex items-center gap-2 px-5 py-2 border-b border-[#e8e4db] bg-amber-50/60 flex-shrink-0 min-h-[36px]">
          {titleSuggest.loading ? (
            <span className="text-[11px] text-stone-400 flex items-center gap-1.5">
              <span className="w-3 h-3 border border-stone-300 border-t-stone-500 rounded-full animate-spin" />
              Thinking of a better title…
            </span>
          ) : (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-[11px] text-stone-500 flex-shrink-0">Rename to:</span>
              <span className="text-[11px] font-medium text-stone-800 flex-1 min-w-0 truncate">
                {titleSuggest.suggested}
              </span>
              <button
                onClick={() => handleAcceptTitle(titleSuggest.suggested)}
                className="text-[10px] text-emerald-600 hover:text-emerald-700 font-medium transition-colors flex-shrink-0"
              >
                Accept
              </button>
              <button
                onClick={() => setTitleSuggest(null)}
                className="text-[10px] text-stone-400 hover:text-stone-600 transition-colors flex-shrink-0"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tag bar */}
      {capture && !loading && (
        <div className="flex items-center gap-1.5 px-5 py-2 border-b border-[#e8e4db] flex-shrink-0 flex-wrap min-h-[38px]">
          {currentTags.map((tag) => (
            <span key={tag} className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 border border-stone-200">
              <a href={`/topics/${encodeURIComponent(tag)}`} className="hover:text-stone-900 transition-colors">{tag}</a>
              <button
                onClick={() => handleRemoveTag(tag)}
                className="text-stone-300 hover:text-stone-600 transition-colors leading-none"
                aria-label={`Remove ${tag}`}
              >×</button>
            </span>
          ))}
          <input
            type="text"
            value={tagInput}
            onChange={(e) => {
              const val = e.target.value;
              setTagInput(val);
              // Datalist selection fires onChange but not keydown — auto-add on exact match
              if (allTags.includes(val.trim())) handleAddTag(val.trim());
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") { e.preventDefault(); handleAddTag(tagInput); }
            }}
            onBlur={() => { if (tagInput.trim()) handleAddTag(tagInput); }}
            list="drawer-tag-suggestions"
            placeholder={currentTags.length === 0 ? "Add tag…" : "+"}
            className="text-[10px] bg-transparent outline-none text-stone-500 placeholder-stone-300 w-14 min-w-0"
          />
          <datalist id="drawer-tag-suggestions">
            {allTags.filter((t) => !currentTags.includes(t)).map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </div>
      )}

      {/* Body */}
      <div className="overflow-y-auto flex-1 px-5 py-4">
        {loading ? (
          <div className="flex flex-col gap-3 pt-2">
            <div className="h-7 w-3/4 bg-stone-200 animate-pulse rounded" />
            <div className="h-4 w-full bg-stone-100 animate-pulse rounded" />
            <div className="h-4 w-5/6 bg-stone-100 animate-pulse rounded" />
          </div>
        ) : (
          <EditorContent editor={editor} />
        )}

        {/* Backlinks panel */}
        {!loading && backlinks.length > 0 && (
          <div className="mt-8 pt-5 border-t border-[#e8e4db]">
            <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider mb-2.5">
              Linked — {backlinks.length}
            </p>
            <div className="flex flex-col gap-1">
              {backlinks.map((bl) => {
                const cfg = TYPE_CONFIG[bl.capture_type as keyof typeof TYPE_CONFIG];
                return (
                  <button
                    key={bl.id}
                    onClick={() => {
                      // Navigate to this capture's drawer by updating parent state isn't possible here
                      // Open full page instead
                      window.open(`/captures/${bl.id}`, "_blank");
                    }}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-stone-100 transition-colors text-left group"
                  >
                    <div
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: cfg?.color ?? "#a8a29e" }}
                    />
                    <span className="text-xs text-stone-700 group-hover:text-stone-900 truncate flex-1">
                      {bl.summary}
                    </span>
                    {getCaptureTags(bl).filter((t) => capture && getCaptureTags(capture).includes(t)).map((t) => (
                      <span key={t} className="text-[10px] text-stone-400 flex-shrink-0">#{t}</span>
                    ))}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <style>{`
        .ProseMirror .is-empty::before {
          content: attr(data-placeholder);
          color: #d6d3d1;
          pointer-events: none;
          float: left;
          height: 0;
        }
        .ProseMirror p { margin-top: 0.4em; margin-bottom: 0.4em; }
        .ProseMirror h1 {
          font-size: 1.6rem;
          font-weight: 700;
          margin-top: 0;
          margin-bottom: 0.2em;
          line-height: 1.25;
          color: #1c1917;
        }
        .ProseMirror h2 {
          font-size: 1.1rem;
          font-weight: 600;
          margin-top: 1.2em;
          margin-bottom: 0.3em;
          line-height: 1.35;
          color: #1c1917;
        }
        .ProseMirror h3 {
          font-size: 0.95rem;
          font-weight: 600;
          margin-top: 1em;
          margin-bottom: 0.25em;
          color: #44403c;
        }
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
        .ProseMirror ::selection { background-color: rgba(168, 131, 89, 0.18); color: inherit; }
      `}</style>
    </>
  );
}

// ─── CapturePreviewDrawer — outer shell handles animation only ────────────────

interface Props {
  captureId: number | null;
  onClose: () => void;
  onSummaryChange?: (id: number, summary: string) => void;
}

export function CapturePreviewDrawer({ captureId, onClose, onSummaryChange }: Props) {
  const [mounted, setMounted] = useState(false);
  const [drawerWidth, setDrawerWidth] = useState(DEFAULT_WIDTH);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(DEFAULT_WIDTH);

  useEffect(() => {
    // Read localStorage only on client to avoid hydration mismatch
    const saved = getSavedWidth();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved !== DEFAULT_WIDTH) setDrawerWidth(saved);
    setMounted(true);
  }, []);

  // Escape closes
  useEffect(() => {
    const handle = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [onClose]);

  // Resize drag
  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartWidth.current = drawerWidth;
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
  }, [drawerWidth]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = dragStartX.current - e.clientX;
      const maxW = Math.floor(window.innerWidth * MAX_WIDTH_RATIO);
      setDrawerWidth(Math.max(MIN_WIDTH, Math.min(maxW, dragStartWidth.current + delta)));
    };
    const onMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setDrawerWidth((w) => {
        localStorage.setItem("capsule-drawer-width", String(w));
        return w;
      });
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  if (!mounted) return null;

  const isOpen = captureId !== null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30"
        style={{
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? "auto" : "none",
          transition: "opacity 240ms cubic-bezier(0.16, 1, 0.3, 1)",
        }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Desktop: right panel */}
      <div
        role="dialog"
        aria-modal="true"
        style={{
          width: `${drawerWidth}px`,
          transform: isOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform 260ms cubic-bezier(0.16, 1, 0.3, 1)",
          visibility: isOpen ? "visible" : "hidden",
        }}
        className="fixed z-50 bg-[#f7f5f0] flex flex-col top-0 bottom-0 right-0 h-full border-l border-[#e8e4db] shadow-[-8px_0_32px_-8px_rgba(0,0,0,0.12)] hidden sm:flex"
      >
        {/* Resize handle */}
        <div
          onMouseDown={handleResizeMouseDown}
          className="absolute top-0 left-0 w-1 h-full cursor-ew-resize z-10 group"
        >
          <div className="absolute top-0 left-0 w-full h-full opacity-0 group-hover:opacity-100 transition-opacity bg-stone-300/50 rounded-r" />
        </div>

        {captureId !== null && (
          <DrawerContent key={captureId} captureId={captureId} onClose={onClose} onSummaryChange={onSummaryChange} />
        )}
      </div>

      {/* Mobile: bottom sheet */}
      <div
        role="dialog"
        aria-modal="true"
        style={{
          transform: isOpen ? "translateY(0)" : "translateY(100%)",
          transition: "transform 300ms cubic-bezier(0.16, 1, 0.3, 1)",
          visibility: isOpen ? "visible" : "hidden",
        }}
        className="fixed z-50 bg-[#f7f5f0] flex flex-col bottom-0 left-0 right-0 h-[82vh] rounded-t-2xl border-t border-[#e8e4db] shadow-[0_-8px_32px_-8px_rgba(0,0,0,0.15)] sm:hidden"
      >
        <div className="flex justify-center pt-2.5 pb-1 flex-shrink-0">
          <div className="w-8 h-1 rounded-full bg-stone-300" />
        </div>
        {captureId !== null && (
          <DrawerContent key={captureId} captureId={captureId} onClose={onClose} onSummaryChange={onSummaryChange} />
        )}
      </div>
    </>
  );
}
