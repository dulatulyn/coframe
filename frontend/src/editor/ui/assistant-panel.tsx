"use client";

import { ArrowUp, Check, CircleAlert, Info, Loader2, RefreshCw, Sparkles, TriangleAlert, Wand2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ApiError, errorMessage } from "@/lib/api/client";
import { streamAiChat, useAiReview, useAiStatus, useCheck } from "@/lib/api/hooks";
import type { AiOp, AiReview, ChatTurn, Finding, Severity, User } from "@/lib/api/types";
import { cn } from "@/lib/utils";

import { applyOps, focusElements } from "../ai/apply";
import { service, type BpmnEditor } from "../modeler";

type Tab = "check" | "review" | "ask";

const SEVERITY: Record<Severity, { icon: typeof Info; tone: string; label: string }> = {
  error: { icon: CircleAlert, tone: "text-destructive", label: "Error" },
  warning: { icon: TriangleAlert, tone: "text-[#B25E09]", label: "Warning" },
  info: { icon: Info, tone: "text-slate", label: "Tip" },
};

const VERDICT: Record<AiReview["verdict"], string> = {
  solid: "Looks solid",
  needs_work: "Needs work",
  broken: "Has blocking problems",
};

export function userLanguage(): string {
  if (typeof navigator === "undefined") return "English";
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(navigator.language.split("-")[0]) ?? "English";
  } catch {
    return "English";
  }
}

function humanType(type: string): string {
  const words = type.replace("bpmn:", "").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function useNames(editor: BpmnEditor) {
  const label = (element: { type: string; businessObject?: { name?: string } } | null | undefined): string =>
    element?.businessObject?.name ? String(element.businessObject.name) : element ? humanType(element.type) : "";
  return (id: string) => {
    const element = service(editor, "elementRegistry").get(id);
    if (!element) return id;
    if (element.businessObject?.name) return String(element.businessObject.name);
    if (element.waypoints && element.source && element.target) return `${label(element.source)} → ${label(element.target)}`;
    return humanType(element.type);
  };
}

function ElementChips({ editor, ids }: { editor: BpmnEditor; ids: string[] }) {
  const nameOf = useNames(editor);
  if (!ids.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {ids.map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => focusElements(editor, [id])}
          className="max-w-full truncate rounded-full bg-fog px-2.5 py-0.5 text-[12px] font-medium hover:bg-fog-strong"
        >
          {nameOf(id)}
        </button>
      ))}
    </div>
  );
}

function SeverityIcon({ severity }: { severity: Severity }) {
  const { icon: Icon, tone } = SEVERITY[severity];
  return <Icon className={cn("mt-0.5 size-4 shrink-0", tone)} />;
}

function CheckTab({ editor, diagramId, version }: { editor: BpmnEditor; diagramId: string; version: number }) {
  const check = useCheck(diagramId, true);
  const refetch = check.refetch;
  useEffect(() => {
    const timer = setTimeout(() => void refetch(), 1200);
    return () => clearTimeout(timer);
  }, [version, refetch]);
  const findings = useMemo(() => check.data?.findings ?? [], [check.data]);
  const counts = useMemo(
    () => findings.reduce((acc, f) => ({ ...acc, [f.severity]: (acc[f.severity] ?? 0) + 1 }), {} as Record<Severity, number>),
    [findings],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 px-4 pb-3 text-[13px] text-slate">
        {check.isFetching && !check.data ? (
          <span className="inline-flex items-center gap-1.5">
            <Loader2 className="size-3.5 animate-spin" /> Checking…
          </span>
        ) : findings.length === 0 ? (
          <span className="inline-flex items-center gap-1.5 text-ink">
            <Check className="size-4 text-[#30A46C]" /> No problems found
          </span>
        ) : (
          <span>
            {(["error", "warning", "info"] as Severity[])
              .filter((s) => counts[s])
              .map((s) => `${counts[s]} ${SEVERITY[s].label.toLowerCase()}${counts[s] > 1 ? "s" : ""}`)
              .join(" · ")}
          </span>
        )}
        <button
          type="button"
          aria-label="Check again"
          onClick={() => void refetch()}
          className="ml-auto grid size-7 place-items-center rounded-full hover:bg-fog"
        >
          <RefreshCw className={cn("size-3.5", check.isFetching && "animate-spin")} />
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-3">
        {findings.map((finding: Finding, i) => (
          <button
            key={`${finding.rule}-${i}`}
            type="button"
            onClick={() => focusElements(editor, finding.elements)}
            className="flex w-full gap-2.5 rounded-xl px-2.5 py-2 text-left hover:bg-fog"
          >
            <SeverityIcon severity={finding.severity} />
            <span className="text-[13px] leading-5">{finding.message}</span>
          </button>
        ))}
      </div>
      <p className="border-t border-hairline px-4 py-2.5 text-[12px] leading-4 text-slate">
        Exact checks of the BPMN structure: connections, paths, gateways and labels. They update as you edit.
      </p>
    </div>
  );
}

function Effects({ resolves = [], sideEffects = [] }: { resolves?: string[]; sideEffects?: string[] }) {
  if (!resolves.length && !sideEffects.length) return null;
  return (
    <ul className="mt-2 space-y-1 text-[12px] leading-4">
      {resolves.map((text, i) => (
        <li key={`r${i}`} className="flex gap-1.5 text-[#1d6b44]">
          <Check className="mt-px size-3.5 shrink-0" /> <span>Fixes: {text}</span>
        </li>
      ))}
      {sideEffects.map((text, i) => (
        <li key={`s${i}`} className="flex gap-1.5 text-[#8a5a00]">
          <TriangleAlert className="mt-px size-3.5 shrink-0" /> <span>Leaves: {text}</span>
        </li>
      ))}
    </ul>
  );
}

function ApplyButton({
  editor,
  ops,
  label,
  readOnly,
}: {
  editor: BpmnEditor;
  ops: AiOp[];
  label: string;
  readOnly: boolean;
}) {
  const [done, setDone] = useState(false);
  if (readOnly) return null;
  return (
    <Button
      size="sm"
      variant={done ? "ghost" : "outline"}
      disabled={done}
      className="mt-2.5 h-8"
      onClick={() => {
        const { changed, skipped } = applyOps(editor, ops);
        setDone(true);
        if (changed.length) focusElements(editor, changed);
        if (skipped) toast(`Applied with ${skipped} step${skipped > 1 ? "s" : ""} skipped — the diagram changed since the review.`);
        else toast.success("Applied. Undo with Ctrl+Z.");
      }}
    >
      {done ? <Check /> : <Wand2 />} {done ? "Applied" : label}
    </Button>
  );
}

function ReviewTab({ editor, diagramId, readOnly }: { editor: BpmnEditor; diagramId: string; readOnly: boolean }) {
  const review = useAiReview(diagramId);
  const status = useAiStatus();
  const result = review.data;
  const limit = status.data?.limits.review;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {!result && !review.isPending && (
          <div className="rounded-2xl bg-fog p-4">
            <p className="text-[14px] leading-6">
              The assistant reads the whole model — every element, connection, lane and the exact checks — and explains what
              to fix, why it matters and what depends on it. Fixes apply in one click.
            </p>
            <Button className="mt-4 w-full" onClick={() => review.mutate(userLanguage())}>
              <Sparkles /> Review this diagram
            </Button>
          </div>
        )}
        {review.isPending && (
          <div className="space-y-3 pt-1">
            <div className="flex items-center gap-2 text-[13px] text-slate">
              <Loader2 className="size-4 animate-spin" /> Reading the process…
            </div>
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-2xl bg-fog" />
            ))}
          </div>
        )}
        {review.error && !review.isPending && (
          <p className="rounded-2xl bg-destructive/8 px-4 py-3 text-[14px] text-destructive">{errorMessage(review.error)}</p>
        )}
        {result && !review.isPending && (
          <div className="space-y-5">
            <div>
              <span
                className={cn(
                  "inline-flex rounded-full px-2.5 py-0.5 text-[12px] font-medium",
                  result.verdict === "solid" && "bg-[#30A46C]/12 text-[#1d6b44]",
                  result.verdict === "needs_work" && "bg-[#FFB224]/18 text-[#8a5a00]",
                  result.verdict === "broken" && "bg-destructive/10 text-destructive",
                )}
              >
                {VERDICT[result.verdict]}
              </span>
              <p className="mt-2 text-[14px] leading-6">{result.summary}</p>
            </div>
            {result.issues.length > 0 && (
              <section>
                <h3 className="mb-2 text-[12px] font-medium uppercase tracking-wide text-slate">Issues</h3>
                <div className="space-y-2">
                  {result.issues.map((issue, i) => (
                    <article key={i} className="rounded-2xl border border-hairline p-3">
                      <div className="flex gap-2">
                        <SeverityIcon severity={issue.severity} />
                        <h4 className="text-[14px] font-semibold leading-5">{issue.title}</h4>
                      </div>
                      <p className="mt-1.5 text-[13px] leading-5 text-slate">{issue.explanation}</p>
                      <ElementChips editor={editor} ids={issue.elements} />
                      {issue.fix && (
                        <>
                          <Effects resolves={issue.fix.resolves} sideEffects={issue.fix.sideEffects} />
                          <ApplyButton editor={editor} ops={issue.fix.ops} label={issue.fix.title} readOnly={readOnly} />
                        </>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            )}
            {result.improvements.length > 0 && (
              <section>
                <h3 className="mb-2 text-[12px] font-medium uppercase tracking-wide text-slate">Improvements</h3>
                <div className="space-y-2">
                  {result.improvements.map((item, i) => (
                    <article key={i} className="rounded-2xl bg-fog p-3">
                      <h4 className="text-[14px] font-semibold leading-5">{item.title}</h4>
                      <p className="mt-1.5 text-[13px] leading-5 text-slate">{item.rationale}</p>
                      <Effects resolves={item.resolves} sideEffects={item.sideEffects} />
                      <ApplyButton editor={editor} ops={item.ops} label="Apply" readOnly={readOnly} />
                    </article>
                  ))}
                </div>
              </section>
            )}
            <Button variant="ghost" size="sm" onClick={() => review.mutate(userLanguage())}>
              <RefreshCw /> Review again
            </Button>
          </div>
        )}
      </div>
      {limit && (
        <p className="border-t border-hairline px-4 py-2.5 text-[12px] text-slate">
          {Math.max(0, limit.limit - limit.used)} of {limit.limit} reviews left today
        </p>
      )}
    </div>
  );
}

function MessageText({ editor, text }: { editor: BpmnEditor; text: string }) {
  const registry = service(editor, "elementRegistry");
  const parts = text.split(/(\[[A-Za-z0-9_.:-]+\])/g);
  return (
    <>
      {parts.map((part, i) => {
        const match = /^\[([A-Za-z0-9_.:-]+)\]$/.exec(part);
        if (match && registry.get(match[1])) {
          return (
            <button
              key={i}
              type="button"
              onClick={() => focusElements(editor, [match[1]])}
              className="mx-0.5 rounded-md bg-cobalt/10 px-1 text-[12px] font-medium text-cobalt hover:bg-cobalt/15"
            >
              ↗
            </button>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

const STARTERS = ["Summarize this process", "What happens if something goes wrong?", "Who is responsible for each step?"];

function AskTab({ editor, diagramId }: { editor: BpmnEditor; diagramId: string }) {
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages]);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || busy) return;
    const history: ChatTurn[] = [...messages, { role: "user", text: question }];
    setMessages([...history, { role: "assistant", text: "" }]);
    setDraft("");
    setBusy(true);
    abort.current = new AbortController();
    try {
      await streamAiChat(
        diagramId,
        history,
        (delta) =>
          setMessages((current) => {
            const next = [...current];
            next[next.length - 1] = { role: "assistant", text: next[next.length - 1].text + delta };
            return next;
          }),
        abort.current.signal,
      );
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setMessages((current) => {
          const next = [...current];
          next[next.length - 1] = { role: "assistant", text: errorMessage(error instanceof ApiError ? error : null) };
          return next;
        });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scroller} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-3">
        {messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-[13px] leading-5 text-slate">Ask anything about this diagram. Answers follow the actual model.</p>
            {STARTERS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => void send(s)}
                className="block w-full rounded-xl bg-fog px-3 py-2 text-left text-[13px] hover:bg-fog-strong"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={cn(
              "whitespace-pre-wrap text-[14px] leading-6",
              m.role === "user" ? "ml-8 rounded-2xl rounded-br-md bg-ink px-3.5 py-2 text-paper" : "",
            )}
          >
            {m.role === "assistant" ? (
              m.text ? (
                <MessageText editor={editor} text={m.text} />
              ) : (
                <Loader2 className="size-4 animate-spin text-slate" />
              )
            ) : (
              m.text
            )}
          </div>
        ))}
      </div>
      <form
        className="flex items-end gap-2 border-t border-hairline p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send(draft);
        }}
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(draft);
            }
          }}
          rows={1}
          placeholder="Ask about this diagram"
          className="max-h-32 min-h-10 flex-1 resize-none rounded-2xl bg-fog px-3.5 py-2.5 text-[14px] outline-none placeholder:text-slate focus:ring-3 focus:ring-cobalt/25"
        />
        <Button type="submit" size="icon" disabled={busy || !draft.trim()} aria-label="Send">
          {busy ? <Loader2 className="animate-spin" /> : <ArrowUp />}
        </Button>
      </form>
    </div>
  );
}

export function AssistantPanel({
  editor,
  diagramId,
  me,
  readOnly,
  version,
  onClose,
  className,
}: {
  editor: BpmnEditor;
  diagramId: string;
  me: User;
  readOnly: boolean;
  version: number;
  onClose: () => void;
  className?: string;
}) {
  const [tab, setTab] = useState<Tab>("check");
  const status = useAiStatus(!me.isGuest);
  const aiBlocked = me.isGuest ? "sign_up_for_ai" : status.data && !status.data.available ? status.data.reason : null;

  return (
    <aside className={cn("flex flex-col overflow-hidden", className)}>
      <header className="flex items-center gap-2 px-4 pb-3 pt-4">
        <Sparkles className="size-4" />
        <h2 className="text-[15px] font-semibold">Assistant</h2>
        <button type="button" aria-label="Close assistant" onClick={onClose} className="ml-auto grid size-8 place-items-center rounded-full hover:bg-fog">
          <X className="size-4" />
        </button>
      </header>
      <div className="mx-4 mb-3 grid grid-cols-3 rounded-full bg-fog p-1 text-[13px] font-medium">
        {(
          [
            ["check", "Check"],
            ["review", "Review"],
            ["ask", "Ask"],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn("rounded-full py-1.5 transition-colors", tab === id ? "bg-paper shadow-sm" : "text-slate hover:text-ink")}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "check" ? (
        <CheckTab editor={editor} diagramId={diagramId} version={version} />
      ) : aiBlocked ? (
        <div className="px-4">
          <div className="rounded-2xl bg-fog p-4 text-[14px] leading-6">
            {aiBlocked === "sign_up_for_ai" ? (
              <>
                <p>The AI assistant is available to registered users. Sign up — your work as a guest stays with you.</p>
                <Button asChild className="mt-3 w-full">
                  <Link href={`/signup?next=${encodeURIComponent(typeof window === "undefined" ? "/app" : window.location.pathname)}`}>
                    Sign up
                  </Link>
                </Button>
              </>
            ) : (
              <p>{errorMessage(new ApiError(503, aiBlocked ?? "ai_failed", null))}</p>
            )}
          </div>
        </div>
      ) : tab === "review" ? (
        <ReviewTab editor={editor} diagramId={diagramId} readOnly={readOnly} />
      ) : (
        <AskTab editor={editor} diagramId={diagramId} />
      )}
    </aside>
  );
}
