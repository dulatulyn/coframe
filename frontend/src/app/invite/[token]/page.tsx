"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import { Logo } from "@/components/app/logo";
import { WorkspaceBadge } from "@/components/app/workspace-switcher";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api/client";
import { useAcceptInvite, useInvitePreview, useMe } from "@/lib/api/hooks";

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const { data: me, isLoading: meLoading } = useMe();
  const { data: invite, error, isLoading } = useInvitePreview(token);
  const accept = useAcceptInvite();
  const [failure, setFailure] = useState<string | null>(null);
  const next = `/invite/${token}`;

  return (
    <div className="dot-grid flex min-h-dvh flex-col">
      <header className="px-6 py-6 sm:px-10">
        <Logo href={me ? "/app" : "/"} />
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-[440px] rounded-[32px] border border-hairline bg-paper p-8 shadow-pop">
          {isLoading || meLoading ? (
            <div className="flex h-48 items-center justify-center text-slate">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : error || !invite ? (
            <>
              <h1 className="display text-[30px]">Invite not found.</h1>
              <p className="mt-3 text-[15px] leading-6 text-slate">Ask for a new link.</p>
            </>
          ) : !invite.valid ? (
            <>
              <h1 className="display text-[30px]">This invite expired.</h1>
              <p className="mt-3 text-[15px] leading-6 text-slate">Ask {invite.invitedBy.name} for a new link to {invite.workspace.name}.</p>
            </>
          ) : (
            <>
              <WorkspaceBadge name={invite.workspace.name} size={48} />
              <h1 className="display mt-5 text-[32px]">Join {invite.workspace.name}</h1>
              <p className="mt-3 text-[15px] leading-6 text-slate">
                {invite.invitedBy.name} invited you as {invite.role === "admin" ? "an admin" : `a ${invite.role}`}. You&apos;ll see
                all of the workspace&apos;s projects.
              </p>
              {failure && <p className="mt-5 rounded-2xl bg-destructive/8 px-4 py-3 text-[14px] text-destructive">{failure}</p>}
              {me ? (
                <Button
                  size="lg"
                  className="mt-7 w-full"
                  disabled={accept.isPending}
                  onClick={async () => {
                    try {
                      const ws = await accept.mutateAsync(token);
                      router.replace(`/w/${ws.id}`);
                    } catch (e) {
                      setFailure(errorMessage(e));
                    }
                  }}
                >
                  Accept invite
                </Button>
              ) : (
                <div className="mt-7 flex flex-col gap-2">
                  <Button asChild size="lg">
                    <Link href={`/signup?next=${encodeURIComponent(next)}`}>Sign up to accept</Link>
                  </Button>
                  <Button asChild size="lg" variant="outline">
                    <Link href={`/login?next=${encodeURIComponent(next)}`}>I have an account</Link>
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
