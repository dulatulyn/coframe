"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { DiagramThumb } from "@/components/app/diagram-thumb";
import { JamCodeForm } from "@/components/app/join-jam";
import { ProjectCard } from "@/components/app/project-card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/api/client";
import { useCreateProject, useMyJams, useProjects, useRecent, useWorkspace } from "@/lib/api/hooks";
import type { Project } from "@/lib/api/types";
import { timeAgo } from "@/lib/time";
import { cn } from "@/lib/utils";

type Tab = "all" | "live" | "shared";

export default function WorkspaceHome() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const { data: workspace } = useWorkspace(workspaceId);
  const { data: projects, isLoading } = useProjects(workspaceId);
  const { data: recent = [] } = useRecent();
  const { data: shared = [] } = useMyJams();
  const [tab, setTab] = useState<Tab>("all");
  const [creating, setCreating] = useState(false);
  const canCreate = workspace ? workspace.role !== "viewer" : false;

  const live = (projects ?? []).filter((p) => p.activeJam);
  const shown: Project[] = tab === "all" ? (projects ?? []) : tab === "live" ? live : shared;
  const recentHere = recent.filter((d) => d.workspaceId === workspaceId).slice(0, 6);

  return (
    <main className="mx-auto max-w-[1400px] px-4 pb-24 pt-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-[14px] text-slate">{workspace?.name ?? " "}</p>
          <h1 className="display mt-2 text-[44px] sm:text-[56px]">Projects</h1>
        </div>
        {canCreate && (
          <Button size="lg" onClick={() => setCreating(true)}>
            <Plus className="size-[18px]" strokeWidth={2.25} /> New project
          </Button>
        )}
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-full bg-fog p-1 text-[14px] font-medium">
          {(
            [
              ["all", "All", projects?.length ?? 0],
              ["live", "Live jams", live.length],
              ["shared", "Shared with me", shared.length],
            ] as const
          ).map(([id, label, count]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                "flex h-9 items-center gap-2 rounded-full px-4 transition-colors",
                tab === id ? "bg-paper text-ink shadow-sm" : "text-slate hover:text-ink",
              )}
            >
              {label}
              <span className="font-mono text-[12px] text-slate">{count}</span>
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="aspect-[16/12] rounded-[28px]" />
          ))}
        </div>
      ) : shown.length > 0 ? (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((p, i) => (
            <ProjectCard key={p.id} project={p} index={i} />
          ))}
        </div>
      ) : tab === "all" ? (
        <EmptyWorkspace canCreate={canCreate} onCreate={() => setCreating(true)} />
      ) : (
        <p className="mt-10 text-[15px] text-slate">
          {tab === "live"
            ? "No jams are running in this workspace. Open a project and press Jam to start one."
            : "Projects you join through a jam code show up here."}
        </p>
      )}

      {tab === "all" && recentHere.length > 0 && (
        <section className="mt-16">
          <h2 className="text-[22px] font-semibold tracking-[-0.02em]">Recently edited</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {recentHere.map((d, i) => (
              <Link
                key={d.id}
                href={`/p/${d.projectId}/${d.id}`}
                className="flex items-center gap-4 rounded-2xl p-2 transition-colors hover:bg-fog"
              >
                <DiagramThumb
                  kind={d.kind}
                  diagramId={d.id}
                  version={d.previewUpdatedAt}
                  seed={i}
                  className="h-16 w-24 shrink-0 rounded-xl border border-hairline"
                />
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-medium">{d.name}</span>
                  <span className="block truncate text-[13px] text-slate">
                    {d.projectName} · {timeAgo(d.contentUpdatedAt)}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <NewProjectDialog workspaceId={workspaceId} open={creating} onOpenChange={setCreating} />
    </main>
  );
}

function EmptyWorkspace({ canCreate, onCreate }: { canCreate: boolean; onCreate: () => void }) {
  return (
    <div className="mt-8 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
      <div className="flex flex-col justify-between gap-10 rounded-[28px] bg-fog p-8 sm:p-10">
        <div>
          <h2 className="display text-[34px]">Start your first project.</h2>
          <p className="mt-3 max-w-md text-[16px] leading-7 text-slate">
            A project holds folders and BPMN diagrams. Everything saves as you draw, and your team can
            edit with you in real time.
          </p>
        </div>
        {canCreate && (
          <Button size="lg" className="self-start" onClick={onCreate}>
            <Plus className="size-[18px]" strokeWidth={2.25} /> New project
          </Button>
        )}
      </div>
      <div className="flex flex-col justify-between gap-8 rounded-[28px] border border-hairline p-8 sm:p-10">
        <div>
          <span className="inline-flex items-center gap-2 text-[13px] font-medium">
            <span className="size-2 rounded-full bg-beacon" /> Got a code?
          </span>
          <h2 className="mt-3 text-[24px] font-semibold tracking-[-0.02em]">Join a jam</h2>
          <p className="mt-2 text-[15px] leading-6 text-slate">Enter the code your teammate shared to draw together.</p>
        </div>
        <JamCodeForm />
      </div>
    </div>
  );
}

function NewProjectDialog({
  workspaceId,
  open,
  onOpenChange,
}: {
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const create = useCreateProject(workspaceId);
  const router = useRouter();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          className="grid gap-5"
          onSubmit={async (e) => {
            e.preventDefault();
            const name = String(new FormData(e.currentTarget).get("name") ?? "").trim();
            if (!name) return;
            try {
              const project = await create.mutateAsync(name);
              onOpenChange(false);
              router.push(`/p/${project.id}`);
            } catch (error) {
              toast.error(errorMessage(error));
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>It starts with one blank diagram. Add folders and more diagrams inside.</DialogDescription>
          </DialogHeader>
          <Input name="name" placeholder="e.g. Customer onboarding" autoFocus required maxLength={200} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              Create project
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
