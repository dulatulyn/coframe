"use client";

import { generateKeyBetween } from "fractional-indexing";
import {
  ArrowDownAZ,
  ArrowLeft,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  Clock3,
  Copy,
  Download,
  Folder,
  FolderInput,
  FolderPlus,
  GripVertical,
  MoreHorizontal,
  Network,
  PanelLeftClose,
  Pencil,
  Pin,
  PinOff,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Table2,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { DiagramThumb } from "@/components/app/diagram-thumb";
import { Facepile } from "@/components/editor-chrome/presence";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/api/client";
import {
  useCreateDiagram,
  useCreateFolder,
  useDeleteDiagram,
  useDeleteFolder,
  useDuplicateDiagram,
  useEmptyTrash,
  useRestoreDiagram,
  useRestoreFolder,
  useTrash,
  useUpdateDiagram,
  useUpdateFolder,
} from "@/lib/api/hooks";
import type { DiagramMeta, Folder as FolderModel, Tree } from "@/lib/api/types";
import { useFilesPanel } from "@/lib/panels";
import { useProjectUi } from "@/lib/project-ui";
import { timeAgo } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useProjectChannel } from "@/realtime/project-channel";

import { GenerateDialog } from "./generate-dialog";

type Rename = { kind: "folder" | "diagram"; id: string; name: string } | null;
type ItemAction =
  | { label: string; icon: LucideIcon; onSelect?: () => void; href?: string; destructive?: boolean }
  | "separator";

function ContextActions({ actions }: { actions: ItemAction[] }) {
  if (actions.length === 0) return null;
  return (
    <ContextMenuContent className="w-56">
      {actions.map((a, i) =>
        a === "separator" ? (
          <ContextMenuSeparator key={i} />
        ) : a.href ? (
          <ContextMenuItem key={i} asChild>
            <a href={a.href} download>
              <a.icon /> {a.label}
            </a>
          </ContextMenuItem>
        ) : (
          <ContextMenuItem key={i} variant={a.destructive ? "destructive" : "default"} onSelect={a.onSelect}>
            <a.icon /> {a.label}
          </ContextMenuItem>
        ),
      )}
    </ContextMenuContent>
  );
}

function RowMenu({ actions, label, className }: { actions: ItemAction[]; label: string; className?: string }) {
  if (actions.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cn(
            "grid size-7 place-items-center rounded-full text-slate opacity-0 transition hover:bg-fog-strong hover:text-ink focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:bg-fog-strong data-[state=open]:text-ink data-[state=open]:opacity-100",
            className,
          )}
        >
          <MoreHorizontal className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {actions.map((a, i) =>
          a === "separator" ? (
            <DropdownMenuSeparator key={i} />
          ) : a.href ? (
            <DropdownMenuItem key={i} asChild>
              <a href={a.href} download>
                <a.icon /> {a.label}
              </a>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem key={i} variant={a.destructive ? "destructive" : "default"} onSelect={a.onSelect}>
              <a.icon /> {a.label}
            </DropdownMenuItem>
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
type DragItem = { kind: "folder" | "diagram"; id: string };

const DRAG_MIME = "application/x-coframe-item";

export function ProjectFiles({
  tree,
  activeDiagramId,
  className,
}: {
  tree: Tree;
  activeDiagramId?: string;
  className?: string;
}) {
  const projectId = tree.project.id;
  const canEdit = tree.project.access === "edit";
  const router = useRouter();
  const { presence } = useProjectChannel();
  const ui = useProjectUi();
  const files = useFilesPanel();
  const [folderId, setFolderId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [showTrash, setShowTrash] = useState(false);
  const [rename, setRename] = useState<Rename>(null);
  const [newFolder, setNewFolder] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const createDiagram = useCreateDiagram(projectId);
  const createFolder = useCreateFolder(projectId);
  const updateDiagram = useUpdateDiagram(projectId);
  const updateFolder = useUpdateFolder(projectId);
  const deleteDiagram = useDeleteDiagram(projectId);
  const deleteFolder = useDeleteFolder(projectId);
  const duplicate = useDuplicateDiagram(projectId);

  const folderById = useMemo(() => new Map(tree.folders.map((f) => [f.id, f])), [tree.folders]);
  const current = folderId ? folderById.get(folderId) ?? null : null;
  if (folderId && !current) setFolderId(null);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of tree.diagrams) if (d.folderId) map.set(d.folderId, (map.get(d.folderId) ?? 0) + 1);
    for (const f of tree.folders) if (f.parentId) map.set(f.parentId, (map.get(f.parentId) ?? 0) + 1);
    return map;
  }, [tree]);

  const peopleIn = (diagramId: string) => {
    const seen = new Set<string>();
    return presence
      .filter((p) => p.diagramId === diagramId && !seen.has(p.user.id) && seen.add(p.user.id))
      .map((p) => p.user);
  };

  const q = query.trim().toLowerCase();
  const sortDiagrams = (list: DiagramMeta[]) => {
    const copy = [...list];
    if (ui.sort === "name") copy.sort((a, b) => a.name.localeCompare(b.name));
    else if (ui.sort === "updated") copy.sort((a, b) => b.contentUpdatedAt.localeCompare(a.contentUpdatedAt));
    else copy.sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0));
    const pinned = copy.filter((d) => d.pinnedAt).sort((a, b) => a.pinnedAt!.localeCompare(b.pinnedAt!));
    return [...pinned, ...copy.filter((d) => !d.pinnedAt)];
  };
  const folders = q
    ? []
    : tree.folders
        .filter((f) => f.parentId === folderId)
        .sort((a, b) => (ui.sort === "name" ? a.name.localeCompare(b.name) : a.position < b.position ? -1 : 1));
  const diagrams = sortDiagrams(
    q ? tree.diagrams.filter((d) => d.name.toLowerCase().includes(q)) : tree.diagrams.filter((d) => d.folderId === folderId),
  );

  const breadcrumb: FolderModel[] = [];
  for (let f = current; f; f = f.parentId ? folderById.get(f.parentId) ?? null : null) breadcrumb.unshift(f);

  async function addDiagram(kind: "bpmn" | "dmn" = "bpmn") {
    try {
      const d = await createDiagram.mutateAsync({ folderId, kind });
      router.push(`/p/${projectId}/${d.id}`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function importFiles(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      if (!/\.(bpmn|xml)$/i.test(file.name)) {
        toast.error(`${file.name} isn't a .bpmn file.`);
        continue;
      }
      try {
        const xml = await file.text();
        const d = await createDiagram.mutateAsync({ name: file.name.replace(/\.(bpmn|xml)$/i, ""), folderId, xml });
        toast.success(`Imported ${file.name}`);
        router.push(`/p/${projectId}/${d.id}`);
      } catch (e) {
        toast.error(`${file.name}: ${errorMessage(e)}`);
      }
    }
  }

  async function moveItem(item: DragItem, target: string | null) {
    try {
      if (item.kind === "diagram") await updateDiagram.mutateAsync({ id: item.id, folderId: target });
      else if (item.id !== target) await updateFolder.mutateAsync({ id: item.id, parentId: target });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function reorder(item: DragItem, beforeId: string | null) {
    if (item.kind !== "diagram" || ui.sort !== "manual") return;
    const list = diagrams.filter((d) => d.id !== item.id);
    const index = beforeId ? list.findIndex((d) => d.id === beforeId) : list.length;
    const prev = list[index - 1]?.position ?? null;
    const next = list[index]?.position ?? null;
    try {
      await updateDiagram.mutateAsync({ id: item.id, position: generateKeyBetween(prev, next), folderId });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  const readDrag = (e: React.DragEvent): DragItem | null => {
    try {
      return JSON.parse(e.dataTransfer.getData(DRAG_MIME)) as DragItem;
    } catch {
      return null;
    }
  };

  const panelDrop = (e: React.DragEvent) => {
    if (e.dataTransfer.files.length > 0 && canEdit) {
      e.preventDefault();
      void importFiles(e.dataTransfer.files);
    }
  };

  if (showTrash) {
    return <TrashView projectId={projectId} canEdit={canEdit} onBack={() => setShowTrash(false)} className={className} />;
  }

  return (
    <aside
      className={cn("flex min-h-0 flex-col", className)}
      onDragOver={(e) => e.dataTransfer.types.includes("Files") && e.preventDefault()}
      onDrop={panelDrop}
    >
      <div className="flex items-center gap-2.5 px-4 pb-3 pt-4">
        <Link
          href={`/w/${tree.project.workspaceId}`}
          className="grid size-8 place-items-center rounded-[10px] bg-ink text-[12px] font-semibold text-paper"
          title="Back to projects"
        >
          {tree.project.name.slice(0, 2).toUpperCase()}
        </Link>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold tracking-tight">{tree.project.name}</div>
        </div>
        <Link
          href={`/p/${tree.project.id}/map`}
          aria-label="Process map"
          title="Process map"
          className="grid size-8 place-items-center rounded-full text-slate hover:bg-fog hover:text-ink"
        >
          <Network className="size-[18px]" strokeWidth={1.75} />
        </Link>
        <button
          type="button"
          aria-label="Hide files"
          onClick={() => files.setOpen(false)}
          className="grid size-8 place-items-center rounded-full text-slate hover:bg-fog hover:text-ink"
        >
          <PanelLeftClose className="size-[18px]" strokeWidth={1.75} />
        </button>
      </div>

      {canEdit && (
        <div className="flex gap-2 px-4">
          <Button className="flex-1" onClick={() => addDiagram()} disabled={createDiagram.isPending}>
            <Plus className="size-4" strokeWidth={2.25} /> New diagram
          </Button>
          <Button variant="outline" size="icon" aria-label="Generate with AI" title="Generate with AI" onClick={() => setGenerating(true)}>
            <Sparkles className="size-[18px]" strokeWidth={1.75} />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="More create options">
                <FolderPlus className="size-[18px]" strokeWidth={1.75} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onSelect={() => void addDiagram("dmn")}>
                <Table2 /> New decision table
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setNewFolder(true)}>
                <FolderPlus /> New folder
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => fileInput.current?.click()}>
                <FolderInput /> Import .bpmn file
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <input
            ref={fileInput}
            type="file"
            accept=".bpmn,.xml,application/xml,text/xml"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) void importFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      )}

      <label className="mx-4 mt-3 flex h-10 items-center gap-2 rounded-full bg-fog px-3.5 text-slate focus-within:bg-paper focus-within:ring-3 focus-within:ring-cobalt/25">
        <Search className="size-4" strokeWidth={1.75} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search diagrams"
          className="w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-slate"
        />
      </label>

      <div className="mx-4 mt-3 flex items-center gap-2">
        <div className="grid flex-1 grid-cols-2 rounded-full bg-fog p-1 text-[13px] font-medium">
          {(["list", "thumbnails"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => ui.setFilesMode(mode)}
              className={cn(
                "rounded-full py-1.5 capitalize transition-colors",
                ui.filesMode === mode ? "bg-paper shadow-sm" : "text-slate hover:text-ink",
              )}
            >
              {mode}
            </button>
          ))}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Sort">
              {ui.sort === "name" ? <ArrowDownAZ /> : ui.sort === "updated" ? <Clock3 /> : <GripVertical />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="px-2.5 text-[12px] font-normal text-slate">Sort diagrams</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => ui.setSort("manual")}>
              <GripVertical /> Manual
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => ui.setSort("updated")}>
              <Clock3 /> Last updated
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => ui.setSort("name")}>
              <ArrowDownAZ /> Name
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-2 min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {current && !q && (
          <div className="flex items-center gap-1 px-2 pb-1 pt-2 text-[13px]">
            <button
              type="button"
              onClick={() => setFolderId(current.parentId)}
              onDragOver={(e) => canEdit && e.preventDefault()}
              onDrop={(e) => {
                const item = readDrag(e);
                if (item) void moveItem(item, current.parentId);
              }}
              className="flex items-center gap-1 rounded-full py-1 pl-1 pr-2 text-slate hover:bg-fog hover:text-ink"
            >
              <ArrowLeft className="size-4" /> Back
            </button>
            <span className="truncate text-slate">
              {breadcrumb.map((f) => f.name).join(" / ")}
            </span>
          </div>
        )}

        {folders.length > 0 && (
          <>
            <div className="px-2 pb-1 pt-3 text-[12px] text-slate">Folders</div>
            {folders.map((f) => {
              const actions: ItemAction[] = canEdit
                ? [
                    { label: "Rename", icon: Pencil, onSelect: () => setRename({ kind: "folder", id: f.id, name: f.name }) },
                    "separator",
                    {
                      label: "Move to trash",
                      icon: Trash2,
                      destructive: true,
                      onSelect: async () => {
                        await deleteFolder.mutateAsync({ id: f.id });
                        toast("Folder moved to trash");
                      },
                    },
                  ]
                : [];
              return (
                <ContextMenu key={f.id}>
                  <ContextMenuTrigger asChild>
                    <div className="group relative">
                      <button
                        type="button"
                        draggable={canEdit}
                        onDragStart={(e) => e.dataTransfer.setData(DRAG_MIME, JSON.stringify({ kind: "folder", id: f.id }))}
                        onDragOver={(e) => {
                          if (!canEdit || e.dataTransfer.types.includes("Files")) return;
                          e.preventDefault();
                          setDropTarget(f.id);
                        }}
                        onDragLeave={() => setDropTarget(null)}
                        onDrop={(e) => {
                          setDropTarget(null);
                          const item = readDrag(e);
                          if (item) {
                            e.stopPropagation();
                            void moveItem(item, f.id);
                          }
                        }}
                        onClick={() => setFolderId(f.id)}
                        className={cn(
                          "flex h-10 w-full items-center gap-3 rounded-xl px-2 text-left text-[14px] hover:bg-fog",
                          canEdit && "pr-10",
                          dropTarget === f.id && "bg-cobalt/10 ring-2 ring-cobalt/40",
                        )}
                      >
                        <Folder className="size-[18px] text-slate" strokeWidth={1.75} />
                        <span className="flex-1 truncate">{f.name}</span>
                        <span className="font-mono text-[12px] text-slate">{counts.get(f.id) ?? 0}</span>
                        <ChevronRight className="size-4 text-slate-soft" />
                      </button>
                      <RowMenu actions={actions} label={`Actions for ${f.name}`} className="absolute right-1.5 top-1.5" />
                    </div>
                  </ContextMenuTrigger>
                  <ContextActions actions={actions} />
                </ContextMenu>
              );
            })}
          </>
        )}

        <div className="px-2 pb-1 pt-3 text-[12px] text-slate">{q ? "Results" : "Diagrams"}</div>
        {diagrams.length === 0 && (
          <p className="px-2 py-3 text-[13px] leading-5 text-slate">
            {q ? "No diagram matches your search." : canEdit ? "No diagrams here yet. Create one or drop a .bpmn file." : "No diagrams here yet."}
          </p>
        )}
        {diagrams.map((d, i) => {
          const people = peopleIn(d.id);
          const active = d.id === activeDiagramId;
          const actions: ItemAction[] = [
            { label: "Open", icon: ArrowUpRight, onSelect: () => router.push(`/p/${projectId}/${d.id}`) },
            ...(canEdit
              ? ([
                  {
                    label: d.pinnedAt ? "Unpin" : "Pin to top",
                    icon: d.pinnedAt ? PinOff : Pin,
                    onSelect: () => updateDiagram.mutate({ id: d.id, pinned: !d.pinnedAt }),
                  },
                  { label: "Rename", icon: Pencil, onSelect: () => setRename({ kind: "diagram", id: d.id, name: d.name }) },
                  {
                    label: "Duplicate",
                    icon: Copy,
                    onSelect: async () => {
                      const copy = await duplicate.mutateAsync(d.id);
                      router.push(`/p/${projectId}/${copy.id}`);
                    },
                  },
                ] satisfies ItemAction[])
              : []),
            { label: "Download .bpmn", icon: Download, href: `/api/diagrams/${d.id}/xml` },
            ...(canEdit
              ? ([
                  "separator",
                  {
                    label: "Move to trash",
                    icon: Trash2,
                    destructive: true,
                    onSelect: async () => {
                      await deleteDiagram.mutateAsync({ id: d.id });
                      toast("Diagram moved to trash");
                      if (active) router.push(`/p/${projectId}`);
                    },
                  },
                ] satisfies ItemAction[])
              : []),
          ];
          const dragProps = {
            draggable: canEdit,
            onDragStart: (e: React.DragEvent) =>
              e.dataTransfer.setData(DRAG_MIME, JSON.stringify({ kind: "diagram", id: d.id })),
            onDragOver: (e: React.DragEvent) => {
              if (canEdit && ui.sort === "manual" && !e.dataTransfer.types.includes("Files")) e.preventDefault();
            },
            onDrop: (e: React.DragEvent) => {
              const item = readDrag(e);
              if (item && item.id !== d.id) {
                e.stopPropagation();
                void reorder(item, d.id);
              }
            },
          };
          if (ui.filesMode === "thumbnails") {
            return (
              <ContextMenu key={d.id}>
                <ContextMenuTrigger asChild>
                  <div className="group relative">
                    <Link href={`/p/${projectId}/${d.id}`} className="flex w-full items-start gap-2 rounded-xl px-2 py-1.5" {...dragProps}>
                      <span className="w-4 pt-1 text-right font-mono text-[12px] text-slate">{i + 1}</span>
                      <span className="min-w-0 flex-1">
                        <DiagramThumb
                          kind={d.kind}
                          diagramId={d.id}
                          version={d.previewUpdatedAt}
                          seed={i}
                          className={cn(
                            "aspect-[16/9] rounded-2xl border transition-shadow",
                            active ? "border-ink shadow-[0_0_0_3px_var(--fog-strong)]" : "border-hairline hover:border-slate-soft",
                          )}
                        />
                        <span className="mt-1.5 flex items-center justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-1.5">
                            {d.pinnedAt && <Pin className="size-3 shrink-0 text-slate" />}
                            <span className="truncate text-[13px] font-medium">{d.name}</span>
                          </span>
                          {people.length > 0 && <Facepile users={people} size={18} max={3} />}
                        </span>
                      </span>
                    </Link>
                    <RowMenu
                      actions={actions}
                      label={`Actions for ${d.name}`}
                      className="absolute right-4 top-3.5 bg-paper/90 shadow-float backdrop-blur"
                    />
                  </div>
                </ContextMenuTrigger>
                <ContextActions actions={actions} />
              </ContextMenu>
            );
          }
          return (
            <ContextMenu key={d.id}>
              <ContextMenuTrigger asChild>
                <div className="group relative">
                  <Link
                    href={`/p/${projectId}/${d.id}`}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl py-2 pl-2 pr-10 text-left hover:bg-fog",
                      active && "bg-fog",
                    )}
                    {...dragProps}
                  >
                    <DiagramThumb
                      kind={d.kind}
                      diagramId={d.id}
                      version={d.previewUpdatedAt}
                      seed={i}
                      minWidth={420}
                      className="h-9 w-12 shrink-0 rounded-lg border border-hairline"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        {d.pinnedAt && <Pin className="size-3 shrink-0 text-slate" />}
                        <span className="truncate text-[14px] font-medium leading-5">{d.name}</span>
                      </span>
                      <span className="block truncate text-[12px] leading-4 text-slate">
                        {q && d.folderId ? `${folderById.get(d.folderId)?.name ?? ""} · ` : ""}Updated {timeAgo(d.contentUpdatedAt)}
                      </span>
                    </span>
                    {people.length > 0 && <Facepile users={people} size={20} max={2} />}
                  </Link>
                  <RowMenu actions={actions} label={`Actions for ${d.name}`} className="absolute right-1.5 top-1/2 -translate-y-1/2" />
                </div>
              </ContextMenuTrigger>
              <ContextActions actions={actions} />
            </ContextMenu>
          );
        })}
      </div>

      <div className="border-t border-hairline px-2 py-2">
        <button
          type="button"
          onClick={() => setShowTrash(true)}
          className="flex h-10 w-full items-center gap-3 rounded-xl px-2 text-[14px] hover:bg-fog"
        >
          <Trash2 className="size-[18px] text-slate" strokeWidth={1.75} />
          <span className="flex-1 text-left">Trash</span>
          <ChevronRight className="size-4 text-slate-soft" />
        </button>
      </div>

      <GenerateDialog projectId={projectId} folderId={folderId} open={generating} onOpenChange={setGenerating} />
      <NameDialog
        open={newFolder}
        title="New folder"
        description="Group related diagrams, e.g. by team or process area."
        confirm="Create folder"
        onOpenChange={setNewFolder}
        onSubmit={async (name) => {
          await createFolder.mutateAsync({ name, parentId: folderId });
        }}
      />
      <NameDialog
        open={rename !== null}
        title={rename?.kind === "folder" ? "Rename folder" : "Rename diagram"}
        confirm="Rename"
        initial={rename?.name}
        onOpenChange={(open) => !open && setRename(null)}
        onSubmit={async (name) => {
          if (!rename) return;
          if (rename.kind === "folder") await updateFolder.mutateAsync({ id: rename.id, name });
          else await updateDiagram.mutateAsync({ id: rename.id, name });
        }}
      />
    </aside>
  );
}

export function NameDialog({
  open,
  title,
  description,
  confirm,
  initial = "",
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirm: string;
  initial?: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string) => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          className="grid gap-5"
          onSubmit={async (e) => {
            e.preventDefault();
            const name = String(new FormData(e.currentTarget).get("name") ?? "").trim();
            if (!name) return;
            setPending(true);
            try {
              await onSubmit(name);
              onOpenChange(false);
            } catch (error) {
              toast.error(errorMessage(error));
            } finally {
              setPending(false);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          <Input key={initial} name="name" defaultValue={initial} autoFocus required maxLength={200} onFocus={(e) => e.currentTarget.select()} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {confirm}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TrashView({
  projectId,
  canEdit,
  onBack,
  className,
}: {
  projectId: string;
  canEdit: boolean;
  onBack: () => void;
  className?: string;
}) {
  const { data: items = [], isLoading } = useTrash(projectId);
  const restoreDiagram = useRestoreDiagram(projectId);
  const restoreFolder = useRestoreFolder(projectId);
  const deleteDiagram = useDeleteDiagram(projectId);
  const deleteFolder = useDeleteFolder(projectId);
  const emptyTrash = useEmptyTrash(projectId);
  const [confirmEmpty, setConfirmEmpty] = useState(false);

  return (
    <aside className={cn("flex min-h-0 flex-col", className)}>
      <div className="flex items-center gap-2 px-3 pb-2 pt-3">
        <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="Back to files">
          <ArrowLeft />
        </Button>
        <div className="flex-1 text-[15px] font-semibold tracking-tight">Trash</div>
        {canEdit && items.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setConfirmEmpty(true)} className="text-destructive">
            Empty
          </Button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {!isLoading && items.length === 0 && (
          <p className="px-2 py-3 text-[13px] leading-5 text-slate">Nothing here. Deleted diagrams and folders stay here until you remove them for good.</p>
        )}
        {items.map((item) => (
          <div key={item.id} className="group flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-fog">
            {item.kind === "folder" ? (
              <Folder className="size-[18px] text-slate" strokeWidth={1.75} />
            ) : (
              <ChevronDown className="size-[18px] rotate-[-90deg] text-transparent" />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-medium">{item.name}</span>
              <span className="block truncate text-[12px] text-slate">
                Deleted {timeAgo(item.deletedAt)}
                {item.kind === "folder" && item.itemCount > 0 ? ` · ${item.itemCount} items inside` : ""}
              </span>
            </span>
            {canEdit && (
              <>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Restore"
                  title="Restore"
                  onClick={async () => {
                    if (item.kind === "folder") await restoreFolder.mutateAsync(item.id);
                    else await restoreDiagram.mutateAsync(item.id);
                    toast.success(`Restored ${item.name}`);
                  }}
                >
                  <RotateCcw />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Delete forever"
                  title="Delete forever"
                  onClick={async () => {
                    if (item.kind === "folder") await deleteFolder.mutateAsync({ id: item.id, permanent: true });
                    else await deleteDiagram.mutateAsync({ id: item.id, permanent: true });
                  }}
                >
                  <Trash2 className="text-destructive" />
                </Button>
              </>
            )}
          </div>
        ))}
      </div>
      <Dialog open={confirmEmpty} onOpenChange={setConfirmEmpty}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Empty the trash?</DialogTitle>
            <DialogDescription>Everything in the trash is deleted for good. This can&apos;t be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmEmpty(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                await emptyTrash.mutateAsync();
                setConfirmEmpty(false);
              }}
            >
              Delete forever
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
