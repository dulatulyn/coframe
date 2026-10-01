"use client";

import { Check, Sparkles, Undo2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { clearChangeMarkers, type AiChange } from "../ai/apply";
import type { BpmnBinding } from "../collab/binding";
import type { BpmnEditor } from "../modeler";

const UNSEEN_TIMEOUT_MS = 4000;

export function AiChangeBar({
  editor,
  binding,
  change,
  version,
  onDone,
}: {
  editor: BpmnEditor;
  binding: BpmnBinding;
  change: AiChange;
  version: number;
  onDone: () => void;
}) {
  const seen = useRef(false);

  useEffect(() => {
    if (binding.isLastChange(change.tag)) {
      seen.current = true;
    } else if (seen.current) {
      clearChangeMarkers(editor);
      onDone();
    }
  }, [version, binding, change.tag, editor, onDone]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!seen.current) {
        clearChangeMarkers(editor);
        onDone();
      }
    }, UNSEEN_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [editor, onDone]);

  const keep = () => {
    clearChangeMarkers(editor);
    onDone();
  };

  const undo = () => {
    clearChangeMarkers(editor);
    if (binding.undoChange(change.tag)) toast("Change undone");
    else toast("The diagram changed after this. Use Ctrl+Z to step back.");
    onDone();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if ((e.target as HTMLElement).closest?.("input, textarea, [contenteditable=true]")) return;
      if (e.key === "Enter") {
        e.preventDefault();
        keep();
      } else if (e.key === "Backspace") {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const parts = [
    change.added.length ? `${change.added.length} new` : null,
    change.changed.length ? `${change.changed.length} changed` : null,
    change.skipped ? `${change.skipped} skipped` : null,
  ].filter(Boolean);

  return (
    <div
      role="status"
      className="absolute left-1/2 top-[76px] z-40 flex max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-2 rounded-full border border-hairline bg-paper py-1.5 pl-4 pr-1.5 shadow-pop sm:top-20"
    >
      <Sparkles className="size-4 shrink-0 text-cobalt" />
      <div className="min-w-0">
        <p className="truncate text-[14px] font-medium leading-5">{change.title}</p>
        {parts.length > 0 && (
          <p className="flex items-center gap-2 text-[12px] leading-4 text-slate">
            {change.added.length > 0 && <span className="size-2 rounded-full bg-[#30a46c]" />}
            {change.changed.length > 0 && <span className="size-2 rounded-full bg-[#f5a524]" />}
            {parts.join(" · ")}
          </p>
        )}
      </div>
      <Button size="sm" variant="ghost" className="ml-2 h-8 shrink-0" onClick={undo} title="Undo (Ctrl+Backspace)">
        <Undo2 /> Undo
      </Button>
      <Button size="sm" className="h-8 shrink-0" onClick={keep} title="Keep (Ctrl+Enter)">
        <Check /> Keep
      </Button>
    </div>
  );
}
