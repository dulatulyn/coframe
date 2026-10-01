"use client";

import { useParams } from "next/navigation";

import { ProcessMap } from "@/components/project/process-map";

export default function ProcessMapPage() {
  const { projectId } = useParams<{ projectId: string }>();
  return <ProcessMap projectId={projectId} />;
}
