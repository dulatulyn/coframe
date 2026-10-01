"use client";

import dynamic from "next/dynamic";

import type { MockPresence } from "./mockups/_components/mock-canvas";

const MockCanvas = dynamic(() => import("./mockups/_components/mock-canvas").then((m) => m.MockCanvas), { ssr: false });

const INSETS = { top: 90, right: 60, bottom: 60, left: 60 };

export function LandingCanvas({ presence }: { presence: MockPresence }) {
  return <MockCanvas src="/mockups/sample.bpmn" insets={INSETS} presence={presence} />;
}
