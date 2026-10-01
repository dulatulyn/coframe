"use client";

import { Check, ChevronsUpDown, Plus, Settings } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import { useCreateWorkspace, useWorkspaces } from "@/lib/api/hooks";
import type { Workspace } from "@/lib/api/types";

export function WorkspaceBadge({ name, size = 28 }: { name: string; size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-[9px] bg-ink font-semibold text-paper"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
    >
      {name.trim().charAt(0).toUpperCase() || "W"}
    </span>
  );
}

export function WorkspaceSwitcher({ current }: { current: Workspace | undefined }) {
  const { data: workspaces = [] } = useWorkspaces();
  const [creating, setCreating] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="flex h-9 max-w-[240px] items-center gap-2 rounded-full pl-1 pr-2.5 outline-none hover:bg-fog focus-visible:ring-3 focus-visible:ring-cobalt/40">
          <WorkspaceBadge name={current?.name ?? "…"} size={26} />
          <span className="truncate text-[14px] font-medium">{current?.name ?? "Loading…"}</span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-slate" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          <DropdownMenuLabel className="px-2.5 text-[12px] font-normal text-slate">Workspaces</DropdownMenuLabel>
          {workspaces.map((ws) => (
            <DropdownMenuItem key={ws.id} asChild>
              <Link href={`/w/${ws.id}`} className="gap-3">
                <WorkspaceBadge name={ws.name} size={28} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px]">{ws.name}</span>
                  <span className="block text-[12px] text-slate">
                    {ws.memberCount} {ws.memberCount === 1 ? "member" : "members"} · {ws.projectCount}{" "}
                    {ws.projectCount === 1 ? "project" : "projects"}
                  </span>
                </span>
                {ws.id === current?.id && (
                  <span className="grid size-5 place-items-center rounded-full bg-ink text-paper">
                    <Check className="size-3" strokeWidth={3} />
                  </span>
                )}
              </Link>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          {current && (
            <DropdownMenuItem asChild>
              <Link href={`/w/${current.id}/settings`}>
                <Settings /> Members & settings
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => setCreating(true)}>
            <Plus /> New workspace
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <NewWorkspaceDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}

function NewWorkspaceDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const create = useCreateWorkspace();
  const router = useRouter();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const name = String(new FormData(e.currentTarget).get("name") ?? "").trim();
            if (!name) return;
            try {
              const ws = await create.mutateAsync(name);
              onOpenChange(false);
              router.push(`/w/${ws.id}`);
            } catch (error) {
              toast.error(errorMessage(error));
            }
          }}
          className="grid gap-5"
        >
          <DialogHeader>
            <DialogTitle>New workspace</DialogTitle>
            <DialogDescription>A shared home for a team: its projects, members and jams.</DialogDescription>
          </DialogHeader>
          <Input name="name" placeholder="Workspace name" autoFocus maxLength={200} required />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              Create workspace
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
