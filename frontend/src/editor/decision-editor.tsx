"use client";

import "dmn-js/dist/assets/diagram-js.css";
import "dmn-js/dist/assets/dmn-js-shared.css";
import "dmn-js/dist/assets/dmn-js-drd.css";
import "dmn-js/dist/assets/dmn-js-decision-table.css";
import "dmn-js/dist/assets/dmn-js-decision-table-controls.css";
import "dmn-js/dist/assets/dmn-js-literal-expression.css";
import "dmn-js/dist/assets/dmn-font/css/dmn-embedded.css";
import "./editor.css";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Table2, Workflow } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import type { SaveState } from "@/components/editor-chrome/status";
import { api, errorMessage } from "@/lib/api/client";
import type { Diagram, Project, User } from "@/lib/api/types";
import { useFilesPanel } from "@/lib/panels";
import { cn } from "@/lib/utils";

import { EditorTopBar } from "./ui/editor-top-bar";

const SAVE_DELAY_MS = 800;

type View = { id: string; type: string; element: { id: string; name?: string } };

async function fetchXml(diagramId: string): Promise<string> {
  const res = await fetch(`/api/diagrams/${diagramId}/xml`, { credentials: "same-origin" });
  if (!res.ok) throw new Error("load_failed");
  return res.text();
}

export function DecisionEditor({ diagram, project, me }: { diagram: Diagram; project: Project; me: User }) {
  const readOnly = diagram.access !== "edit";
  const container = useRef<HTMLDivElement>(null);
  const modeler = useRef<any>(null);
  const lastSaved = useRef<string | null>(null);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [views, setViews] = useState<View[]>([]);
  const [active, setActive] = useState<View | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const files = useFilesPanel();
  const [history, setHistory] = useState({ undo: false, redo: false });
  const qc = useQueryClient();
  const content = useQuery({ queryKey: ["content", diagram.id], queryFn: () => fetchXml(diagram.id), refetchOnWindowFocus: false });

  const save = useCallback(async () => {
    const instance = modeler.current;
    if (!instance || readOnly) return;
    try {
      const { xml } = await instance.saveXML({ format: true });
      if (xml === lastSaved.current) {
        dirty.current = false;
        setSaveState("saved");
        return;
      }
      setSaveState("saving");
      await api(`/diagrams/${diagram.id}/content`, { method: "PUT", body: { xml } });
      lastSaved.current = xml;
      dirty.current = false;
      setSaveState("saved");
      qc.setQueryData(["content", diagram.id], xml);
    } catch (error) {
      setSaveState("offline");
      toast.error(errorMessage(error));
    }
  }, [diagram.id, readOnly, qc]);

  useEffect(() => {
    let disposed = false;
    (async () => {
      const { default: DmnEditor } = readOnly ? await import("dmn-js/lib/Viewer") : await import("dmn-js/lib/Modeler");
      if (disposed || !container.current) return;
      const instance = new DmnEditor({ container: container.current });
      modeler.current = instance;
      const bindActive = () => {
        const viewer = instance.getActiveViewer();
        if (!viewer) return;
        const eventBus = viewer.get("eventBus");
        const onChange = () => {
          const stack = viewer.get("commandStack");
          setHistory({ undo: stack.canUndo(), redo: stack.canRedo() });
          if (readOnly) return;
          dirty.current = true;
          setSaveState("saving");
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => void save(), SAVE_DELAY_MS);
        };
        if (!readOnly) eventBus.on("commandStack.changed", onChange);
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
  }, [readOnly, save]);

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

  const stack = () => modeler.current?.getActiveViewer()?.get("commandStack");

  return (
    <div className="coframe-decision absolute inset-0 isolate overflow-hidden bg-canvas">
      <EditorTopBar
        diagram={diagram}
        project={project}
        me={me}
        saveState={saveState}
        peers={[]}
        onFollow={() => {}}
        canUndo={history.undo}
        canRedo={history.redo}
        onUndo={() => stack()?.undo()}
        onRedo={() => stack()?.redo()}
        readOnly={readOnly}
        view="edit"
      />
      <div className="absolute inset-x-3 bottom-3 top-[76px] flex flex-col overflow-hidden rounded-[24px] border border-hairline bg-paper shadow-float sm:inset-x-4 sm:bottom-4 sm:top-20" style={files.wide && files.open ? { left: 332 } : undefined}>
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
      </div>
      {(failed || content.error) && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-paper/70">
          <p className="rounded-full border border-hairline bg-paper px-4 py-2.5 text-[14px] shadow-float">
            This decision couldn&apos;t be opened.
          </p>
        </div>
      )}
    </div>
  );
}
