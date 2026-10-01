"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Keyboard, Map as MapIcon, SlidersHorizontal } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

import type { CatalogItem } from "@/components/bpmn/catalog";
import { NotationDock, type ToolId } from "@/components/editor-chrome/notation-dock";
import { ZoomControl } from "@/components/editor-chrome/status";
import { keys, uploadPreview, useComments } from "@/lib/api/hooks";
import type { Diagram, Project, User } from "@/lib/api/types";
import { useFilesPanel, useInspectorPanel } from "@/lib/panels";
import { cn } from "@/lib/utils";

import {
  activateTool,
  openCreateMenu,
  resetZoom,
  runExport,
  startCreate,
  toggleMinimap,
  zoomBy,
  zoomToFit,
} from "./actions";
import { AI_APPLIED_EVENT, type AiChange } from "./ai/apply";
import { SUGGEST_EVENT } from "./ai/suggest-pad";
import { BpmnBinding } from "./collab/binding";
import { PresenceController, type Peer } from "./collab/presence";
import { DiagramSession } from "./collab/session";
import { createEditor, hasService, service, type BpmnEditor } from "./modeler";
import { AiChangeBar } from "./ui/ai-change-bar";
import { CommentBadges, CommentsPanel, threadsOf } from "./ui/comments-panel";
import { AiCommand } from "./ui/ai-command";
import { AssistantPanel } from "./ui/assistant-panel";
import { EditorInspector } from "./ui/editor-inspector";
import { EditorTopBar } from "./ui/editor-top-bar";
import { SessionEndedOverlay } from "./ui/session-ended";
import { ShortcutsDialog } from "./ui/shortcuts-dialog";
import { SuggestPopover } from "./ui/suggest-popover";
import { VersionHistoryDialog } from "./ui/version-history";
import type { ViewMode } from "./views/modes";
import { MetricsPanel } from "./views/metrics-panel";
import { PathsPanel } from "./views/paths-panel";
import { PresentMode } from "./views/present-mode";
import { RolesPanel } from "./views/roles-panel";
import { ViewBanner } from "./views/view-banner";

type Element = any;

const PREVIEW_DELAY_MS = 2500;

function useSession(session: DiagramSession | null) {
  const subscribe = useCallback((cb: () => void) => (session ? session.subscribe(cb) : () => {}), [session]);
  const snapshot = useCallback(
    () => (session ? `${session.connection}|${session.saveState}|${session.synced}|${session.ended?.code ?? ""}` : "none"),
    [session],
  );
  useSyncExternalStore(subscribe, snapshot, () => "none");
  return session;
}

export function DiagramEditor({ diagram, project, me }: { diagram: Diagram; project: Project; me: User }) {
  const readOnly = diagram.access !== "edit";
  const canvasRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [session, setSession] = useState<DiagramSession | null>(null);
  const [editor, setEditor] = useState<BpmnEditor | null>(null);
  const [binding, setBinding] = useState<BpmnBinding | null>(null);
  const [presence, setPresence] = useState<PresenceController | null>(null);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [tool, setTool] = useState<ToolId>("select");
  const [zoom, setZoom] = useState(1);
  const [selection, setSelection] = useState<Element[]>([]);
  const [changeVersion, setUndoVersion] = useState(0);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [suggestFor, setSuggestFor] = useState<string | null>(null);
  const [commandOpen, setCommandOpen] = useState(false);
  const [view, setView] = useState<ViewMode>("edit");
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [focusThread, setFocusThread] = useState<string | null>(null);
  const comments = useComments(diagram.id);
  const threads = useMemo(() => threadsOf(comments.data ?? []), [comments.data]);
  const openThreads = threads.filter((t) => !t.root.resolvedAt).length;
  const [aiChange, setAiChange] = useState<AiChange | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [minimapOpen, setMinimapOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const files = useFilesPanel();
  const inspector = useInspectorPanel();
  const filesBeside = files.wide && files.open;
  const qc = useQueryClient();
  useSession(session);

  useEffect(() => {
    let disposed = false;
    const s = new DiagramSession(diagram.id, { generation: diagram.generation, keepLocalCopy: !readOnly });
    setSession(s);
    let ed: BpmnEditor | null = null;
    let b: BpmnBinding | null = null;
    let pr: PresenceController | null = null;
    let previewTimer: ReturnType<typeof setTimeout> | null = null;
    const offs: (() => void)[] = [];

    const schedulePreview = () => {
      if (readOnly) return;
      if (previewTimer) clearTimeout(previewTimer);
      previewTimer = setTimeout(async () => {
        if (!ed || disposed) return;
        try {
          const { svg } = await ed.saveSVG();
          await uploadPreview(diagram.id, svg);
          qc.invalidateQueries({ queryKey: keys.tree(project.id) });
        } catch {
        }
      }, PREVIEW_DELAY_MS);
    };

    (async () => {
      ed = await createEditor(canvasRef.current!, { readOnly });
      if (disposed) {
        ed.destroy();
        return;
      }
      await s.whenReady();
      if (disposed) return;
      b = new BpmnBinding(ed, s, {
        readOnly,
        isEditingOutside: () => !!document.activeElement?.closest?.("[data-inspector-field]"),
        onError: (error) => console.error("diagram sync error", error),
        onLocalChange: () => {
          schedulePreview();
          setUndoVersion((v) => v + 1);
        },
        onRendered: () => setUndoVersion((v) => v + 1),
      });
      await b.start();
      if (disposed) return;
      pr = new PresenceController(ed, s.awareness, canvasRef.current!, overlayRef.current!, {
        id: me.id,
        name: me.name,
        color: me.color,
        avatarUrl: me.avatarUrl,
      });
      pr.start();
      offs.push(pr.subscribe(setPeers));

      const eventBus = service(ed, "eventBus");
      const onTool = ({ tool: active }: { tool: string | null }) =>
        setTool(active === "hand" ? "hand" : active === "lasso" ? "lasso" : active === "space" ? "space" : active === "global-connect" ? "connect" : "select");
      const onViewbox = ({ viewbox }: { viewbox: { scale: number } }) => setZoom(viewbox.scale);
      const onSelection = ({ newSelection }: { newSelection: Element[] }) => setSelection([...newSelection]);
      const onSuggest = ({ element }: { element: { id: string } }) => {
        setCommandOpen(false);
        setSuggestFor(element.id);
      };
      const onSimulationToggle = ({ active }: { active: boolean }) =>
        setView((current) => (active ? "simulate" : current === "simulate" ? "edit" : current));
      eventBus.on("tokenSimulation.toggleMode", onSimulationToggle);
      offs.push(() => eventBus.off("tokenSimulation.toggleMode", onSimulationToggle));
      const onAiApplied = (change: AiChange) => setAiChange(change.added.length || change.changed.length ? change : null);
      eventBus.on(SUGGEST_EVENT, onSuggest);
      eventBus.on(AI_APPLIED_EVENT, onAiApplied);
      offs.push(() => {
        eventBus.off(SUGGEST_EVENT, onSuggest);
        eventBus.off(AI_APPLIED_EVENT, onAiApplied);
      });
      eventBus.on("tool-manager.update", onTool);
      eventBus.on("canvas.viewbox.changed", onViewbox);
      eventBus.on("selection.changed", onSelection);
      offs.push(() => {
        eventBus.off("tool-manager.update", onTool);
        eventBus.off("canvas.viewbox.changed", onViewbox);
        eventBus.off("selection.changed", onSelection);
      });
      setZoom(service(ed, "canvas").viewbox().scale);

      if (!readOnly && (!diagram.previewUpdatedAt || diagram.previewUpdatedAt < diagram.contentUpdatedAt)) schedulePreview();
      setEditor(ed);
      setBinding(b);
      setPresence(pr);
    })().catch((error) => {
      if (!disposed && !s.ended) setFailed(error instanceof Error ? error.message : "The diagram could not be opened.");
    });

    return () => {
      disposed = true;
      if (previewTimer) clearTimeout(previewTimer);
      for (const off of offs) off();
      pr?.dispose();
      b?.dispose();
      ed?.destroy();
      s.destroy();
      setEditor(null);
      setBinding(null);
      setPresence(null);
      setSelection([]);
      setAiChange(null);
      setCommandOpen(false);
      setView("edit");
    };
  }, [diagram.id, readOnly]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        setSuggestFor(null);
        setCommandOpen((open) => !open);
        return;
      }
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, [contenteditable=true]")) return;
      if (e.key === "?") setShortcutsOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const clearAiChange = useCallback(() => setAiChange(null), []);
  const openThread = useCallback((id: string) => {
    setAssistantOpen(false);
    setCommentsOpen(true);
    setFocusThread(id);
  }, []);

  useEffect(() => {
    if (!editor || !hasService(editor, "toggleMode")) return;
    const toggle = service(editor, "toggleMode");
    if (toggle._active !== (view === "simulate")) toggle.toggleMode(view === "simulate");
  }, [editor, view]);

  useEffect(() => {
    if (view === "edit") return;
    setCommandOpen(false);
    setSuggestFor(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || (e.target as HTMLElement).closest("input, textarea, [contenteditable=true]")) return;
      setView("edit");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view]);

  const editing = view === "edit";

  const onCreate = (item: CatalogItem, event: MouseEvent | DragEvent) => editor && startCreate(editor, item, event);
  const onTool = (id: ToolId, event: MouseEvent) => editor && activateTool(editor, id, event);
  const onAllElements = (event: MouseEvent) => {
    if (!editor) return;
    const rect = (event.currentTarget as HTMLElement | null)?.getBoundingClientRect?.();
    openCreateMenu(editor, rect ? { x: rect.left, y: rect.top - 8 } : { x: event.clientX, y: event.clientY });
  };

  const selected = selection.length === 1 ? selection[0] : null;
  const rootId = editor ? service(editor, "canvas").getRootElement()?.id : null;
  const inspectable = selected && selected.type !== "label" && selected.id !== rootId;
  const saveState = session?.saveState ?? "saved";
  const restored = session?.ended?.code === 4409;

  useEffect(() => {
    if (readOnly || saveState === "saved") return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saveState, readOnly]);

  useEffect(() => {
    if (!restored) return;
    toast("An earlier version of this diagram was restored");
    qc.invalidateQueries({ queryKey: keys.diagram(diagram.id) });
  }, [restored]);

  return (
    <div className={cn("coframe-editor isolate overflow-hidden bg-canvas", view === "present" ? "fixed inset-0 z-[60]" : "absolute inset-0")}>
      <div ref={canvasRef} className="absolute inset-0" />
      <div ref={overlayRef} className="pointer-events-none absolute inset-0 z-10 overflow-hidden" />

      {view !== "present" && (
      <EditorTopBar
        diagram={diagram}
        project={project}
        me={me}
        saveState={
          session?.synced || saveState === "local" ? saveState : session?.connection === "offline" ? "offline" : "saving"
        }
        peers={peers}
        onFollow={(clientId) => presence?.jumpTo(clientId)}
        canUndo={!!binding?.canUndo}
        canRedo={!!binding?.canRedo}
        onUndo={() => binding?.undo()}
        onRedo={() => binding?.redo()}
        readOnly={readOnly}
        onExport={editor ? (format) => void runExport(editor, format, diagram.name) : undefined}
        onHistory={() => setHistoryOpen(true)}
        onMinimap={editor && hasService(editor, "minimap") ? () => setMinimapOpen(toggleMinimap(editor)) : undefined}
        onShortcuts={() => setShortcutsOpen(true)}
        assistantOpen={assistantOpen}
        onAssistant={
          editor && editing
            ? () => {
                setCommentsOpen(false);
                setAssistantOpen((open) => !open);
              }
            : undefined
        }
        commentsOpen={commentsOpen}
        commentCount={openThreads}
        onComments={
          editor
            ? () => {
                setAssistantOpen(false);
                setFocusThread(null);
                setCommentsOpen((open) => !open);
              }
            : undefined
        }
        view={view}
        onView={editor ? setView : undefined}
      />
      )}

      <div
        className={cn(
          "pointer-events-none absolute inset-x-3 bottom-3 z-20 flex flex-col-reverse items-end gap-2 pr-[72px] transition-[padding] duration-200 sm:bottom-5 md:flex-row md:items-end",
          editing ? "md:justify-center" : "md:justify-end",
          filesBeside && "lg:pl-[316px]",
        )}
      >
        {!readOnly && editor && editing && (
          <NotationDock
            activeTool={tool}
            onTool={onTool}
            onCreate={onCreate}
            onAllElements={onAllElements}
            className="pointer-events-auto w-full min-w-0 md:w-auto"
          />
        )}
        <div className={cn("pointer-events-auto flex shrink-0 items-center gap-2", view === "present" && "hidden")}>
          {editor && hasService(editor, "minimap") && (
            <button
              type="button"
              aria-label="Toggle minimap"
              aria-pressed={minimapOpen}
              onClick={() => setMinimapOpen(toggleMinimap(editor))}
              className={cn(
                "hidden size-10 place-items-center rounded-full border border-hairline bg-paper shadow-float hover:bg-fog 2xl:grid",
                minimapOpen && "bg-ink text-paper hover:bg-ink/85",
              )}
            >
              <MapIcon className="size-4" />
            </button>
          )}
          <button
            type="button"
            aria-label="Keyboard shortcuts"
            onClick={() => setShortcutsOpen(true)}
            className="hidden size-10 place-items-center rounded-full border border-hairline bg-paper shadow-float hover:bg-fog 2xl:grid"
          >
            <Keyboard className="size-4" />
          </button>
          <ZoomControl
            zoom={zoom}
            onZoomIn={() => editor && zoomBy(editor, 1.2)}
            onZoomOut={() => editor && zoomBy(editor, 1 / 1.2)}
            onFit={() => editor && zoomToFit(editor)}
            onReset={() => editor && resetZoom(editor)}
          />
        </div>
      </div>

      {editor && !editing && view !== "present" && <ViewBanner mode={view} onExit={() => setView("edit")} />}
      {editor && view === "present" && <PresentMode editor={editor} title={diagram.name} onExit={() => setView("edit")} />}
      {editor && view === "paths" && <PathsPanel editor={editor} />}
      {editor && view === "roles" && <RolesPanel editor={editor} readOnly={readOnly} />}
      {editor && view === "metrics" && <MetricsPanel editor={editor} readOnly={readOnly} />}
      {editor && assistantOpen && editing && (
        <AssistantPanel
          editor={editor}
          diagramId={diagram.id}
          me={me}
          readOnly={readOnly}
          version={changeVersion}
          selection={selection}
          onClose={() => setAssistantOpen(false)}
          className={cn(
            "absolute z-30 rounded-[24px] border border-hairline bg-paper shadow-float",
            inspector.medium ? "bottom-24 right-4 top-20 w-[360px]" : "inset-x-3 bottom-3 h-[65dvh]",
          )}
        />
      )}
      {editor && commentsOpen && view !== "present" && (
        <CommentsPanel
          editor={editor}
          diagramId={diagram.id}
          me={me}
          canModerate={!readOnly}
          selection={selection}
          focusThread={focusThread}
          onClose={() => setCommentsOpen(false)}
          className={cn(
            "absolute z-30 rounded-[24px] border border-hairline bg-paper shadow-float",
            inspector.medium ? "bottom-24 right-4 top-20 w-[360px]" : "inset-x-3 bottom-3 h-[65dvh]",
          )}
        />
      )}
      {editor && view !== "present" && <CommentBadges editor={editor} threads={threads} onOpen={openThread} />}
      {editor && editing && inspectable && inspector.open && !assistantOpen && !commentsOpen && (
        <EditorInspector
          key={selected.id}
          editor={editor}
          element={selected}
          readOnly={readOnly}
          projectId={project.id}
          diagramId={diagram.id}
          onClose={() => inspector.setOpen(false)}
          className={cn(
            "absolute z-30 overflow-y-auto rounded-[24px] border border-hairline bg-paper shadow-float",
            inspector.medium ? "bottom-24 right-4 top-20 w-[320px]" : "inset-x-3 bottom-3 max-h-[60dvh]",
          )}
        />
      )}
      {editor && editing && inspectable && !inspector.open && !assistantOpen && !commentsOpen && (
        <button
          type="button"
          onClick={() => inspector.setOpen(true)}
          className="absolute right-3 top-[68px] z-20 flex h-10 items-center gap-2 rounded-full border border-hairline bg-paper px-4 text-[13px] font-medium shadow-float hover:bg-fog sm:right-4 sm:top-20"
        >
          <SlidersHorizontal className="size-4" /> Properties
        </button>
      )}

      {!editor && !failed && !session?.ended && (
        <div className="absolute inset-0 z-10 grid place-items-center">
          <div className="flex items-center gap-3 rounded-full border border-hairline bg-paper px-4 py-2.5 text-[14px] text-slate shadow-float">
            <span className="size-2 animate-pulse rounded-full bg-cobalt" />
            {session?.connection === "offline" ? "Can't reach the server. Retrying…" : "Opening diagram…"}
          </div>
        </div>
      )}
      {failed && (
        <SessionEndedOverlay
          title="This diagram couldn't be opened"
          text={failed}
          projectId={project.id}
        />
      )}
      {session?.ended && !restored && <SessionEndedOverlay code={session.ended.code} projectId={project.id} />}
      {restored && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-paper/60 backdrop-blur-[2px]">
          <div className="flex items-center gap-3 rounded-full border border-hairline bg-paper px-4 py-2.5 text-[14px] text-slate shadow-float">
            <span className="size-2 animate-pulse rounded-full bg-cobalt" /> Loading the restored version…
          </div>
        </div>
      )}

      {editor && editing && !failed && !session?.ended && !suggestFor && (
        <AiCommand
          editor={editor}
          diagramId={diagram.id}
          me={me}
          selection={selection}
          open={commandOpen}
          readOnly={readOnly}
          onOpenChange={setCommandOpen}
        />
      )}
      {editor && binding && aiChange && (
        <AiChangeBar
          key={aiChange.tag}
          editor={editor}
          binding={binding}
          change={aiChange}
          version={changeVersion}
          onDone={clearAiChange}
        />
      )}
      {editor && suggestFor && !readOnly && (
        <SuggestPopover
          key={suggestFor}
          editor={editor}
          diagramId={diagram.id}
          elementId={suggestFor}
          me={me}
          onClose={() => setSuggestFor(null)}
        />
      )}
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <VersionHistoryDialog
        diagramId={diagram.id}
        diagramName={diagram.name}
        canRestore={!readOnly}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
      />
    </div>
  );
}
