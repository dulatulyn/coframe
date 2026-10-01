"use client";

import { Check, Copy, Link2, Radio, UserPlus } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { toast } from "sonner";

import { UserAvatar } from "@/components/editor-chrome/presence";
import { formatJamCode } from "@/components/editor-chrome/status";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { errorMessage } from "@/lib/api/client";
import {
  useAddMember,
  useCreateInvite,
  useEndJam,
  useJam,
  useMe,
  useStartJam,
  useUpdateJam,
  useWorkspace,
} from "@/lib/api/hooks";
import type { Access, Project, Role } from "@/lib/api/types";
import { timeAgo } from "@/lib/time";
import { cn } from "@/lib/utils";

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  return {
    copied,
    copy: async (key: string, text: string) => {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    },
  };
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  disabled,
  className,
}: {
  value: T;
  options: [T, string][];
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("grid w-fit auto-cols-fr grid-flow-col rounded-full bg-fog p-1 text-[13px] font-medium", className)}>
      {options.map(([id, label]) => (
        <button
          key={id}
          type="button"
          disabled={disabled}
          aria-pressed={value === id}
          onClick={() => onChange(id)}
          className={cn(
            "whitespace-nowrap rounded-full px-3.5 py-1.5 text-center transition-colors",
            value === id ? "bg-paper text-ink shadow-sm" : "text-slate hover:text-ink",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function ShareDialog({
  project,
  open,
  onOpenChange,
}: {
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [tab, setTab] = useState<"jam" | "invite">("jam");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Share “{project.name}”</DialogTitle>
          <DialogDescription>
            A jam lets anyone with the code draw with you right now. Workspace members keep access for good.
          </DialogDescription>
        </DialogHeader>
        <Segmented
          value={tab}
          onChange={setTab}
          className="w-full"
          options={[
            ["jam", "Jam session"],
            ["invite", "Invite to workspace"],
          ]}
        />
        {tab === "jam" ? <JamPanel project={project} /> : <InvitePanel workspaceId={project.workspaceId} />}
      </DialogContent>
    </Dialog>
  );
}

function JamPanel({ project }: { project: Project }) {
  const { data: jam, isLoading } = useJam(project.id);
  const { data: me } = useMe();
  const { data: workspace } = useWorkspace(project.role ? project.workspaceId : undefined);
  const start = useStartJam(project.id);
  const update = useUpdateJam(project.id);
  const end = useEndJam(project.id);
  const addMember = useAddMember(project.workspaceId);
  const { copied, copy } = useCopy();
  const [access, setAccess] = useState<Access>("edit");

  const canStart = project.role !== null && project.role !== "viewer";
  const canManage = !!jam && (jam.host.id === me?.id || project.role === "owner" || project.role === "admin");
  const canAddMembers = workspace?.role === "owner" || workspace?.role === "admin";

  if (isLoading) return <div className="h-40 animate-pulse rounded-3xl bg-fog" />;

  if (!jam) {
    return (
      <div className="flex flex-col gap-5 rounded-3xl bg-fog p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-paper">
            <Radio className="size-5 text-beacon" />
          </span>
          <div>
            <div className="text-[15px] font-semibold">Start a jam</div>
            <p className="mt-1 text-[14px] leading-5 text-slate">
              You get a code and a link. People who join see everyone&apos;s cursors and edits live, across every diagram of this project.
            </p>
          </div>
        </div>
        {canStart ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Segmented
              value={access}
              onChange={setAccess}
              className="bg-fog-strong"
              options={[
                ["edit", "Can edit"],
                ["view", "Can view"],
              ]}
            />
            <Button
              disabled={start.isPending}
              onClick={async () => {
                try {
                  await start.mutateAsync(access);
                } catch (e) {
                  toast.error(errorMessage(e));
                }
              }}
            >
              Start jam
            </Button>
          </div>
        ) : (
          <p className="text-[13px] text-slate">Only workspace editors can start a jam here.</p>
        )}
      </div>
    );
  }

  const link = `${window.location.origin}/j/${jam.code}`;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex gap-5 rounded-3xl bg-fog p-5">
        <div className="flex min-w-0 flex-1 flex-col justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-2 text-[13px] font-medium">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-beacon opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-beacon" />
              </span>
              Live · ends {timeAgo(jam.expiresAt)}
            </span>
            <button
              type="button"
              onClick={() => copy("code", jam.code)}
              className="mt-2 flex items-center gap-2 font-mono text-[34px] font-medium tracking-[0.12em] text-ink"
              title="Copy code"
            >
              {formatJamCode(jam.code)}
              {copied === "code" ? <Check className="size-5 text-slate" /> : <Copy className="size-5 text-slate" />}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1 truncate rounded-full bg-paper px-3.5 py-2 text-[13px] text-slate">{link}</div>
            <Button size="sm" variant="outline" onClick={() => copy("link", link)}>
              {copied === "link" ? <Check /> : <Link2 />} {copied === "link" ? "Copied" : "Copy link"}
            </Button>
          </div>
        </div>
        <div className="hidden shrink-0 rounded-2xl bg-paper p-2.5 sm:block">
          <QRCodeSVG value={link} size={112} bgColor="#ffffff" fgColor="#101012" level="M" />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <Segmented
          value={jam.access}
          disabled={!canManage || update.isPending}
          onChange={(value) => update.mutate(value)}
          options={[
            ["edit", "Can edit"],
            ["view", "Can view"],
          ]}
        />
        {canManage && (
          <Button
            variant="ghost"
            className="text-destructive"
            disabled={end.isPending}
            onClick={async () => {
              await end.mutateAsync();
              toast("Jam ended. Guests were disconnected.");
            }}
          >
            End jam
          </Button>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between text-[12px] text-slate">
          <span>In this jam</span>
          <span>
            {jam.participants.length + 1} {jam.participants.length === 0 ? "person" : "people"}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3 rounded-2xl px-2 py-1.5">
            <UserAvatar user={jam.host} size={32} ring={false} />
            <span className="flex-1 text-[14px] font-medium">{jam.host.name}</span>
            <span className="text-[12px] text-slate">Host</span>
          </div>
          {jam.participants.map((p) => (
            <div key={p.user.id} className="flex items-center gap-3 rounded-2xl px-2 py-1.5 hover:bg-fog">
              <UserAvatar user={p.user} size={32} ring={false} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium">{p.user.name}</span>
                <span className="block text-[12px] text-slate">Joined {timeAgo(p.joinedAt)}</span>
              </span>
              {p.isMember ? (
                <span className="text-[12px] text-slate">Member</span>
              ) : canAddMembers ? (
                <Button
                  size="xs"
                  variant="outline"
                  disabled={addMember.isPending}
                  onClick={async () => {
                    try {
                      await addMember.mutateAsync({ userId: p.user.id, role: "editor" as Role });
                      toast.success(`${p.user.name} is now a member of the workspace`);
                    } catch (e) {
                      toast.error(errorMessage(e));
                    }
                  }}
                >
                  <UserPlus /> Add to workspace
                </Button>
              ) : (
                <span className="text-[12px] text-slate">Guest</span>
              )}
            </div>
          ))}
          {jam.participants.length === 0 && (
            <p className="px-2 py-2 text-[13px] text-slate">Nobody joined yet. Share the code or the link.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function InvitePanel({ workspaceId }: { workspaceId: string }) {
  const { data: workspace } = useWorkspace(workspaceId);
  const create = useCreateInvite(workspaceId);
  const { copied, copy } = useCopy();
  const [role, setRole] = useState<Role>("editor");
  const [link, setLink] = useState<string | null>(null);
  const canInvite = workspace?.role === "owner" || workspace?.role === "admin";

  if (!canInvite) {
    return <p className="rounded-3xl bg-fog p-5 text-[14px] text-slate">Only workspace admins can invite members. Ask an admin, or start a jam instead.</p>;
  }
  return (
    <div className="flex flex-col gap-4 rounded-3xl bg-fog p-5">
      <p className="text-[14px] leading-5 text-slate">
        An invite link adds people to <span className="font-medium text-ink">{workspace?.name}</span> with access to all its projects. Links work for 7 days.
      </p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          value={role}
          className="bg-fog-strong"
          onChange={(r) => {
            setRole(r);
            setLink(null);
          }}
          options={[
            ["editor", "Editor"],
            ["viewer", "Viewer"],
            ["admin", "Admin"],
          ]}
        />
        <Button
          disabled={create.isPending}
          onClick={async () => {
            const invite = await create.mutateAsync(role);
            setLink(`${window.location.origin}/invite/${invite.token}`);
          }}
        >
          Create link
        </Button>
      </div>
      {link && (
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1 truncate rounded-full bg-paper px-3.5 py-2 text-[13px] text-slate">{link}</div>
          <Button size="sm" variant="outline" onClick={() => copy("invite", link)}>
            {copied === "invite" ? <Check /> : <Copy />} {copied === "invite" ? "Copied" : "Copy"}
          </Button>
        </div>
      )}
    </div>
  );
}
