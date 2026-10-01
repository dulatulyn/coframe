"use client";

import { Check, Copy, Link2, Trash2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { UserAvatar } from "@/components/editor-chrome/presence";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { errorMessage } from "@/lib/api/client";
import {
  useCreateInvite,
  useDeleteWorkspace,
  useInvites,
  useMe,
  useMembers,
  useRemoveMember,
  useRevokeInvite,
  useUpdateMember,
  useUpdateWorkspace,
  useWorkspace,
} from "@/lib/api/hooks";
import type { Role } from "@/lib/api/types";
import { timeAgo } from "@/lib/time";

const ROLES: { id: Role; label: string; hint: string }[] = [
  { id: "owner", label: "Owner", hint: "Everything, including deleting the workspace" },
  { id: "admin", label: "Admin", hint: "Manage members, invites and projects" },
  { id: "editor", label: "Editor", hint: "Create and edit projects and diagrams, start jams" },
  { id: "viewer", label: "Viewer", hint: "Open and comment, no editing" },
];

function Section({ title, text, children }: { title: string; text?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-6 border-t border-hairline py-10 lg:grid-cols-[280px_1fr]">
      <div>
        <h2 className="text-[17px] font-semibold tracking-[-0.01em]">{title}</h2>
        {text && <p className="mt-1.5 text-[14px] leading-6 text-slate">{text}</p>}
      </div>
      <div>{children}</div>
    </section>
  );
}

export default function WorkspaceSettings() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const router = useRouter();
  const { data: workspace } = useWorkspace(workspaceId);
  const { data: me } = useMe();
  const { data: members = [] } = useMembers(workspaceId);
  const isAdmin = workspace?.role === "owner" || workspace?.role === "admin";
  const isOwner = workspace?.role === "owner";
  const { data: invites = [] } = useInvites(workspaceId, isAdmin);
  const rename = useUpdateWorkspace(workspaceId);
  const updateMember = useUpdateMember(workspaceId);
  const removeMember = useRemoveMember(workspaceId);
  const createInvite = useCreateInvite(workspaceId);
  const revokeInvite = useRevokeInvite(workspaceId);
  const deleteWorkspace = useDeleteWorkspace(workspaceId);
  const [inviteRole, setInviteRole] = useState<Role>("editor");
  const [copied, setCopied] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [now] = useState(() => Date.now());

  const copy = async (id: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  };

  if (!workspace) return null;
  const activeInvites = invites.filter((i) => new Date(i.expiresAt).getTime() > now);

  return (
    <main className="mx-auto max-w-[1100px] px-4 pb-24 pt-10 sm:px-6">
      <p className="text-[14px] text-slate">{workspace.name}</p>
      <h1 className="display mt-2 text-[44px]">Settings</h1>

      <div className="mt-10">
        <Section title="Workspace name" text="Everyone in the workspace sees this name.">
          <form
            className="flex max-w-lg gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const name = String(new FormData(e.currentTarget).get("name") ?? "").trim();
              if (!name) return;
              try {
                await rename.mutateAsync(name);
                toast.success("Workspace renamed");
              } catch (error) {
                toast.error(errorMessage(error));
              }
            }}
          >
            <Input name="name" defaultValue={workspace.name} disabled={!isAdmin} maxLength={200} />
            {isAdmin && (
              <Button type="submit" disabled={rename.isPending}>
                Save
              </Button>
            )}
          </form>
        </Section>

        <Section title="Members" text={`${members.length} ${members.length === 1 ? "person has" : "people have"} access to every project here.`}>
          <div className="flex flex-col gap-1">
            {members.map((m) => {
              const self = m.user.id === me?.id;
              return (
                <div key={m.user.id} className="flex items-center gap-3 rounded-2xl px-2 py-2 hover:bg-fog">
                  <UserAvatar user={m.user} size={36} ring={false} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-medium">
                      {m.user.name} {self && <span className="text-slate">(you)</span>}
                    </div>
                    <div className="truncate text-[13px] text-slate">{m.user.email ?? "Guest"}</div>
                  </div>
                  {isAdmin && !self ? (
                    <Select
                      value={m.role}
                      onValueChange={async (role) => {
                        try {
                          await updateMember.mutateAsync({ userId: m.user.id, role: role as Role });
                        } catch (error) {
                          toast.error(errorMessage(error));
                        }
                      }}
                    >
                      <SelectTrigger className="h-9 w-32 rounded-full border-hairline">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLES.filter((r) => isOwner || r.id !== "owner").map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="w-32 text-right text-[14px] capitalize text-slate">{m.role}</span>
                  )}
                  {(isAdmin || self) && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={self ? "Leave workspace" : `Remove ${m.user.name}`}
                      title={self ? "Leave workspace" : "Remove"}
                      onClick={async () => {
                        try {
                          await removeMember.mutateAsync(m.user.id);
                          if (self) router.replace("/app");
                        } catch (error) {
                          toast.error(errorMessage(error));
                        }
                      }}
                    >
                      <Trash2 className="text-slate" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </Section>

        {isAdmin && (
          <Section title="Invite links" text="Anyone with a link joins with the chosen role. Links work for 7 days and can be revoked.">
            <div className="flex flex-wrap items-center gap-2">
              <Select value={inviteRole} onValueChange={(r) => setInviteRole(r as Role)}>
                <SelectTrigger className="h-10 w-40 rounded-full border-hairline">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.filter((r) => r.id !== "owner").map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                disabled={createInvite.isPending}
                onClick={async () => {
                  const invite = await createInvite.mutateAsync(inviteRole);
                  await copy(invite.id, `${window.location.origin}/invite/${invite.token}`);
                  toast.success("Invite link created and copied");
                }}
              >
                <Link2 /> Create link
              </Button>
            </div>
            {activeInvites.length > 0 && (
              <div className="mt-5 flex flex-col gap-1">
                {activeInvites.map((invite) => (
                  <div key={invite.id} className="flex items-center gap-3 rounded-2xl px-2 py-2 hover:bg-fog">
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-medium capitalize">{invite.role} link</div>
                      <div className="text-[13px] text-slate">
                        Created by {invite.createdBy.name} · expires {timeAgo(invite.expiresAt)}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copy(invite.id, `${window.location.origin}/invite/${invite.token}`)}
                    >
                      {copied === invite.id ? <Check /> : <Copy />} {copied === invite.id ? "Copied" : "Copy"}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => revokeInvite.mutate(invite.id)}>
                      Revoke
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Section>
        )}

        {isOwner && (
          <Section title="Delete workspace" text="Deletes every project, folder and diagram in it. This can't be undone.">
            <Button variant="destructive" onClick={() => setConfirmDelete(true)}>
              Delete workspace
            </Button>
          </Section>
        )}
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{workspace.name}”?</DialogTitle>
            <DialogDescription>All of its projects and diagrams are deleted for everyone. This can&apos;t be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteWorkspace.isPending}
              onClick={async () => {
                try {
                  await deleteWorkspace.mutateAsync();
                  router.replace("/app");
                } catch (error) {
                  toast.error(errorMessage(error));
                  setConfirmDelete(false);
                }
              }}
            >
              Delete workspace
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
