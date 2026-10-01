"use client";

import { Loader2, Sparkles, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api/client";
import { useAiSuggest } from "@/lib/api/hooks";
import type { User } from "@/lib/api/types";
import { cn } from "@/lib/utils";

import { applyOps } from "../ai/apply";
import { service, type BpmnEditor } from "../modeler";
import { userLanguage } from "./assistant-panel";

export function SuggestPopover({
  editor,
  diagramId,
  elementId,
  me,
  onClose,
}: {
  editor: BpmnEditor;
  diagramId: string;
  elementId: string;
  me: User;
  onClose: () => void;
}) {
  const suggest = useAiSuggest(diagramId);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const requested = useRef(false);
  const run = suggest.mutate;

  useEffect(() => {
    service(editor, "contextPad").close();
  }, [editor]);

  useEffect(() => {
    if (me.isGuest || requested.current) return;
    requested.current = true;
    run({ elementId, language: userLanguage() });
  }, [elementId, me.isGuest, run]);

  const options = suggest.data?.suggestions ?? [];

  const accept = (index: number) => {
    const option = options[index];
    if (!option) return;
    applyOps(editor, option.ops, option.title);
    onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (!options.length) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => (i + 1) % options.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => (i - 1 + options.length) % options.length);
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        accept(active);
      }
    };
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onDown, true);
    };
  });

  const element = service(editor, "elementRegistry").get(elementId);
  if (!element) return null;
  const vb = service(editor, "canvas").viewbox();
  const left = Math.max(12, (element.x + element.width - vb.x) * vb.scale + 16);
  const top = Math.max(76, (element.y - vb.y) * vb.scale - 8);

  return (
    <div
      ref={box}
      className="absolute z-40 w-[300px] rounded-[20px] border border-hairline bg-paper p-2 shadow-pop"
      style={{ left: `min(${left}px, calc(100% - 312px))`, top }}
    >
      <div className="flex items-center gap-2 px-2 pb-1.5 pt-1 text-[12px] text-slate">
        <Sparkles className="size-3.5" /> Next step
        {options.length > 0 && <span className="ml-auto font-mono text-[11px]">↵ add · ↑↓ choose</span>}
      </div>
      {me.isGuest ? (
        <div className="p-2 text-[13px] leading-5">
          Suggestions are available to registered users.
          <Button asChild size="sm" className="mt-2 w-full">
            <Link href="/signup">Sign up</Link>
          </Button>
        </div>
      ) : suggest.isPending ? (
        <div className="flex items-center gap-2 px-2 py-3 text-[13px] text-slate">
          <Loader2 className="size-4 animate-spin" /> Thinking…
        </div>
      ) : suggest.error ? (
        <p className="px-2 py-2 text-[13px] text-destructive">{errorMessage(suggest.error)}</p>
      ) : options.length === 0 ? (
        <p className="px-2 py-2 text-[13px] text-slate">No suggestion for this element.</p>
      ) : (
        <div className="flex flex-col gap-0.5">
          {options.map((option, i) => (
            <button
              key={i}
              type="button"
              onMouseMove={() => setActive(i)}
              onClick={() => accept(i)}
              className={cn("rounded-xl px-2.5 py-2 text-left text-[14px]", i === active ? "bg-fog" : "hover:bg-fog")}
            >
              <span className="block font-medium leading-5">{option.title}</span>
              {option.sideEffects.length > 0 && (
                <span className="mt-0.5 flex gap-1 text-[12px] leading-4 text-[#8a5a00]">
                  <TriangleAlert className="mt-px size-3 shrink-0" /> {option.sideEffects[0]}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
