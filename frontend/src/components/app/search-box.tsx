"use client";

import { FileText, FolderKanban, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { useSearch } from "@/lib/api/hooks";
import { timeAgo } from "@/lib/time";
import { cn } from "@/lib/utils";

export function SearchBox({ workspaceId, className }: { workspaceId: string; className?: string }) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const { data, isFetching } = useSearch(workspaceId, debounced);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 180);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        box.current?.querySelector("input")?.focus();
      }
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const empty = data && data.projects.length === 0 && data.diagrams.length === 0;

  return (
    <div ref={box} className={cn("relative", className)}>
      <label className="flex h-10 items-center gap-2.5 rounded-full bg-fog px-4 text-slate focus-within:bg-paper focus-within:ring-3 focus-within:ring-cobalt/25">
        <Search className="size-4 shrink-0" strokeWidth={1.75} />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
          placeholder="Search projects and diagrams"
          className="min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-slate"
        />
        <span className="keycap hidden sm:inline-flex">⌘K</span>
      </label>
      {open && debounced.trim() && (
        <div className="absolute inset-x-0 top-12 z-40 max-h-[60vh] overflow-y-auto rounded-[20px] bg-paper p-2 shadow-pop">
          {isFetching && !data && <div className="px-3 py-2 text-[13px] text-slate">Searching…</div>}
          {empty && <div className="px-3 py-2 text-[13px] text-slate">Nothing matches “{debounced.trim()}”.</div>}
          {data && data.projects.length > 0 && (
            <>
              <div className="px-3 pb-1 pt-2 text-[12px] text-slate">Projects</div>
              {data.projects.map((p) => (
                <Link
                  key={p.id}
                  href={`/p/${p.id}`}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-fog"
                >
                  <FolderKanban className="size-4 text-slate" strokeWidth={1.75} />
                  <span className="flex-1 truncate text-[14px]">{p.name}</span>
                  <span className="text-[12px] text-slate">{p.diagramCount} diagrams</span>
                </Link>
              ))}
            </>
          )}
          {data && data.diagrams.length > 0 && (
            <>
              <div className="px-3 pb-1 pt-2 text-[12px] text-slate">Diagrams</div>
              {data.diagrams.map((d) => (
                <Link
                  key={d.id}
                  href={`/p/${d.projectId}/${d.id}`}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-fog"
                >
                  <FileText className="size-4 text-slate" strokeWidth={1.75} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px]">{d.name}</span>
                    <span className="block truncate text-[12px] text-slate">{d.projectName}</span>
                  </span>
                  <span className="text-[12px] text-slate">{timeAgo(d.contentUpdatedAt)}</span>
                </Link>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
