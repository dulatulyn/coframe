"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { PublicViewer } from "@/editor/public-viewer";

function Viewer() {
  const { token } = useParams<{ token: string }>();
  const embedded = useSearchParams().get("embed") === "1";
  return <PublicViewer token={token} embedded={embedded} />;
}

export default function PublicDiagramPage() {
  return (
    <Suspense>
      <Viewer />
    </Suspense>
  );
}
