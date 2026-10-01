"use client";

import { Plus } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { useCreateDiagram, useTree } from "@/lib/api/hooks";

export default function ProjectHome() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const { data: tree } = useTree(projectId);
  const create = useCreateDiagram(projectId);

  const latest = tree?.diagrams.slice().sort((a, b) => b.contentUpdatedAt.localeCompare(a.contentUpdatedAt))[0];
  useEffect(() => {
    if (latest) router.replace(`/p/${projectId}/${latest.id}`);
  }, [latest, projectId, router]);

  if (!tree || latest) return <div className="dot-grid absolute inset-0" />;
  return (
    <div className="dot-grid absolute inset-0 grid place-items-center">
      <div className="max-w-sm rounded-[28px] border border-hairline bg-paper p-8 text-center shadow-float">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em]">No diagrams yet</h1>
        <p className="mt-2 text-[15px] leading-6 text-slate">Create the first diagram of “{tree.project.name}”.</p>
        {tree.project.access === "edit" && (
          <Button
            className="mt-6"
            disabled={create.isPending}
            onClick={async () => {
              const d = await create.mutateAsync({});
              router.push(`/p/${projectId}/${d.id}`);
            }}
          >
            <Plus className="size-4" strokeWidth={2.25} /> New diagram
          </Button>
        )}
      </div>
    </div>
  );
}
