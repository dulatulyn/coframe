"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { LogoMark } from "@/components/app/logo";
import { useWorkspaces } from "@/lib/api/hooks";
import { lastWorkspace } from "@/lib/last-workspace";

export default function AppEntry() {
  const router = useRouter();
  const { data: workspaces, error } = useWorkspaces();

  useEffect(() => {
    if (error) router.replace("/login?next=/app");
    if (!workspaces) return;
    if (workspaces.length === 0) return;
    const last = lastWorkspace();
    const target = workspaces.find((w) => w.id === last) ?? workspaces[0];
    router.replace(`/w/${target.id}`);
  }, [workspaces, error, router]);

  return (
    <div className="grid min-h-dvh place-items-center">
      <LogoMark size={36} className="animate-pulse text-ink" />
    </div>
  );
}
