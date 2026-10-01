import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderPlus,
  PanelLeftClose,
  Plus,
  Search,
  Trash2,
} from "lucide-react";

import { cn } from "@/lib/utils";

import { Facepile, type PresenceUser } from "./presence";

export type MockFolder = { id: string; name: string; count: number };
export type MockFile = { id: string; name: string; updated: string; people?: PresenceUser[]; variant?: number };

export function MiniDiagram({ variant = 0, className }: { variant?: number; className?: string }) {
  const rows = [
    ["c", "t", "g", "t", "e"],
    ["c", "t", "t", "g", "e"],
    ["c", "g", "t", "e"],
    ["c", "t", "e"],
  ][variant % 4];
  const step = 200 / (rows.length + 0.4);
  return (
    <svg viewBox="0 0 200 90" className={cn("h-full w-full", className)} fill="none" stroke="currentColor">
      {rows.map((kind, i) => {
        const cx = 16 + i * step;
        const next = i < rows.length - 1 ? 16 + (i + 1) * step : null;
        const y = variant % 2 === 1 && i === 2 ? 58 : 45;
        return (
          <g key={i} strokeWidth="1.6">
            {next !== null && <path d={`M${cx + (kind === "t" ? 16 : 9)} ${y}H${next - 16}`} strokeWidth="1.2" />}
            {kind === "c" && <circle cx={cx} cy={y} r="8" />}
            {kind === "e" && <circle cx={cx} cy={y} r="8" strokeWidth="3" />}
            {kind === "t" && <rect x={cx - 16} y={y - 11} width="32" height="22" rx="4" />}
            {kind === "g" && <path d={`M${cx} ${y - 11}l11 11-11 11-11-11Z`} />}
          </g>
        );
      })}
    </svg>
  );
}

export function FilesPanel({
  projectName,
  folders,
  files,
  activeFileId,
  mode = "list",
  trashCount = 0,
  onCollapse,
  className,
}: {
  projectName: string;
  folders: MockFolder[];
  files: MockFile[];
  activeFileId?: string;
  mode?: "list" | "thumbnails";
  trashCount?: number;
  onCollapse?: () => void;
  className?: string;
}) {
  return (
    <aside className={cn("flex min-h-0 flex-col", className)}>
      <div className="flex items-center gap-2.5 px-4 pb-3 pt-4">
        <span className="grid size-8 place-items-center rounded-[10px] bg-ink text-[12px] font-semibold text-paper">
          {projectName.slice(0, 2).toUpperCase()}
        </span>
        <button type="button" className="flex min-w-0 flex-1 items-center gap-1 text-left">
          <span className="truncate text-[15px] font-semibold tracking-tight">{projectName}</span>
          <ChevronDown className="size-4 shrink-0 text-slate" />
        </button>
        <button
          type="button"
          aria-label="Hide files"
          onClick={onCollapse}
          className="grid size-8 place-items-center rounded-full text-slate hover:bg-fog hover:text-ink"
        >
          <PanelLeftClose className="size-[18px]" strokeWidth={1.75} />
        </button>
      </div>

      <div className="flex gap-2 px-4">
        <button
          type="button"
          className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-ink text-[14px] font-medium text-paper transition-opacity hover:opacity-90"
        >
          <Plus className="size-4" strokeWidth={2.25} /> New diagram
        </button>
        <button
          type="button"
          aria-label="New folder"
          className="grid size-10 place-items-center rounded-full border border-hairline hover:bg-fog"
        >
          <FolderPlus className="size-[18px]" strokeWidth={1.75} />
        </button>
      </div>

      <label className="mx-4 mt-3 flex h-10 items-center gap-2 rounded-full bg-fog px-3.5 text-slate">
        <Search className="size-4" strokeWidth={1.75} />
        <input
          placeholder="Search diagrams"
          className="w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-slate"
        />
      </label>

      <div className="mx-4 mt-3 grid grid-cols-2 rounded-full bg-fog p-1 text-[13px] font-medium">
        <span className={cn("rounded-full py-1.5 text-center", mode === "list" ? "bg-paper shadow-sm" : "text-slate")}>
          List
        </span>
        <span
          className={cn("rounded-full py-1.5 text-center", mode === "thumbnails" ? "bg-paper shadow-sm" : "text-slate")}
        >
          Thumbnails
        </span>
      </div>

      <div className="mt-2 min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {mode === "list" && folders.length > 0 && (
          <>
            <div className="px-2 pb-1 pt-3 text-[12px] text-slate">Folders</div>
            {folders.map((f) => (
              <button
                key={f.id}
                type="button"
                className="flex h-10 w-full items-center gap-3 rounded-xl px-2 text-left text-[14px] hover:bg-fog"
              >
                <Folder className="size-[18px] text-slate" strokeWidth={1.75} />
                <span className="flex-1 truncate">{f.name}</span>
                <span className="font-mono text-[12px] text-slate">{f.count}</span>
                <ChevronRight className="size-4 text-slate-soft" />
              </button>
            ))}
          </>
        )}

        <div className="px-2 pb-1 pt-3 text-[12px] text-slate">Diagrams</div>
        {mode === "list"
          ? files.map((file) => (
              <button
                key={file.id}
                type="button"
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-fog",
                  file.id === activeFileId && "bg-fog",
                )}
              >
                <span className="grid h-9 w-12 shrink-0 place-items-center rounded-lg border border-hairline bg-paper p-1 text-ink/70">
                  <MiniDiagram variant={file.variant} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium leading-5">{file.name}</span>
                  <span className="block truncate text-[12px] leading-4 text-slate">{file.updated}</span>
                </span>
                {file.people && file.people.length > 0 && <Facepile users={file.people} size={20} max={2} />}
              </button>
            ))
          : files.map((file, i) => (
              <button
                key={file.id}
                type="button"
                className="flex w-full items-start gap-2 rounded-xl px-2 py-1.5 text-left"
              >
                <span className="w-4 pt-1 text-right font-mono text-[12px] text-slate">{i + 1}</span>
                <span className="flex-1">
                  <span
                    className={cn(
                      "grid aspect-[16/9] place-items-center rounded-2xl border bg-paper p-3 text-ink/70 transition-shadow",
                      file.id === activeFileId ? "border-ink shadow-[0_0_0_3px_var(--fog-strong)]" : "border-hairline hover:border-slate-soft",
                    )}
                  >
                    <MiniDiagram variant={file.variant} />
                  </span>
                  <span className="mt-1.5 flex items-center justify-between gap-2">
                    <span className="truncate text-[13px] font-medium">{file.name}</span>
                    {file.people && file.people.length > 0 && <Facepile users={file.people} size={18} max={2} />}
                  </span>
                </span>
              </button>
            ))}
      </div>

      <div className="border-t border-hairline px-2 py-2">
        <button type="button" className="flex h-10 w-full items-center gap-3 rounded-xl px-2 text-[14px] hover:bg-fog">
          <Trash2 className="size-[18px] text-slate" strokeWidth={1.75} />
          <span className="flex-1 text-left">Trash</span>
          <span className="font-mono text-[12px] text-slate">{trashCount}</span>
        </button>
      </div>
    </aside>
  );
}
