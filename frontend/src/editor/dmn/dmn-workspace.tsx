"use client";

import "dmn-js/dist/assets/diagram-js.css";
import "dmn-js/dist/assets/dmn-js-shared.css";
import "dmn-js/dist/assets/dmn-js-drd.css";
import "dmn-js/dist/assets/dmn-js-decision-table.css";
import "dmn-js/dist/assets/dmn-js-decision-table-controls.css";
import "dmn-js/dist/assets/dmn-js-literal-expression.css";
import "dmn-js/dist/assets/dmn-js-boxed-expression.css";
import "dmn-js/dist/assets/dmn-js-boxed-expression-controls.css";
import "dmn-js/dist/assets/dmn-font/css/dmn-embedded.css";
import "../editor.css";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Table2, Workflow } from "lucide-react";
import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { toast } from "sonner";

import type { SaveState } from "@/components/editor-chrome/status";
import { api, errorMessage } from "@/lib/api/client";
import { cn } from "@/lib/utils";

const SAVE_DELAY_MS = 800;

type View = { id: string; type: string; element: { id: string; name?: string } };

export type DmnWorkspaceHandle = { undo(): void; redo(): void };
export type DmnState = { saveState: SaveState; canUndo: boolean; canRedo: boolean };

export async function fetchDiagramXml(diagramId: string): Promise<string> {
  const res = await fetch(`/api/diagrams/${diagramId}/xml`, { credentials: "same-origin" });
  if (!res.ok) throw new Error("load_failed");
  return res.text();
}

export function useDiagramXml(diagramId: string | null) {
  return useQuery({
    queryKey: ["content", diagramId],
    queryFn: () => fetchDiagramXml(diagramId!),
    enabled: !!diagramId,
    refetchOnWindowFocus: false,
  });
}

export function DmnWorkspace({
  diagramId,
  readOnly,
  onState,
  onXml,
  className,
  ref,
}: {
  diagramId: string;
  readOnly: boolean;
  onState?: (state: DmnState) => void;
  onXml?: (xml: string) => void;
  className?: string;
  ref?: Ref<DmnWorkspaceHandle>;
}) {
  const container = useRef<HTMLDivElement>(null);
  const modeler = useRef<any>(null);
  const lastSaved = useRef<string | null>(null);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const state = useRef<DmnState>({ saveState: "saved", canUndo: false, canRedo: false });
  const [views, setViews] = useState<View[]>([]);
  const [active, setActive] = useState<View | null>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const qc = useQueryClient();
  const content = useDiagramXml(diagramId);
  const callbacks = useRef({ onState, onXml });
  useEffect(() => {
    callbacks.current = { onState, onXml };
  });

  const report = useCallback((patch: Partial<DmnState>) => {
    state.current = { ...state.current, ...patch };
    callbacks.current.onState?.(state.current);
  }, []);

  const save = useCallback(async () => {
    const instance = modeler.current;
    if (!instance || readOnly) return;
    try {
      const { xml } = await instance.saveXML({ format: true });
      callbacks.current.onXml?.(xml);
      if (xml === lastSaved.current) {
        dirty.current = false;
        report({ saveState: "saved" });
        return;
      }
      report({ saveState: "saving" });
      await api(`/diagrams/${diagramId}/content`, { method: "PUT", body: { xml } });
      lastSaved.current = xml;
      dirty.current = false;
      report({ saveState: "saved" });
      qc.setQueryData(["content", diagramId], xml);
    } catch (error) {
      report({ saveState: "offline" });
      toast.error(errorMessage(error));
    }
  }, [diagramId, readOnly, qc, report]);

  useImperativeHandle(ref, () => ({
    undo: () => modeler.current?.getActiveViewer()?.get("commandStack").undo(),
    redo: () => modeler.current?.getActiveViewer()?.get("commandStack").redo(),
  }));

  useEffect(() => {
    let disposed = false;
    (async () => {
      const { default: DmnEditor } = readOnly ? await import("dmn-js/lib/Viewer") : await import("dmn-js/lib/Modeler");
      if (disposed || !container.current) return;
      const instance = new DmnEditor({ container: container.current });
      modeler.current = instance;
      const bindActive = () => {
        const viewer = instance.getActiveViewer();
        if (!viewer || readOnly) return;
        const eventBus = viewer.get("eventBus");
        eventBus.on("commandStack.changed", () => {
          const stack = viewer.get("commandStack");
          report({ canUndo: stack.canUndo(), canRedo: stack.canRedo(), saveState: "saving" });
          dirty.current = true;
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => void save(), SAVE_DELAY_MS);
        });
      };
      instance.on("views.changed", ({ views: next, activeView }: { views: View[]; activeView: View }) => {
        setViews(next);
        setActive(activeView);
        bindActive();
      });
      setReady(true);
    })().catch(() => !disposed && setFailed(true));
    return () => {
      disposed = true;
      if (timer.current) clearTimeout(timer.current);
      if (dirty.current) void save();
      modeler.current?.destroy();
      modeler.current = null;
      setReady(false);
    };
  }, [readOnly, save, report]);

  useEffect(() => {
    const instance = modeler.current;
    const xml = content.data;
    if (!instance || !xml || dirty.current || xml === lastSaved.current) return;
    const keep = instance.getActiveView()?.element?.id;
    lastSaved.current = xml;
    (async () => {
      await instance.importXML(xml);
      const list: View[] = instance.getViews();
      const target = list.find((v) => v.element.id === keep) ?? list.find((v) => v.type === "decisionTable") ?? list[0];
      if (target) await instance.open(target);
      callbacks.current.onXml?.(xml);
    })().catch(() => setFailed(true));
  }, [content.data, ready]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirty.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  return (
    <div className={cn("relative flex min-h-0 flex-col", className)}>
      {views.length > 1 && (
        <div className="flex gap-1 overflow-x-auto border-b border-hairline px-3 py-2">
          {views.map((view) => (
            <button
              key={view.id}
              type="button"
              onClick={() => void modeler.current?.open(view)}
              className={cn(
                "flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium",
                active?.id === view.id ? "bg-ink text-paper" : "text-slate hover:bg-fog hover:text-ink",
              )}
            >
              {view.type === "drd" ? <Workflow className="size-3.5" /> : <Table2 className="size-3.5" />}
              {view.type === "drd" ? "Requirements" : view.element.name || view.element.id}
            </button>
          ))}
        </div>
      )}
      <div ref={container} className="coframe-dmn min-h-0 flex-1 overflow-auto" />
      {(failed || content.error) && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-paper/70">
          <p className="rounded-full border border-hairline bg-paper px-4 py-2.5 text-[14px] shadow-float">
            This decision couldn&apos;t be opened.
          </p>
        </div>
      )}
    </div>
  );
}
