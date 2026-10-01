"use client";

import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";

import { ApiError } from "@/lib/api/client";
import { useDiagram, useMe, useTree } from "@/lib/api/hooks";

const DiagramEditor = dynamic(() => import("@/editor/diagram-editor").then((m) => m.DiagramEditor), { ssr: false });

export default function DiagramPage() {
  const { projectId, diagramId } = useParams<{ projectId: string; diagramId: string }>();
  const router = useRouter();
  const { data: diagram, error } = useDiagram(diagramId);
  const { data: tree } = useTree(projectId);
  const { data: me } = useMe();

  useEffect(() => {
    if (error instanceof ApiError && error.status === 404) {
      toast("That diagram was deleted or moved.");
      router.replace(`/p/${projectId}`);
    }
  }, [error, projectId, router]);

  if (!diagram || !tree || !me) return <div className="dot-grid absolute inset-0" />;
  return <DiagramEditor key={`${diagram.id}:${diagram.generation}`} diagram={diagram} project={tree.project} me={me} />;
}
