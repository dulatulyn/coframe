"use client";

import { ArrowLeft, Workflow } from "lucide-react";
import Link from "next/link";

import { useProcessMap, useTree } from "@/lib/api/hooks";

export function OwnerBar({ projectId, ownerId, diagramId }: { projectId: string; ownerId: string | null; diagramId?: string }) {
  const { data: tree } = useTree(projectId);
  const { data: map } = useProcessMap(projectId);
  const owner = tree?.diagrams.find((d) => d.id === ownerId);
  const users = (map?.links ?? [])
    .filter((l) => l.kind === "decision" && l.target === diagramId)
    .map((l) => ({ ...l, process: tree?.diagrams.find((d) => d.id === l.source) }))
    .filter((l) => l.process);
  if (!owner && !users.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-hairline px-3 py-2 text-[13px]">
      {owner && (
        <Link
          href={`/p/${projectId}/${owner.id}`}
          className="flex h-8 items-center gap-1.5 rounded-full bg-fog px-3 font-medium hover:bg-fog-strong"
        >
          <ArrowLeft className="size-3.5" /> {owner.name}
        </Link>
      )}
      {users.length > 0 && (
        <span className="flex min-w-0 items-center gap-1.5 text-slate">
          <Workflow className="size-3.5 shrink-0" />
          Used by{" "}
          {users.map((u, i) => (
            <span key={`${u.source}-${i}`}>
              {i > 0 && ", "}
              <Link href={`/p/${projectId}/${u.source}`} className="font-medium text-ink hover:underline">
                {u.label || "a business rule task"}
              </Link>{" "}
              in {u.process!.name}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}
