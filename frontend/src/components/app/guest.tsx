"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/api/client";
import { useAcceptInvite, useJoinJam, useMe, useStartGuest } from "@/lib/api/hooks";
import type { Project, Workspace } from "@/lib/api/types";
import { cn } from "@/lib/utils";

type ButtonProps = React.ComponentProps<typeof Button>;

export function TryAsGuestButton({ children = "Try without an account", next, ...props }: ButtonProps & { next?: string }) {
  const router = useRouter();
  const startGuest = useStartGuest();
  const [pending, setPending] = useState(false);
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        try {
          await startGuest.mutateAsync();
          if (next && next !== "/app") {
            router.replace(next);
            return;
          }
          const [workspace] = await api<Workspace[]>("/workspaces");
          const project = await api<Project>(`/workspaces/${workspace.id}/projects`, {
            method: "POST",
            body: { name: "My first process" },
          });
          router.push(`/p/${project.id}`);
        } catch (error) {
          toast.error(errorMessage(error));
          setPending(false);
        }
      }}
      {...props}
    >
      {pending && <Loader2 className="animate-spin" />}
      {children}
    </Button>
  );
}

export function JoinAsGuestButton({
  code,
  onFailure,
  ...props
}: ButtonProps & { code: string; onFailure?: (message: string) => void }) {
  const router = useRouter();
  const startGuest = useStartGuest();
  const join = useJoinJam();
  const pending = startGuest.isPending || join.isPending;
  return (
    <Button
      variant="ghost"
      disabled={pending}
      onClick={async () => {
        try {
          await startGuest.mutateAsync();
          const result = await join.mutateAsync(code);
          router.replace(`/p/${result.projectId}`);
        } catch (error) {
          onFailure?.(errorMessage(error));
        }
      }}
      {...props}
    >
      {pending && <Loader2 className="animate-spin" />}
      Continue as a guest
    </Button>
  );
}

export function AcceptInviteAsGuestButton({
  token,
  onFailure,
  ...props
}: ButtonProps & { token: string; onFailure?: (message: string) => void }) {
  const router = useRouter();
  const startGuest = useStartGuest();
  const accept = useAcceptInvite();
  const pending = startGuest.isPending || accept.isPending;
  return (
    <Button
      variant="ghost"
      disabled={pending}
      onClick={async () => {
        try {
          await startGuest.mutateAsync();
          const workspace = await accept.mutateAsync(token);
          router.replace(`/w/${workspace.id}`);
        } catch (error) {
          onFailure?.(errorMessage(error));
        }
      }}
      {...props}
    >
      {pending && <Loader2 className="animate-spin" />}
      Continue as a guest
    </Button>
  );
}

export function SaveWorkButton({ compact = false, className }: { compact?: boolean; className?: string }) {
  const { data: me } = useMe();
  const pathname = usePathname();
  if (!me?.isGuest) return null;
  return (
    <Link
      href={`/signup?next=${encodeURIComponent(pathname)}`}
      title="You're working as a guest. Sign up to keep your diagrams."
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-dashed border-slate-soft bg-paper px-3.5 text-[13px] font-medium text-ink transition-colors hover:border-ink",
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-slate" />
      {compact ? "Save your work" : "Guest · Sign up to keep your work"}
    </Link>
  );
}
