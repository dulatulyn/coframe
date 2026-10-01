"use client";

import { ExternalLink, Loader2, Minus, Plus, Scan } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Logo, LogoMark } from "@/components/app/logo";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { APP_NAME } from "@/config/brand";
import { usePublicDiagram } from "@/lib/api/hooks";
import { cn } from "@/lib/utils";

import { zoomBy, zoomToFit } from "./actions";
import { createEditor, service, type BpmnEditor } from "./modeler";
import { MetricsPanel } from "./views/metrics-panel";
import { VIEWS, viewInfo, type ViewMode } from "./views/modes";
import { PathsPanel } from "./views/paths-panel";
import { PresentMode } from "./views/present-mode";
import { RolesPanel } from "./views/roles-panel";
import { ViewBanner } from "./views/view-banner";

export function PublicViewer({ token, embedded }: { token: string; embedded: boolean }) {
  const { data, error, isLoading } = usePublicDiagram(token);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [editor, setEditor] = useState<BpmnEditor | null>(null);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState<ViewMode>("edit");

  useEffect(() => {
    if (!data || !canvasRef.current) return;
    let disposed = false;
    let viewer: BpmnEditor | null = null;
    (async () => {
      viewer = await createEditor(canvasRef.current!, { readOnly: true });
      if (disposed) return viewer.destroy();
      await viewer.importXML(data.xml);
      if (disposed) return;
      zoomToFit(viewer);
      setEditor(viewer);
    })().catch(() => !disposed && setFailed(true));
    return () => {
      disposed = true;
      viewer?.destroy();
      setEditor(null);
    };
  }, [data]);

  useEffect(() => {
    if (!editor) return;
    const toggle = service(editor, "toggleMode");
    if (toggle._active !== (view === "simulate")) toggle.toggleMode(view === "simulate");
    if (view === "edit") return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setView("edit");
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editor, view]);

  useEffect(() => {
    if (data) document.title = `${data.name} · ${APP_NAME}`;
  }, [data]);

  const missing = !isLoading && (error || !data);
  const fullUrl = typeof window === "undefined" ? `/v/${token}` : `${window.location.origin}/v/${token}`;

  return (
    <div className={cn("coframe-editor isolate overflow-hidden bg-canvas", view === "present" ? "fixed inset-0 z-[60]" : "fixed inset-0")}>
      <div ref={canvasRef} className="absolute inset-0" />

      {(isLoading || (data && !editor && !failed)) && (
        <div className="absolute inset-0 grid place-items-center text-slate">
          <Loader2 className="size-5 animate-spin" />
        </div>
      )}
      {(missing || failed) && (
        <div className="absolute inset-0 grid place-items-center px-6 text-center">
          <div>
            <h1 className="display text-[28px]">This diagram isn&apos;t shared anymore.</h1>
            <p className="mt-2 text-[15px] text-slate">The link may have been turned off by its owner.</p>
            <Button asChild className="mt-5">
              <Link href="/">Go to {APP_NAME}</Link>
            </Button>
          </div>
        </div>
      )}

      {data && view !== "present" && (
        <div className="pointer-events-none absolute inset-x-3 top-3 z-30 flex items-start justify-between gap-2 sm:inset-x-4 sm:top-4">
          {!embedded ? (
            <div className="pointer-events-auto flex h-12 min-w-0 items-center gap-3 rounded-full border border-hairline bg-paper pl-4 pr-4 shadow-float">
              <Logo className="shrink-0 max-sm:[&>span]:hidden" />
              <span className="h-5 w-px shrink-0 bg-hairline" />
              <div className="min-w-0 leading-tight">
                <p className="truncate text-[14px] font-semibold">{data.name}</p>
                <p className="truncate text-[12px] text-slate">{data.projectName} · view only</p>
              </div>
            </div>
          ) : (
            <span />
          )}
          <div className="pointer-events-auto flex h-12 shrink-0 items-center gap-1.5 rounded-full border border-hairline bg-paper px-1.5 shadow-float">
            {editor && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "flex h-9 items-center gap-1.5 rounded-full px-3 text-[14px] font-medium",
                      view !== "edit" ? "bg-ink text-paper" : "hover:bg-fog",
                    )}
                  >
                    {(() => {
                      const Icon = viewInfo(view === "edit" ? "simulate" : view).icon;
                      return <Icon className="size-4" />;
                    })()}
                    {view === "edit" ? "Views" : viewInfo(view).label}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64" onCloseAutoFocus={(e) => e.preventDefault()}>
                  {VIEWS.map((v) => (
                    <DropdownMenuItem key={v.id} onSelect={() => setView(v.id)} className={cn(view === v.id && "bg-fog")}>
                      <v.icon />
                      <span className="flex flex-col">
                        <span>{v.id === "edit" ? "Diagram" : v.label}</span>
                        <span className="text-[12px] text-slate">{v.id === "edit" ? "Just the model" : v.hint}</span>
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {embedded ? (
              <Button asChild size="sm" variant="ghost" className="h-9">
                <a href={fullUrl} target="_blank" rel="noreferrer">
                  <LogoMark size={18} /> Open
                </a>
              </Button>
            ) : (
              <Button asChild size="sm" className="h-9 max-sm:hidden">
                <Link href="/">
                  Try {APP_NAME} <ExternalLink />
                </Link>
              </Button>
            )}
          </div>
        </div>
      )}

      {editor && view !== "edit" && view !== "present" && <ViewBanner mode={view} onExit={() => setView("edit")} />}
      {editor && view === "paths" && <PathsPanel editor={editor} />}
      {editor && view === "roles" && <RolesPanel editor={editor} readOnly />}
      {editor && view === "metrics" && <MetricsPanel editor={editor} readOnly />}
      {editor && data && view === "present" && <PresentMode editor={editor} title={data.name} onExit={() => setView("edit")} />}

      {editor && view !== "present" && (
        <div className="absolute bottom-4 left-4 z-20 flex items-center gap-1 rounded-full border border-hairline bg-paper p-1 shadow-float">
          <button type="button" aria-label="Zoom out" onClick={() => zoomBy(editor, 1 / 1.2)} className="grid size-9 place-items-center rounded-full hover:bg-fog">
            <Minus className="size-4" />
          </button>
          <button type="button" aria-label="Zoom in" onClick={() => zoomBy(editor, 1.2)} className="grid size-9 place-items-center rounded-full hover:bg-fog">
            <Plus className="size-4" />
          </button>
          <button type="button" aria-label="Fit to screen" onClick={() => zoomToFit(editor)} className="grid size-9 place-items-center rounded-full hover:bg-fog">
            <Scan className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}
