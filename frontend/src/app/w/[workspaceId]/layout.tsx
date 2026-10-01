"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

import { AppHeader } from "@/components/app/app-header";
import { ApiError } from "@/lib/api/client";
import { useWorkspace } from "@/lib/api/hooks";
import { rememberWorkspace } from "@/lib/last-workspace";

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const router = useRouter();
  const { data: workspace, error } = useWorkspace(workspaceId);

  useEffect(() => {
    if (workspace) rememberWorkspace(workspace.id);
  }, [workspace]);

  useEffect(() => {
    if (error instanceof ApiError && error.status === 401) router.replace(`/login?next=/w/${workspaceId}`);
    else if (error instanceof ApiError && error.status === 404) router.replace("/app");
  }, [error, router, workspaceId]);

  return (
    <div className="min-h-dvh bg-paper">
      <AppHeader workspace={workspace} />
      {children}
    </div>
  );
}
