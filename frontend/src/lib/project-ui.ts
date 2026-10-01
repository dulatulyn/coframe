import { create } from "zustand";
import { persist } from "zustand/middleware";

type ProjectUi = {
  filesOpen: boolean;
  filesMode: "list" | "thumbnails";
  sort: "manual" | "updated" | "name";
  inspectorOpen: boolean;
  setFilesOpen: (open: boolean) => void;
  setFilesMode: (mode: "list" | "thumbnails") => void;
  setSort: (sort: "manual" | "updated" | "name") => void;
  setInspectorOpen: (open: boolean) => void;
};

export const useProjectUi = create<ProjectUi>()(
  persist(
    (set) => ({
      filesOpen: true,
      filesMode: "list",
      sort: "manual",
      inspectorOpen: true,
      setFilesOpen: (filesOpen) => set({ filesOpen }),
      setFilesMode: (filesMode) => set({ filesMode }),
      setSort: (sort) => set({ sort }),
      setInspectorOpen: (inspectorOpen) => set({ inspectorOpen }),
    }),
    { name: "coframe:project-ui" },
  ),
);
