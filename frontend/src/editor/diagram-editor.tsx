"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Keyboard, Map as MapIcon, SlidersHorizontal } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import type { CatalogItem } from "@/components/bpmn/catalog";
import { NotationDock, type ToolId } from "@/components/editor-chrome/notation-dock";
import { ZoomControl } from "@/components/editor-chrome/status";
import { keys, uploadPreview } from "@/lib/api/hooks";
import type { Diagram, Project, User } from "@/lib/api/types";
import { useProjectUi } from "@/lib/project-ui";
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
import { BpmnBinding } from "./collab/binding";
import { PresenceController, type Peer } from "./collab/presence";
import { DiagramSession } from "./collab/session";
import { createEditor, hasService, service, type BpmnEditor } from "./modeler";
import { EditorInspector } from "./ui/editor-inspector";
import { EditorTopBar } from "./ui/editor-top-bar";
import { SessionEndedOverlay } from "./ui/session-ended";
import { ShortcutsDialog } from "./ui/shortcuts-dialog";

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
  const [, setUndoVersion] = useState(0);
  const [failed, setFailed] = useState<string | null>(null);
  const [minimapOpen, setMinimapOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const inspectorOpen = useProjectUi((s) => s.inspectorOpen);
  const filesOpen = useProjectUi((s) => s.filesOpen);
  const setInspectorOpen = useProjectUi((s) => s.setInspectorOpen);
  const qc = useQueryClient();
  useSession(session);

  useEffect(() => {
    let disposed = false;
    const s = new DiagramSession(diagram.id);
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
      await s.whenSynced();
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
    };
  }, [diagram.id, readOnly]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, [contenteditable=true]")) return;
      if (e.key === "?") setShortcutsOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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

  return (
    <div className="coframe-editor absolute inset-0 isolate overflow-hidden bg-canvas">
      <div ref={canvasRef} className="absolute inset-0" />
      <div ref={overlayRef} className="pointer-events-none absolute inset-0 z-10 overflow-hidden" />

      <EditorTopBar
        diagram={diagram}
        project={project}
        me={me}
        saveState={session?.synced ? saveState : session?.connection === "offline" ? "offline" : "saving"}
        peers={peers}
        onFollow={(clientId) => presence?.jumpTo(clientId)}
        canUndo={!!binding?.canUndo}
        canRedo={!!binding?.canRedo}
        onUndo={() => binding?.undo()}
        onRedo={() => binding?.redo()}
        readOnly={readOnly}
        onExport={editor ? (format) => void runExport(editor, format, diagram.name) : undefined}
      />

      {!readOnly && editor && (
        <NotationDock
          activeTool={tool}
          onTool={onTool}
          onCreate={onCreate}
          onAllElements={onAllElements}
          className="absolute bottom-5 z-20 -translate-x-1/2 transition-[left] duration-200"
          style={{ left: `calc(50% + ${filesOpen ? 158 : 0}px - 180px)` }}
        />
      )}

      <div className="absolute bottom-5 right-24 z-20 flex items-center gap-2">
        {editor && hasService(editor, "minimap") && (
          <button
            type="button"
            aria-label="Toggle minimap"
            aria-pressed={minimapOpen}
            onClick={() => setMinimapOpen(toggleMinimap(editor))}
            className={cn(
              "grid size-10 place-items-center rounded-full border border-hairline bg-paper shadow-float hover:bg-fog",
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
          className="grid size-10 place-items-center rounded-full border border-hairline bg-paper shadow-float hover:bg-fog"
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

      {editor && inspectable && inspectorOpen && (
        <EditorInspector
          key={selected.id}
          editor={editor}
          element={selected}
          readOnly={readOnly}
          onClose={() => setInspectorOpen(false)}
          className="absolute bottom-24 right-4 top-20 z-20 w-[320px] overflow-y-auto rounded-[24px] border border-hairline bg-paper shadow-float"
        />
      )}
      {editor && inspectable && !inspectorOpen && (
        <button
          type="button"
          onClick={() => setInspectorOpen(true)}
          className="absolute right-4 top-20 z-20 flex h-10 items-center gap-2 rounded-full border border-hairline bg-paper px-4 text-[13px] font-medium shadow-float hover:bg-fog"
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
      {session?.ended && <SessionEndedOverlay code={session.ended.code} projectId={project.id} />}

      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  );
}
