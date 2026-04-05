"use client";

import { useState, useCallback, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Link2 from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import Typography from "@tiptap/extension-typography";
import { saveCapture, type SaveResult } from "@/lib/api";
import { TYPE_CONFIG } from "@/lib/typeConfig";
import Link from "next/link";

type SaveState = "idle" | "saving" | "saved" | "error";

export default function Home() {
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [savedResult, setSavedResult] = useState<SaveResult | null>(null);
  const [hasContent, setHasContent] = useState(false);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    onUpdate({ editor }) {
      setHasContent(editor.state.doc.textContent.trim().length > 0);
    },
  });

  const handleSave = useCallback(async () => {
    if (!editor) return;
    setSaveState("saving");

    const html = editor.getHTML();
    // Plain text for AI classification
    const text = editor.state.doc.textContent.trim();

    try {
      const result = await saveCapture(text, html);
      setSavedResult(result);
      setSaveState("saved");
      editor.commands.setContent("<h1></h1>");

      // Auto-dismiss after 6s
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
      dismissTimer.current = setTimeout(() => {
        setSaveState("idle");
        setSavedResult(null);
      }, 6000);
    } catch {
      setSaveState("error");
      setTimeout(() => setSaveState("idle"), 3000);
    }
  }, [editor]);

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

  const cfg = savedResult ? TYPE_CONFIG[savedResult.capture_type as keyof typeof TYPE_CONFIG] : null;

  return (
    <div className="max-w-2xl mx-auto px-4 pt-8 pb-40">
      {/* Editor */}
      <EditorContent editor={editor} />

      {/* Formatting toolbar — sits just above the nav bar */}
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
        </div>
      </div>

      {/* Save button — full-width, above the toolbar */}
      <div className="fixed bottom-[calc(4rem+52px)] left-0 right-0 px-4 flex justify-center pointer-events-none">
        <div className="pointer-events-auto w-full max-w-2xl">
          <button
            onClick={handleSave}
            disabled={!hasContent || saveState === "saving"}
            className={`w-full py-3 rounded-2xl text-sm font-semibold transition-all active:scale-[0.98] ${
              !hasContent
                ? "bg-stone-100 text-stone-300 cursor-default"
                : saveState === "saving"
                ? "bg-stone-800 text-white/70 cursor-default"
                : "bg-stone-900 text-white hover:bg-stone-700 shadow-sm"
            }`}
          >
            {saveState === "saving" ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-3.5 h-3.5 border border-white/50 border-t-transparent rounded-full animate-spin" />
                Capturing…
              </span>
            ) : "Capture"}
          </button>
        </div>
      </div>

      {/* Saved feedback */}
      {saveState === "saved" && savedResult && (
        <div
          className="fixed bottom-32 left-0 right-0 flex justify-center px-4"
          style={{ animation: "toastUp 220ms ease-out both" }}
        >
          <div className="bg-white border border-[#e8e4db] rounded-2xl shadow-md px-4 py-3 flex items-center gap-3 max-w-sm w-full">
            <div className="w-7 h-7 rounded-full bg-stone-50 border border-[#e8e4db] flex items-center justify-center flex-shrink-0">
              <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
                <path d="M1 5L4.5 8.5L11 1.5" stroke="#78716c" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-stone-800 font-medium leading-snug truncate">{savedResult.summary}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                {cfg && (
                  <span className={`text-[10px] px-1.5 py-px rounded font-medium ${cfg.bgClass}`}>{cfg.label}</span>
                )}
                {savedResult.deadline && (
                  <span className="text-[10px] text-stone-400">{savedResult.deadline}</span>
                )}
              </div>
            </div>
            {savedResult.id && (
              <Link href={`/captures/${savedResult.id}`}
                className="text-[11px] text-stone-400 hover:text-stone-600 flex-shrink-0 transition-colors">
                View →
              </Link>
            )}
          </div>
        </div>
      )}

      {saveState === "error" && (
        <div className="fixed bottom-32 left-0 right-0 flex justify-center px-4">
          <div className="bg-white border border-red-100 rounded-2xl shadow-md px-4 py-3 max-w-sm w-full">
            <p className="text-sm text-red-500">Couldn&apos;t save — try again.</p>
          </div>
        </div>
      )}

      <style>{`
        .ProseMirror .is-empty::before {
          content: attr(data-placeholder);
          color: #d6d3d1;
          pointer-events: none;
          float: left;
          height: 0;
        }
        .ProseMirror h1.is-empty::before { font-weight: 700; }
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
        @keyframes toastUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
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

const ListIcon = () => <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M2.5 4h10M2.5 7.5h10M2.5 11h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>;
const OListIcon = () => <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M5.5 4h7M5.5 7.5h7M5.5 11h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><text x="1.5" y="5" fontSize="4" fill="currentColor">1</text><text x="1.5" y="8.5" fontSize="4" fill="currentColor">2</text><text x="1.5" y="12" fontSize="4" fill="currentColor">3</text></svg>;
const CheckIcon = () => <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><rect x="2" y="3.5" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.2"/><path d="M3 5.5l1 1 2-2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/><path d="M8.5 5.5h4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><rect x="2" y="9.5" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.2"/><path d="M8.5 11.5h4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>;
const ImgIcon = () => <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><rect x="1.5" y="2.5" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><circle cx="5" cy="5.5" r="1" fill="currentColor"/><path d="M1.5 10l3.5-3 2.5 2.5 2-2 3.5 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>;
