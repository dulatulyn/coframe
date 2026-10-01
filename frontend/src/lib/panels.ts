"use client";

import { useSyncExternalStore } from "react";
import { create } from "zustand";

import { useProjectUi } from "./project-ui";

export const WIDE_SCREEN = "(min-width: 1024px)";
export const MEDIUM_SCREEN = "(min-width: 768px)";

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => true,
  );
}

type NarrowPanels = { files: boolean; inspector: boolean; set: (patch: Partial<{ files: boolean; inspector: boolean }>) => void };

const useNarrowPanels = create<NarrowPanels>((set) => ({
  files: false,
  inspector: false,
  set: (patch) => set(patch),
}));

export function closeNarrowFiles(): void {
  useNarrowPanels.setState({ files: false });
}

export function useFilesPanel() {
  const wide = useMediaQuery(WIDE_SCREEN);
  const stored = useProjectUi((s) => s.filesOpen);
  const setStored = useProjectUi((s) => s.setFilesOpen);
  const narrow = useNarrowPanels((s) => s.files);
  const setNarrow = useNarrowPanels((s) => s.set);
  return {
    wide,
    open: wide ? stored : narrow,
    setOpen: (open: boolean) => (wide ? setStored(open) : setNarrow({ files: open })),
  };
}

export function useInspectorPanel() {
  const medium = useMediaQuery(MEDIUM_SCREEN);
  const stored = useProjectUi((s) => s.inspectorOpen);
  const setStored = useProjectUi((s) => s.setInspectorOpen);
  const narrow = useNarrowPanels((s) => s.inspector);
  const setNarrow = useNarrowPanels((s) => s.set);
  return {
    medium,
    open: medium ? stored : narrow,
    setOpen: (open: boolean) => (medium ? setStored(open) : setNarrow({ inspector: open })),
  };
}
