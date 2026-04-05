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
import { getCapture, updateNotes, organizeNotes, getCapturesByTopic, deleteCapture } from "@/lib/api";
import { TYPE_CONFIG } from "@/lib/typeConfig";
import type { Capture } from "@/lib/api";

const RELATED_TYPES = new Set(["to_learn", "to_cook", "to_know"]);

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
    if (!topic) { setLoading(false); return; }
    getCapturesByTopic(topic)
      .then((all) => setRelated(all.filter((c) => c.id !== capture.id).slice(0, 5)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [topic, capture.id]);

  if (!topic) return null;

  return (
    <div className="mt-10 pt-6 border-t border-stone-100">
      <h3 className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-3">
        Related · {topic}
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
          <Link href={`/topics/${encodeURIComponent(topic)}`}
            className="text-xs text-stone-400 hover:text-stone-600 mt-3 block transition-colors">
            See all {topic} →
          </Link>
        </>
      )}
    </div>
  );
}

export default function CaptureEditorPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);

  const [capture, setCapture] = useState<Capture | null>(null);
  const [loading, setLoading] = useState(true);
  const [organizing, setOrganizing] = useState(false);
  const [organizePreview, setOrganizePreview] = useState<string | null>(null);
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
    getCapture(id)
      .then((c) => {
        setCapture(c);
        if (editor) {
          const content = c.notes?.trim()
            ? c.notes
            : `<h1>${c.summary}</h1>`;
          editor.commands.setContent(content, false);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Set content once editor is ready and capture is loaded (race condition fallback)
  useEffect(() => {
    if (editor && capture && editor.state.doc.textContent.trim() === "") {
      const content = capture.notes?.trim() ? capture.notes : `<h1>${capture.summary}</h1>`;
      editor.commands.setContent(content, false);
    }
  }, [editor, capture]);

  const handleOrganize = async () => {
    if (!editor || editor.state.doc.textContent.trim() === "") return;
    setOrganizing(true);
    try {
      const organized = await organizeNotes(id);
      setOrganizePreview(organized);
    } catch { /* keep existing */ }
    finally { setOrganizing(false); }
  };

  const applyOrganize = () => {
    if (!editor || !organizePreview) return;
    editor.commands.setContent(organizePreview, false);
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
          <button onClick={handleOrganize} disabled={organizing || !editor || editor.isEmpty}
            className="text-[11px] text-stone-400 hover:text-stone-600 disabled:opacity-30 transition-colors" title="AI Organize">
            {organizing
              ? <span className="w-3 h-3 border border-stone-400 border-t-transparent rounded-full animate-spin inline-block" />
              : "✦"}
          </button>
        </div>
      </div>

      {/* Date + meta */}
      <div className="flex items-center justify-center gap-2 mb-6">
        <p className="text-xs text-stone-400">{formatDate(capture.created_at)}</p>
        {cfg && (
          <span className={`text-[10px] px-1.5 py-px rounded font-medium ${cfg.bgClass}`}>{cfg.label}</span>
        )}
        {capture.deadline && (
          <span className="text-[10px] text-stone-400">{capture.deadline}</span>
        )}
      </div>

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
              <p className="text-sm font-semibold text-stone-900">Preview</p>
              <p className="text-xs text-stone-400 mt-0.5">AI reorganized your notes. Replace existing content?</p>
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

function ToolbarBtn({ children, onClick, active, title }: {
  children: React.ReactNode; onClick?: () => void; active?: boolean; title?: string;
}) {
  return (
    <button onClick={onClick} title={title}
      className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${active ? "bg-stone-100 text-stone-800" : "text-stone-400 hover:text-stone-700 hover:bg-stone-50"}`}>
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
