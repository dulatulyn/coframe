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
              {selected && <VersionPreview key={selected.id} diagramId={diagramId} version={selected} />}
            </div>
            {selected && (
              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-hairline bg-paper px-3 py-2.5">
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
