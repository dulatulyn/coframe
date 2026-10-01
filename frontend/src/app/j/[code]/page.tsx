"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import { JoinAsGuestButton } from "@/components/app/guest";
import { Logo } from "@/components/app/logo";
import { JamCodeForm } from "@/components/app/join-jam";
import { UserAvatar } from "@/components/editor-chrome/presence";
import { formatJamCode } from "@/components/editor-chrome/status";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api/client";
import { useJamPreview, useJoinJam, useMe } from "@/lib/api/hooks";

export default function JoinJamPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const { data: me, isLoading: meLoading } = useMe();
  const { data: jam, error, isLoading } = useJamPreview(code);
  const join = useJoinJam();
  const [failure, setFailure] = useState<string | null>(null);
  const next = `/j/${code}`;

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
          ) : error || !jam ? (
            <div>
              <h1 className="display text-[30px]">This jam isn&apos;t live.</h1>
              <p className="mt-3 text-[15px] leading-6 text-slate">{errorMessage(error)}</p>
              <div className="mt-6">
                <div className="mb-2 text-[13px] font-medium">Try another code</div>
                <JamCodeForm />
              </div>
            </div>
          ) : (
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-beacon/10 px-3 py-1 text-[13px] font-medium">
                <span className="size-2 rounded-full bg-beacon" /> Live jam · {formatJamCode(jam.code)}
              </span>
              <h1 className="display mt-5 text-[34px]">{jam.projectName}</h1>
              <div className="mt-4 flex items-center gap-3">
                <UserAvatar user={jam.host} size={36} ring={false} />
                <div className="text-[14px] leading-5">
                  <div>
                    Hosted by <span className="font-medium">{jam.host.name}</span>
                  </div>
                  <div className="text-slate">
                    {jam.participantCount + 1} {jam.participantCount === 0 ? "person" : "people"} ·{" "}
                    {jam.access === "edit" ? "everyone can edit" : "view only"}
                  </div>
                </div>
              </div>
              {failure && <p className="mt-5 rounded-2xl bg-destructive/8 px-4 py-3 text-[14px] text-destructive">{failure}</p>}
              {me ? (
                <Button
                  size="lg"
                  className="mt-7 w-full"
                  disabled={join.isPending}
                  onClick={async () => {
                    setFailure(null);
                    try {
                      const result = await join.mutateAsync(jam.code);
                      router.replace(`/p/${result.projectId}`);
                    } catch (e) {
                      setFailure(errorMessage(e));
                    }
                  }}
                >
                  {join.isPending && <Loader2 className="animate-spin" />} Join as {me.name}
                </Button>
              ) : (
                <div className="mt-7 flex flex-col gap-2">
                  <Button asChild size="lg">
                    <Link href={`/signup?next=${encodeURIComponent(next)}`}>Sign up to join</Link>
                  </Button>
                  <Button asChild size="lg" variant="outline">
                    <Link href={`/login?next=${encodeURIComponent(next)}`}>I have an account</Link>
                  </Button>
                  <JoinAsGuestButton code={jam.code} size="lg" onFailure={setFailure} />
                  <p className="text-center text-[12px] leading-5 text-slate">
                    Guests join under an anonymous name and can sign up later to keep their work.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
