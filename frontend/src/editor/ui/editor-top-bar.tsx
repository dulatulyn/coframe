"use client";

import { ClipboardCopy, Code2, Download, FileText, History, Image as ImageIcon, MoreHorizontal, PanelLeft, Redo2, Share2, Undo2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { SaveWorkButton } from "@/components/app/guest";
import { UserMenu } from "@/components/app/user-menu";
import { ShareDialog } from "@/components/jam/share-dialog";
import { UserAvatar } from "@/components/editor-chrome/presence";
import { JamChip, SaveStatus, type SaveState } from "@/components/editor-chrome/status";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { errorMessage } from "@/lib/api/client";
import { useUpdateDiagram } from "@/lib/api/hooks";
import type { Diagram, Project, User } from "@/lib/api/types";
import { useProjectUi } from "@/lib/project-ui";
import { cn } from "@/lib/utils";

import type { Peer } from "../collab/presence";
import type { ExportFormat } from "../actions";

export function EditorTopBar({
  diagram,
  project,
  me,
  saveState,
  peers,
  onFollow,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  readOnly,
  onExport,
  onHistory,
}: {
  diagram: Diagram;
  project: Project;
  me: User;
  saveState: SaveState;
  peers: Peer[];
  onFollow: (clientId: number) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  readOnly: boolean;
  onExport?: (format: ExportFormat) => void;
  onHistory?: () => void;
}) {
  const { filesOpen, setFilesOpen } = useProjectUi();
  const [shareOpen, setShareOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const update = useUpdateDiagram(project.id);

  const people = peers.filter((p, i) => peers.findIndex((q) => q.user.id === p.user.id) === i && p.user.id !== me.id);

  const commitName = async (value: string) => {
    setEditingName(false);
    const name = value.trim();
    if (!name || name === diagram.name) return;
    try {
      await update.mutateAsync({ id: diagram.id, name });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <>
      <div className="absolute left-4 top-4 z-30 flex h-12 max-w-[calc(50%-24px)] items-center gap-1 rounded-full border border-hairline bg-paper pl-1.5 pr-4 shadow-float">
        {!filesOpen && (
          <button
            type="button"
            aria-label="Show files"
            onClick={() => setFilesOpen(true)}
            className="grid size-9 shrink-0 place-items-center rounded-full bg-fog hover:bg-fog-strong"
          >
            <PanelLeft className="size-[18px]" strokeWidth={1.75} />
          </button>
        )}
        <Link
          href={`/w/${project.workspaceId}`}
          className={cn("truncate text-[14px] text-slate hover:text-ink", filesOpen ? "ml-2.5" : "ml-2")}
        >
          {project.name}
        </Link>
        <span className="text-slate-soft">/</span>
        {editingName && !readOnly ? (
          <input
            autoFocus
            defaultValue={diagram.name}
            maxLength={200}
            onFocus={(e) => e.currentTarget.select()}
            onBlur={(e) => commitName(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") setEditingName(false);
            }}
            className="w-48 min-w-0 rounded-lg bg-fog px-2 py-1 text-[14px] font-semibold outline-none ring-2 ring-cobalt/30"
          />
        ) : (
          <button
            type="button"
            onClick={() => !readOnly && setEditingName(true)}
            title={readOnly ? diagram.name : "Rename"}
            className="min-w-0 truncate rounded-lg px-1 py-1 text-[14px] font-semibold tracking-tight hover:bg-fog"
          >
            {diagram.name}
          </button>
        )}
        <span className="mx-2.5 h-5 w-px shrink-0 bg-hairline" />
        {readOnly ? <span className="shrink-0 text-[13px] text-slate">View only</span> : <SaveStatus state={saveState} />}
      </div>

      <div className="absolute right-4 top-4 z-30 flex h-12 items-center gap-2 rounded-full border border-hairline bg-paper pl-2 pr-1.5 shadow-float">
        {!readOnly && (
          <>
            <button
              type="button"
              aria-label="Undo"
              title="Undo (Ctrl+Z)"
              disabled={!canUndo}
              onClick={onUndo}
              className="grid size-9 place-items-center rounded-full hover:bg-fog disabled:text-slate-soft disabled:hover:bg-transparent"
            >
              <Undo2 className="size-[18px]" strokeWidth={1.75} />
            </button>
            <button
              type="button"
              aria-label="Redo"
              title="Redo (Ctrl+Shift+Z)"
              disabled={!canRedo}
              onClick={onRedo}
              className="grid size-9 place-items-center rounded-full hover:bg-fog disabled:text-slate-soft disabled:hover:bg-transparent"
            >
              <Redo2 className="size-[18px]" strokeWidth={1.75} />
            </button>
            <span className="h-5 w-px bg-hairline" />
          </>
        )}
        {people.length > 0 && (
          <div className="flex items-center -space-x-1.5">
            {people.slice(0, 5).map((p) => (
              <Tooltip key={p.clientId}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => onFollow(p.clientId)}
                    className="rounded-full outline-none transition-transform hover:z-10 hover:-translate-y-0.5 focus-visible:ring-3 focus-visible:ring-cobalt/40"
                    style={{ boxShadow: `0 0 0 2px var(--paper), 0 0 0 3.5px ${p.user.color}` }}
                  >
                    <UserAvatar user={p.user} size={28} ring={false} />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Go to {p.user.name}</TooltipContent>
              </Tooltip>
            ))}
            {people.length > 5 && (
              <span className="grid size-7 place-items-center rounded-full bg-fog font-mono text-[11px] text-slate ring-2 ring-paper">
                +{people.length - 5}
              </span>
            )}
          </div>
        )}
        {project.activeJam && (
          <button type="button" onClick={() => setShareOpen(true)} className="rounded-full">
            <JamChip code={project.activeJam.code} />
          </button>
        )}
        {onExport && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label="More" className="grid size-9 place-items-center rounded-full hover:bg-fog">
                <MoreHorizontal className="size-[18px]" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {onHistory && (
                <>
                  <DropdownMenuItem onSelect={onHistory}>
                    <History /> Version history
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem onSelect={() => onExport("bpmn")}>
                <Download /> Download .bpmn
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onExport("svg")}>
                <ImageIcon /> Export as SVG
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onExport("png")}>
                <ImageIcon /> Export as PNG
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onExport("jpeg")}>
                <ImageIcon /> Export as JPEG
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onExport("pdf")}>
                <FileText /> Export as PDF
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onExport("copy-image")}>
                <ClipboardCopy /> Copy as image
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onExport("copy-xml")}>
                <Code2 /> Copy BPMN XML
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <SaveWorkButton compact />
        <button
          type="button"
          onClick={() => setShareOpen(true)}
          className="flex h-9 items-center gap-1.5 rounded-full bg-ink px-4 text-[14px] font-medium text-paper hover:bg-ink/85"
        >
          <Share2 className="size-4" strokeWidth={2} /> Share
        </button>
        <UserMenu />
      </div>

      <ShareDialog project={project} open={shareOpen} onOpenChange={setShareOpen} />
    </>
  );
}
