import Link from "next/link";

import { Button } from "@/components/ui/button";

const MESSAGES: Record<number, { title: string; text: string }> = {
  4401: { title: "You're logged out", text: "Log in again to keep editing. Your changes up to now are saved." },
  4403: {
    title: "Your access ended",
    text: "The jam ended or you were removed from the workspace. Ask the host for a new code or an invite.",
  },
  4404: { title: "This diagram was deleted", text: "Someone moved it to the trash. It can be restored from the project's trash." },
  4409: { title: "This diagram was replaced", text: "Its content was replaced by someone else. Reload to see the new version." },
};

export function SessionEndedOverlay({
  code,
  title,
  text,
  projectId,
}: {
  code?: number;
  title?: string;
  text?: string;
  projectId: string;
}) {
  const message = (code && MESSAGES[code]) || { title: title ?? "Disconnected", text: text ?? "" };
  return (
    <div className="absolute inset-0 z-40 grid place-items-center bg-paper/70 backdrop-blur-[2px]">
      <div className="w-[min(440px,calc(100%-32px))] rounded-[28px] border border-hairline bg-paper p-7 shadow-pop">
        <h2 className="text-[22px] font-semibold tracking-[-0.02em]">{message.title}</h2>
        <p className="mt-2 text-[15px] leading-6 text-slate">{message.text}</p>
        <div className="mt-6 flex flex-wrap gap-2">
          {code === 4401 ? (
            <Button asChild>
              <Link href={`/login?next=${encodeURIComponent(typeof window === "undefined" ? "/app" : window.location.pathname)}`}>Log in</Link>
            </Button>
          ) : code === 4409 ? (
            <Button onClick={() => window.location.reload()}>Reload</Button>
          ) : code === 4404 ? (
            <Button asChild>
              <Link href={`/p/${projectId}`}>Back to project</Link>
            </Button>
          ) : (
            <Button asChild>
              <Link href="/app">Go to my projects</Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
