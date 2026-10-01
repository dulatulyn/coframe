"use client";

import { Download, History, Loader2, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { UserAvatar } from "@/components/editor-chrome/presence";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { errorMessage } from "@/lib/api/client";
import { fetchVersionXml, useRestoreVersion, useVersions } from "@/lib/api/hooks";
import type { DiagramVersion } from "@/lib/api/types";
import { timeAgo } from "@/lib/time";
import { cn } from "@/lib/utils";

const stamp = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

function VersionPreview({ diagramId, version }: { diagramId: string; version: DiagramVersion }) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    let disposed = false;
    let viewer: { destroy(): void; importXML(xml: string): Promise<unknown>; get(name: string): any } | undefined;
    (async () => {
      const [{ default: NavigatedViewer }, xml] = await Promise.all([
        import("bpmn-js/lib/NavigatedViewer"),
        fetchVersionXml(diagramId, version.id),
      ]);
      if (disposed || !ref.current) return;
      viewer = new NavigatedViewer({ container: ref.current });
      await viewer.importXML(xml);
      if (disposed) return;
      viewer.get("canvas").zoom("fit-viewport", "auto");
      setState("ready");
    })().catch(() => !disposed && setState("failed"));
    return () => {
      disposed = true;
      viewer?.destroy();
    };
  }, [diagramId, version.id]);

  return (
    <div className="relative size-full">
      <div ref={ref} className="absolute inset-0" />
      {state !== "ready" && (
        <div className="absolute inset-0 grid place-items-center text-[14px] text-slate">
          {state === "loading" ? <Loader2 className="size-5 animate-spin" /> : "This version couldn't be shown."}
        </div>
      )}
    </div>
  );
}

type Ghost = { name?: string; bounds?: { x: number; y: number; width: number; height: number }; waypoints?: { x: number; y: number }[] };
type Diff = { added: string[]; changed: string[]; moved: string[]; removed: string[]; ghosts: Ghost[] };

function label(element: any): string {
  const kind = String(element?.$type ?? "").replace("bpmn:", "").replace(/([a-z])([A-Z])/g, "$1 $2");
  return element?.name ? `${kind} “${element.name}”` : kind;
}

async function compare(before: string, after: string): Promise<Diff> {
  const [{ BpmnModdle }, { diff }] = await Promise.all([import("bpmn-moddle"), import("bpmn-js-differ")]);
  const moddle = new BpmnModdle();
  const [a, b] = await Promise.all([moddle.fromXML(before), moddle.fromXML(after)]);
  const changes = diff(a.rootElement, b.rootElement);
  const visible = (record: Record<string, any>) =>
    Object.entries(record)
      .filter(([, value]) => !String(value?.$type ?? value?.model?.$type ?? "").startsWith("bpmndi:"))
      .map(([id]) => id);
  const added = visible(changes._added);
  const changed = visible(changes._changed).filter((id) => !added.includes(id));
  const moved = Object.keys(changes._layoutChanged).filter((id) => !added.includes(id) && !changed.includes(id));
  const removed = Object.values(changes._removed)
    .filter((e: any) => !String(e?.$type ?? "").startsWith("bpmndi:") && e?.$type !== "bpmn:Definitions")
    .map(label);
  const removedIds = new Set(Object.keys(changes._removed));
  const ghosts: Ghost[] = ((a.rootElement as any).diagrams ?? [])
    .flatMap((d: any) => d.plane?.planeElement ?? [])
    .filter((di: any) => removedIds.has(di.bpmnElement?.id))
    .map((di: any) => ({ name: di.bpmnElement?.name, bounds: di.bounds, waypoints: di.waypoint }));
  return { added, changed, moved, removed, ghosts };
}

function ChangesPreview({ diagramId, version, latest }: { diagramId: string; version: DiagramVersion; latest: DiagramVersion }) {
  const ref = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState<Diff | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let disposed = false;
    let viewer: { destroy(): void; importXML(xml: string): Promise<unknown>; get(name: string): any } | undefined;
    (async () => {
      const [{ default: NavigatedViewer }, before, after] = await Promise.all([
        import("bpmn-js/lib/NavigatedViewer"),
        fetchVersionXml(diagramId, version.id),
        fetchVersionXml(diagramId, latest.id),
      ]);
      const changes = await compare(before, after);
      if (disposed || !ref.current) return;
      viewer = new NavigatedViewer({ container: ref.current });
      await viewer.importXML(after);
      if (disposed) return;
      const canvas = viewer.get("canvas");
      const registry = viewer.get("elementRegistry");
      const mark = (ids: string[], marker: string) => ids.forEach((id) => registry.get(id) && canvas.addMarker(id, marker));
      mark(changes.added, "coframe-diff-added");
      mark(changes.changed, "coframe-diff-changed");
      mark(changes.moved, "coframe-diff-moved");
      const layer = canvas.getLayer("coframe-removed", 2000) as SVGGElement;
      const svg = (tag: string, attrs: Record<string, string | number>, text?: string) => {
        const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
        for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
        if (text) node.textContent = text;
        layer.appendChild(node);
      };
      const ghostStyle = { fill: "none", stroke: "#e5484d", "stroke-width": 2, "stroke-dasharray": "5 4" };
      for (const ghost of changes.ghosts) {
        if (ghost.waypoints?.length) {
          svg("polyline", { points: ghost.waypoints.map((p) => `${p.x},${p.y}`).join(" "), ...ghostStyle });
        } else if (ghost.bounds) {
          const { x, y, width, height } = ghost.bounds;
          svg("rect", { x, y, width, height, rx: 10, ...ghostStyle, fill: "rgba(229,72,77,0.06)" });
          if (ghost.name && width >= 60) {
            const style = { "text-anchor": "middle", "dominant-baseline": "middle", "font-size": 11, fill: "#c62a2f" };
            svg("text", { x: x + width / 2, y: y + height / 2, ...style, "text-decoration": "line-through" }, ghost.name);
          }
        }
      }
      canvas.zoom("fit-viewport", "auto");
      setResult(changes);
    })().catch(() => !disposed && setFailed(true));
    return () => {
      disposed = true;
      viewer?.destroy();
    };
  }, [diagramId, version.id, latest.id]);

  const empty = result && !result.added.length && !result.changed.length && !result.moved.length && !result.removed.length;
  return (
    <div className="relative flex size-full flex-col">
      <div ref={ref} className="relative min-h-0 flex-1" />
      {!result && (
        <div className="absolute inset-0 grid place-items-center text-[14px] text-slate">
          {failed ? "These versions couldn't be compared." : <Loader2 className="size-5 animate-spin" />}
        </div>
      )}
      {result && (
        <div className="max-h-[40%] overflow-y-auto border-t border-hairline bg-paper px-3 py-2.5 text-[13px]">
          {empty ? (
            <p className="text-slate">Nothing changed since this version.</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <Legend color="#30a46c" text={`${result.added.length} added`} />
                <Legend color="#f5a524" text={`${result.changed.length} changed`} />
                <Legend color="#3e63dd" text={`${result.moved.length} moved`} />
                <Legend color="#e5484d" text={`${result.removed.length} removed`} />
              </div>
              {result.removed.length > 0 && (
                <p className="mt-1.5 leading-5 text-slate">Removed: {result.removed.join(", ")}</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Legend({ color, text }: { color: string; text: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="size-2.5 rounded-full" style={{ background: color }} /> {text}
    </span>
  );
}

export function VersionHistoryDialog({
  diagramId,
  diagramName,
  canRestore,
  open,
  onOpenChange,
}: {
  diagramId: string;
  diagramName: string;
  canRestore: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: versions, isLoading } = useVersions(diagramId, open);
  const restore = useRestoreVersion(diagramId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  const selected = versions?.find((v) => v.id === selectedId) ?? versions?.[0] ?? null;
  const latest = versions?.[0] ?? null;
  const [mode, setMode] = useState<"snapshot" | "changes">("snapshot");
  const comparing = mode === "changes" && selected && latest && selected.id !== latest.id;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[min(720px,calc(100dvh-32px))] max-w-[min(1100px,calc(100vw-32px))] grid-rows-[auto_1fr] sm:max-w-[min(1100px,calc(100vw-32px))]">
        <DialogHeader>
          <DialogTitle>Version history</DialogTitle>
          <DialogDescription>
            Snapshots of “{diagramName}” taken while people edit. Restoring keeps the current content as a version too.
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 gap-4 md:grid-cols-[300px_minmax(0,1fr)]">
          <div className="min-h-0 overflow-y-auto rounded-2xl bg-fog p-1.5">
            {isLoading && (
              <div className="grid h-32 place-items-center text-slate">
                <Loader2 className="size-5 animate-spin" />
              </div>
            )}
            {versions?.length === 0 && (
              <p className="px-3 py-4 text-[14px] leading-5 text-slate">
                No versions yet. They appear while the diagram is being edited.
              </p>
            )}
            {versions?.map((v, i) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setSelectedId(v.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors",
                  selected?.id === v.id ? "bg-paper shadow-sm" : "hover:bg-paper/60",
                )}
              >
                {v.author ? (
                  <UserAvatar user={v.author} size={28} ring={false} />
                ) : (
                  <span className="grid size-7 place-items-center rounded-full bg-fog-strong text-slate">
                    <History className="size-3.5" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium">
                    {i === 0 ? "Latest" : stamp.format(new Date(v.createdAt))}
                  </span>
                  <span className="block truncate text-[12px] text-slate">
                    {v.source === "restore" ? "Restored" : "Autosave"} · {timeAgo(v.createdAt, now)}
                    {v.author ? ` · ${v.author.name}` : ""}
                  </span>
                </span>
              </button>
            ))}
          </div>
          <div className="flex min-h-[320px] min-w-0 flex-col overflow-hidden rounded-2xl border border-hairline bg-canvas">
            <div className="min-h-0 flex-1">
              {comparing ? (
                <ChangesPreview key={`${selected.id}-${latest.id}`} diagramId={diagramId} version={selected} latest={latest} />
              ) : (
                selected && <VersionPreview key={selected.id} diagramId={diagramId} version={selected} />
              )}
            </div>
            {selected && (
              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-hairline bg-paper px-3 py-2.5">
                <div className="mr-auto flex rounded-full bg-fog p-0.5 text-[13px] font-medium">
                  {(
                    [
                      ["snapshot", "Snapshot"],
                      ["changes", "Changes since"],
                    ] as const
                  ).map(([id, text]) => (
                    <button
                      key={id}
                      type="button"
                      disabled={id === "changes" && selected.id === latest?.id}
                      onClick={() => setMode(id)}
                      title={id === "changes" ? "What changed between this version and now" : undefined}
                      className={cn(
                        "rounded-full px-3 py-1 disabled:text-slate-soft",
                        mode === id && !(id === "changes" && selected.id === latest?.id) ? "bg-paper shadow-sm" : "text-slate",
                      )}
                    >
                      {text}
                    </button>
                  ))}
                </div>
                <Button asChild variant="ghost" size="sm">
                  <a href={`/api/diagrams/${diagramId}/versions/${selected.id}/xml`} download>
                    <Download /> Download .bpmn
                  </a>
                </Button>
                {canRestore && selected.id !== versions?.[0]?.id && (
                  <Button
                    size="sm"
                    disabled={restore.isPending}
                    onClick={async () => {
                      try {
                        await restore.mutateAsync(selected.id);
                        toast.success("Version restored");
                        onOpenChange(false);
                      } catch (error) {
                        toast.error(errorMessage(error));
                      }
                    }}
                  >
                    {restore.isPending ? <Loader2 className="animate-spin" /> : <RotateCcw />} Restore this version
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
