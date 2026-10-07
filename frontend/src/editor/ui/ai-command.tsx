"use client";

import { ArrowUp, Loader2, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useReducer, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api/client";
import { useAiCommand } from "@/lib/api/hooks";
import type { AiCommandResult, User } from "@/lib/api/types";

import { applyOps, selectableElements } from "../ai/apply";
import { service, type BpmnEditor } from "../modeler";
import { MessageText, userLanguage } from "./assistant-panel";

type Element = any;
type Box = { x: number; y: number; right: number; bottom: number };

const PANEL_WIDTH = 380;

function timestamp(): number {
  return Date.now();
}
const MAX_HEIGHT = 520;
const MIN_SPACE = 240;
const TOP_INSET = 76;
const BOTTOM_INSET = 96;

function bounds(elements: Element[]): Box | null {
  const boxes = elements.map((e) =>
    e.waypoints
      ? {
          x: Math.min(...e.waypoints.map((p: { x: number }) => p.x)),
          y: Math.min(...e.waypoints.map((p: { y: number }) => p.y)),
          right: Math.max(...e.waypoints.map((p: { x: number }) => p.x)),
          bottom: Math.max(...e.waypoints.map((p: { y: number }) => p.y)),
        }
      : { x: e.x, y: e.y, right: e.x + e.width, bottom: e.y + e.height },
  );
  if (!boxes.length) return null;
  return {
    x: Math.min(...boxes.map((b) => b.x)),
    y: Math.min(...boxes.map((b) => b.y)),
    right: Math.max(...boxes.map((b) => b.right)),
    bottom: Math.max(...boxes.map((b) => b.bottom)),
  };
}

function quickActions(elements: Element[]): string[] {
  if (!elements.length) return ["Explain this process", "Find what is missing", "Add error handling"];
  const tasks = elements.filter((e) => /Task|SubProcess|CallActivity/.test(e.type));
  const actions = elements.length === 1 ? ["Explain this", "What should come next?"] : ["Explain these steps"];
  if (tasks.length >= 2) actions.push("Run these in parallel");
  if (tasks.length >= 1) actions.push("Add error handling here");
  actions.push("Improve the names");
  return actions;
}

export function AiCommand({
  editor,
  diagramId,
  me,
  selection,
  open,
  readOnly,
  onOpenChange,
}: {
  editor: BpmnEditor;
  diagramId: string;
  me: User;
  selection: Element[];
  open: boolean;
  readOnly: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const command = useAiCommand(diagramId);
  const [draft, setDraft] = useState("");
  const [reply, setReply] = useState<{ key: string; result: AiCommandResult } | null>(null);
  const request = useRef(0);
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(0);
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const elements = selectableElements(editor, selection);
  const ids = elements.map((e) => e.id);
  const selectionKey = ids.join(",");

  useEffect(() => {
    const eventBus = service(editor, "eventBus");
    eventBus.on("canvas.viewbox.changed", redraw);
    eventBus.on("elements.changed", redraw);
    return () => {
      eventBus.off("canvas.viewbox.changed", redraw);
      eventBus.off("elements.changed", redraw);
    };
  }, [editor]);

  const answer = reply && reply.key === selectionKey ? reply.result : null;

  useEffect(() => {
    if (!open) return;
    service(editor, "contextPad").close();
    requestAnimationFrame(() => input.current?.focus());
  }, [open, editor]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onOpenChange(false);
      }
    };
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node) && !command.isPending) onOpenChange(false);
    };
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [open, onOpenChange, command.isPending]);

  useEffect(() => {
    if (!command.isPending) return;
    const timer = setInterval(() => setNow(timestamp()), 1000);
    return () => clearInterval(timer);
  }, [command.isPending]);

  const cancel = () => {
    request.current += 1;
    command.reset();
  };

  const send = (text: string) => {
    const question = text.trim();
    if (!question || command.isPending) return;
    setReply(null);
    const id = ++request.current;
    const at = timestamp();
    setStartedAt(at);
    setNow(at);
    command.mutate(
      { messages: [{ role: "user", text: question }], selection: ids, language: userLanguage() },
      {
        onSuccess: (result) => {
          if (id !== request.current) return;
          setDraft("");
          if (result.ops.length && !readOnly) {
            applyOps(editor, result.ops, result.title ?? question);
            onOpenChange(false);
          } else {
            setReply({ key: selectionKey, result });
          }
        },
      },
    );
  };

  const vb = service(editor, "canvas").viewbox();
  const area = bounds(elements);
  const container = service(editor, "canvas")._container as HTMLElement | undefined;
  const width = container?.clientWidth ?? 1200;
  const height = container?.clientHeight ?? 800;
  const anchor = area
    ? {
        left: ((area.x + area.right) / 2 - vb.x) * vb.scale,
        start: (area.x - vb.x) * vb.scale,
        top: (area.y - vb.y) * vb.scale,
        bottom: (area.bottom - vb.y) * vb.scale,
      }
    : null;

  if (!open) {
    if (!anchor || readOnly) return null;
    return (
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        className="absolute z-30 flex h-7 items-center gap-1.5 rounded-full bg-ink px-2.5 text-[12px] font-medium text-paper shadow-pop hover:bg-ink/85"
        style={{ left: Math.min(Math.max(anchor.start - 4, 12), width - 90), top: Math.max(anchor.top - 38, 72) }}
        title="Ask AI about the selection (⌘K)"
      >
        <Sparkles className="size-3.5" /> AI
        <span className="font-mono text-[11px] text-paper/60">⌘K</span>
      </button>
    );
  }

  const left = anchor ? Math.min(Math.max(anchor.left - PANEL_WIDTH / 2, 12), width - PANEL_WIDTH - 12) : (width - PANEL_WIDTH) / 2;
  const spaceAbove = anchor ? anchor.top - 16 - TOP_INSET : 0;
  const spaceBelow = anchor ? height - BOTTOM_INSET - (anchor.bottom + 16) : 0;
  const style =
    anchor && spaceAbove >= MIN_SPACE
      ? { left, bottom: height - anchor.top + 16, maxHeight: Math.min(spaceAbove, MAX_HEIGHT) }
      : anchor && spaceBelow >= MIN_SPACE
        ? { left, top: anchor.bottom + 16, maxHeight: Math.min(spaceBelow, MAX_HEIGHT) }
        : { left, top: TOP_INSET + 8, maxHeight: Math.min(height - TOP_INSET - BOTTOM_INSET - 8, MAX_HEIGHT) };

  return (
    <div
      ref={box}
      className="absolute z-40 flex flex-col rounded-[20px] border border-hairline bg-paper shadow-pop"
      style={{ width: `min(${PANEL_WIDTH}px, calc(100% - 24px))`, ...style }}
    >
      <div className="flex items-center gap-2 px-3.5 pb-1 pt-3 text-[12px] text-slate">
        <Sparkles className="size-3.5 text-cobalt" />
        {elements.length === 0
          ? "Whole diagram"
          : elements.length === 1
            ? `Selected: ${elements[0].businessObject?.name || elements[0].id}`
            : `${elements.length} elements selected`}
        <button
          type="button"
          aria-label="Close"
          onClick={() => onOpenChange(false)}
          className="ml-auto grid size-6 place-items-center rounded-full hover:bg-fog"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {me.isGuest ? (
        <div className="p-3.5 text-[14px] leading-6">
          The AI assistant is available to registered users.
          <Button asChild size="sm" className="mt-2 w-full">
            <Link href="/signup">Sign up</Link>
          </Button>
        </div>
      ) : (
        <>
          {answer && (
            <div className="mx-3.5 mt-1 min-h-0 overflow-y-auto rounded-2xl bg-fog px-3 py-2.5 text-[14px] leading-6">
              <MessageText editor={editor} text={answer.reply} />
              {answer.rejected && (
                <p className="mt-2 text-[12px] leading-4 text-[#8a5a00]">
                  The change didn&apos;t pass the model checks, so nothing was applied. Try rephrasing or narrowing the
                  selection.
                </p>
              )}
              {readOnly && answer.ops.length > 0 && (
                <p className="mt-2 text-[12px] leading-4 text-slate">You can view this diagram but not edit it.</p>
              )}
            </div>
          )}
          {command.error && !command.isPending && (
            <p className="mx-3.5 mt-1 rounded-2xl bg-destructive/8 px-3 py-2 text-[13px] text-destructive">
              {errorMessage(command.error)}
            </p>
          )}
          {!answer && !command.isPending && (
            <div className="flex flex-wrap gap-1.5 px-3.5 pt-1.5">
              {quickActions(elements).map((action) => (
                <button
                  key={action}
                  type="button"
                  onClick={() => send(action)}
                  className="rounded-full border border-hairline px-2.5 py-1 text-[12px] hover:bg-fog"
                >
                  {action}
                </button>
              ))}
            </div>
          )}
          <form
            className="flex items-end gap-2 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
          >
            <textarea
              ref={input}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(draft);
                }
              }}
              rows={1}
              maxLength={2000}
              disabled={command.isPending}
              placeholder={
                command.isPending
                  ? "Working on it…"
                  : elements.length
                    ? "Change or ask about the selection"
                    : "Change or ask about the diagram"
              }
              className="max-h-32 min-h-10 flex-1 resize-none rounded-2xl bg-fog px-3.5 py-2.5 text-[14px] outline-none placeholder:text-slate focus:ring-3 focus:ring-cobalt/25"
            />
            <Button type="submit" size="icon" disabled={command.isPending || !draft.trim()} aria-label="Send">
              {command.isPending ? <Loader2 className="animate-spin" /> : <ArrowUp />}
            </Button>
          </form>
          {command.isPending && (
            <div className="flex items-center gap-2 px-3.5 pb-3 text-[12px] text-slate">
              <span className="min-w-0 flex-1">
                Drafting the change · <span className="tabular-nums">{Math.max(0, Math.round((now - startedAt) / 1000))}s</span>
              </span>
              <button type="button" onClick={cancel} className="shrink-0 rounded-full px-2 py-1 font-medium text-ink hover:bg-fog">
                Cancel
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
