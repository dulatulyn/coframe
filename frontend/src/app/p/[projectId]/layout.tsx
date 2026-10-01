"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";

import { ProjectFiles } from "@/components/project/project-files";
import { ApiError } from "@/lib/api/client";
import { useTree } from "@/lib/api/hooks";
import { closeNarrowFiles, useFilesPanel } from "@/lib/panels";
import { cn } from "@/lib/utils";
import { ProjectChannelProvider, useProjectChannel } from "@/realtime/project-channel";

function ReportPresence({ diagramId }: { diagramId: string | null }) {
  const { setDiagram } = useProjectChannel();
  useEffect(() => {
    setDiagram(diagramId);
  }, [diagramId, setDiagram]);
  return null;
}

function RevokedWatcher() {
  const { revoked } = useProjectChannel();
  const router = useRouter();
  useEffect(() => {
    if (revoked) {
      toast("You no longer have access to this project.");
      router.replace("/app");
    }
  }, [revoked, router]);
  return null;
}

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const { projectId, diagramId } = useParams<{ projectId: string; diagramId?: string }>();
  const router = useRouter();
  const { data: tree, error } = useTree(projectId);
  const files = useFilesPanel();

  useEffect(() => {
    closeNarrowFiles();
  }, [diagramId]);

  useEffect(() => {
    if (!(error instanceof ApiError)) return;
    if (error.status === 401) router.replace(`/login?next=/p/${projectId}`);
    else if (error.status === 404 || error.status === 403) {
      toast("This project doesn't exist or you don't have access to it.");
      router.replace("/app");
    }
  }, [error, projectId, router]);

  return (
    <ProjectChannelProvider projectId={projectId}>
      <ReportPresence diagramId={diagramId ?? null} />
      <RevokedWatcher />
      <div className="relative h-dvh w-full overflow-hidden bg-canvas">
        {children}
        {tree && files.open && !files.wide && (
          <button
            type="button"
            aria-label="Close files"
            onClick={() => files.setOpen(false)}
            className="absolute inset-0 z-30 bg-ink/15 backdrop-blur-[1px]"
          />
        )}
        {tree && files.open && (
          <ProjectFiles
            tree={tree}
            activeDiagramId={diagramId}
            className={cn(
              "absolute z-40 rounded-[24px] border border-hairline bg-paper shadow-float",
              files.wide ? "bottom-4 left-4 top-20 w-[300px]" : "inset-y-3 left-3 w-[min(320px,calc(100vw-24px))]",
            )}
          />
        )}
      </div>
    </ProjectChannelProvider>
  );
}
