"use client";

import { ArrowUp, Check, Loader2, MessageSquare, MoreHorizontal, RotateCcw, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { UserAvatar } from "@/components/editor-chrome/presence";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { errorMessage } from "@/lib/api/client";
import { useCommentActions, useComments } from "@/lib/api/hooks";
import type { Comment, User } from "@/lib/api/types";
import { timeAgo } from "@/lib/time";
import { cn } from "@/lib/utils";

import { focusElements, selectableElements } from "../ai/apply";
import { service, type BpmnEditor } from "../modeler";

type Element = any;
export type Thread = { root: Comment; replies: Comment[] };

const OVERLAY = "coframe-comment";

export function threadsOf(comments: Comment[]): Thread[] {
  const roots = comments.filter((c) => !c.parentId);
  return roots.map((root) => ({ root, replies: comments.filter((c) => c.parentId === root.id) }));
}

export function CommentBadges({ editor, threads, onOpen }: { editor: BpmnEditor; threads: Thread[]; onOpen: (threadId: string) => void }) {
  useEffect(() => {
    const overlays = service(editor, "overlays");
    const registry = service(editor, "elementRegistry");
    overlays.remove({ type: OVERLAY });
    const byElement = new Map<string, Thread[]>();
    for (const thread of threads) {
      const id = thread.root.elementId;
      if (thread.root.resolvedAt || !id || !registry.get(id)) continue;
      byElement.set(id, [...(byElement.get(id) ?? []), thread]);
    }
    for (const [id, list] of byElement) {
      const element = registry.get(id);
      const html = document.createElement("button");
      html.type = "button";
      html.className = "coframe-comment-badge";
      html.title = `${list.length} open comment thread${list.length > 1 ? "s" : ""}`;
      html.textContent = String(list.reduce((n, t) => n + 1 + t.replies.length, 0));
      html.addEventListener("click", (e) => {
        e.stopPropagation();
        onOpen(list[0].root.id);
      });
      overlays.add(id, OVERLAY, { position: element.waypoints ? { top: -12, left: -12 } : { top: -12, right: 12 }, html });
    }
    return () => overlays.remove({ type: OVERLAY });
  }, [editor, threads, onOpen]);
  return null;
}

function elementName(editor: BpmnEditor, id: string | null): { label: string; exists: boolean } {
  if (!id) return { label: "Whole diagram", exists: true };
  const element = service(editor, "elementRegistry").get(id);
  if (!element) return { label: "Removed element", exists: false };
  const name = element.businessObject?.name?.trim();
  return { label: name || element.type.replace("bpmn:", "").replace(/([a-z])([A-Z])/g, "$1 $2"), exists: true };
}

function Composer({
  placeholder,
  onSend,
  pending,
  autoFocus,
  compact,
}: {
  placeholder: string;
  onSend: (text: string) => Promise<unknown>;
  pending: boolean;
  autoFocus?: boolean;
  compact?: boolean;
}) {
  const [text, setText] = useState("");
  const send = async () => {
    const body = text.trim();
    if (!body || pending) return;
    try {
      await onSend(body);
      setText("");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <textarea
        autoFocus={autoFocus}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void send();
          }
        }}
        rows={1}
        maxLength={4000}
        placeholder={placeholder}
        className={cn(
          "max-h-32 flex-1 resize-none rounded-2xl bg-fog px-3.5 py-2.5 text-[14px] outline-none placeholder:text-slate focus:ring-3 focus:ring-cobalt/25",
          compact ? "min-h-9 py-2 text-[13px]" : "min-h-10",
        )}
      />
      <Button type="submit" size="icon" className={compact ? "size-9" : undefined} disabled={pending || !text.trim()} aria-label="Send">
        {pending ? <Loader2 className="animate-spin" /> : <ArrowUp />}
      </Button>
    </form>
  );
}

function CommentBody({
  comment,
  me,
  canModerate,
  now,
  onEdit,
  onDelete,
  onResolve,
  resolved,
}: {
  comment: Comment;
  me: User;
  canModerate: boolean;
  now: number;
  onEdit: (body: string) => Promise<unknown>;
  onDelete: () => void;
  onResolve?: () => void;
  resolved?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const mine = comment.author?.id === me.id;
  return (
    <div className="flex gap-2.5">
      {comment.author ? (
        <UserAvatar user={comment.author} size={26} ring={false} />
      ) : (
        <span className="size-[26px] shrink-0 rounded-full bg-fog-strong" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[13px] font-semibold">{comment.author?.name ?? "Former member"}</span>
          <span className="shrink-0 text-[12px] text-slate">
            {timeAgo(comment.createdAt, now)}
            {comment.updatedAt !== comment.createdAt ? " · edited" : ""}
          </span>
          <div className="ml-auto flex shrink-0 items-center">
            {onResolve && (mine || canModerate) && (
              <button
                type="button"
                onClick={onResolve}
                title={resolved ? "Reopen" : "Resolve"}
                className="grid size-7 place-items-center rounded-full text-slate hover:bg-fog hover:text-ink"
              >
                {resolved ? <RotateCcw className="size-3.5" /> : <Check className="size-4" />}
              </button>
            )}
            {(mine || canModerate) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" aria-label="Comment actions" className="grid size-7 place-items-center rounded-full text-slate hover:bg-fog hover:text-ink">
                    <MoreHorizontal className="size-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {mine && <DropdownMenuItem onSelect={() => setEditing(true)}>Edit</DropdownMenuItem>}
                  <DropdownMenuItem onSelect={onDelete} className="text-destructive">
                    <Trash2 /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
        {editing ? (
          <div className="mt-1 space-y-1.5">
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              maxLength={4000}
              className="w-full resize-none rounded-xl bg-fog px-3 py-2 text-[14px] outline-none focus:ring-3 focus:ring-cobalt/25"
            />
            <div className="flex justify-end gap-1.5">
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!draft.trim()}
                onClick={async () => {
                  await onEdit(draft.trim());
                  setEditing(false);
                }}
              >
                Save
              </Button>
            </div>
          </div>
        ) : (
          <p className="mt-0.5 whitespace-pre-wrap break-words text-[14px] leading-5">{comment.body}</p>
        )}
      </div>
    </div>
  );
}

export function CommentsPanel({
  editor,
  diagramId,
  me,
  canModerate,
  selection,
  focusThread,
  onClose,
  className,
}: {
  editor: BpmnEditor;
  diagramId: string;
  me: User;
  canModerate: boolean;
  selection: Element[];
  focusThread: string | null;
  onClose: () => void;
  className?: string;
}) {
  const { data, isLoading } = useComments(diagramId);
  const actions = useCommentActions(diagramId);
  const [filter, setFilter] = useState<"open" | "resolved">("open");
  const [replying, setReplying] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  const list = useRef<HTMLDivElement>(null);
  const threads = threadsOf(data ?? []);
  const visible = threads.filter((t) => (filter === "open" ? !t.root.resolvedAt : !!t.root.resolvedAt)).reverse();
  const selected = selectableElements(editor, selection);
  const target = selected.length === 1 ? selected[0] : null;
  const targetName = elementName(editor, target?.id ?? null).label;

  useEffect(() => {
    if (!focusThread) return;
    requestAnimationFrame(() =>
      list.current?.querySelector(`[data-thread="${focusThread}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }),
    );
  }, [focusThread]);

  const remove = (comment: Comment) =>
    actions.remove.mutate(comment.id, { onError: (e) => toast.error(errorMessage(e)) });
  const edit = (comment: Comment) => (body: string) => actions.update.mutateAsync({ id: comment.id, body });

  return (
    <aside className={cn("flex flex-col overflow-hidden", className)}>
      <header className="flex items-center gap-2 px-4 pb-3 pt-4">
        <MessageSquare className="size-4" />
        <h2 className="text-[15px] font-semibold">Comments</h2>
        <button type="button" aria-label="Close comments" onClick={onClose} className="ml-auto grid size-8 place-items-center rounded-full hover:bg-fog">
          <X className="size-4" />
        </button>
      </header>
      <div className="mx-4 mb-2 grid grid-cols-2 rounded-full bg-fog p-1 text-[13px] font-medium">
        {(
          [
            ["open", `Open · ${threads.filter((t) => !t.root.resolvedAt).length}`],
            ["resolved", `Resolved · ${threads.filter((t) => t.root.resolvedAt).length}`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={cn("rounded-full py-1.5", filter === id ? "bg-paper shadow-sm" : "text-slate hover:text-ink")}
          >
            {label}
          </button>
        ))}
      </div>

      <div ref={list} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-3">
        {isLoading && (
          <div className="grid h-24 place-items-center text-slate">
            <Loader2 className="size-5 animate-spin" />
          </div>
        )}
        {!isLoading && visible.length === 0 && (
          <p className="px-2 py-4 text-[13px] leading-5 text-slate">
            {filter === "open"
              ? "No open comments. Select an element and write below to start a discussion about it."
              : "Nothing resolved yet."}
          </p>
        )}
        {visible.map((thread) => {
          const anchor = elementName(editor, thread.root.elementId);
          return (
            <article
              key={thread.root.id}
              data-thread={thread.root.id}
              className={cn(
                "rounded-2xl border p-3 transition-colors",
                focusThread === thread.root.id ? "border-cobalt/50 bg-cobalt/[0.03]" : "border-hairline",
              )}
            >
              <button
                type="button"
                disabled={!thread.root.elementId || !anchor.exists}
                onClick={() => thread.root.elementId && focusElements(editor, [thread.root.elementId])}
                className={cn(
                  "mb-2 max-w-full truncate rounded-full bg-fog px-2.5 py-0.5 text-[12px] font-medium",
                  anchor.exists ? "hover:bg-fog-strong" : "text-slate line-through",
                )}
              >
                {anchor.label}
              </button>
              <div className="space-y-3">
                <CommentBody
                  comment={thread.root}
                  me={me}
                  canModerate={canModerate}
                  now={now}
                  resolved={!!thread.root.resolvedAt}
                  onEdit={edit(thread.root)}
                  onDelete={() => remove(thread.root)}
                  onResolve={() =>
                    actions.update.mutate(
                      { id: thread.root.id, resolved: !thread.root.resolvedAt },
                      { onError: (e) => toast.error(errorMessage(e)) },
                    )
                  }
                />
                {thread.replies.map((reply) => (
                  <CommentBody
                    key={reply.id}
                    comment={reply}
                    me={me}
                    canModerate={canModerate}
                    now={now}
                    onEdit={edit(reply)}
                    onDelete={() => remove(reply)}
                  />
                ))}
              </div>
              {thread.root.resolvedAt ? (
                <p className="mt-2 text-[12px] text-slate">
                  Resolved by {thread.root.resolvedBy?.name ?? "someone"} · {timeAgo(thread.root.resolvedAt, now)}
                </p>
              ) : replying === thread.root.id ? (
                <div className="mt-3">
                  <Composer
                    compact
                    autoFocus
                    placeholder="Reply"
                    pending={actions.add.isPending}
                    onSend={(body) => actions.add.mutateAsync({ body, parentId: thread.root.id })}
                  />
                </div>
              ) : (
                <button type="button" onClick={() => setReplying(thread.root.id)} className="mt-2 text-[13px] font-medium text-cobalt hover:underline">
                  Reply
                </button>
              )}
            </article>
          );
        })}
      </div>

      <div className="border-t border-hairline p-3">
        <p className="mb-2 truncate text-[12px] text-slate">
          On: <span className="font-medium text-ink">{targetName}</span>
          {!target && " · select an element to comment on it"}
        </p>
        <Composer
          placeholder={target ? `Comment on ${targetName}` : "Comment on the diagram"}
          pending={actions.add.isPending}
          onSend={async (body) => {
            const comment = await actions.add.mutateAsync({ body, elementId: target?.id ?? null });
            setFilter("open");
            return comment;
          }}
        />
      </div>
    </aside>
  );
}
