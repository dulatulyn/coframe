import { describe, expect, it } from "vitest";

import type { DiagramMeta, Folder, Tree } from "@/lib/api/types";

import { projectOrder } from "./project-pdf";

const folder = (id: string, position: string, parentId: string | null = null): Folder => ({
  id,
  projectId: "p",
  parentId,
  name: id.toUpperCase(),
  position,
  createdAt: "",
  updatedAt: "",
});

const diagram = (id: string, position: string, extra: Partial<DiagramMeta> = {}): DiagramMeta => ({
  id,
  projectId: "p",
  folderId: null,
  name: id,
  position,
  createdAt: "",
  updatedAt: "",
  contentUpdatedAt: "",
  previewUpdatedAt: null,
  pinnedAt: null,
  updatedBy: null,
  kind: "bpmn",
  ...extra,
});

const tree = (folders: Folder[], diagrams: DiagramMeta[]): Tree => ({ project: { name: "P" } as Tree["project"], folders, diagrams });

describe("projectOrder", () => {
  it("walks diagrams by position, nests owned decisions, then descends into folders", () => {
    const order = projectOrder(
      tree(
        [folder("b", "b0"), folder("a", "a0"), folder("a1", "a0", "a")],
        [
          diagram("second", "b0"),
          diagram("first", "a0"),
          diagram("pricing", "c0", { kind: "dmn", ownerId: "first" }),
          diagram("loose", "d0", { kind: "dmn" }),
          diagram("inA", "a0", { folderId: "a" }),
          diagram("deep", "a0", { folderId: "a1" }),
          diagram("inB", "a0", { folderId: "b" }),
        ],
      ),
    );
    expect(order.map((e) => [e.diagram.id, e.path])).toEqual([
      ["first", ""],
      ["pricing", ""],
      ["second", ""],
      ["loose", ""],
      ["inA", "A"],
      ["deep", "A / A1"],
      ["inB", "B"],
    ]);
  });

  it("puts diagrams of a missing folder at the root", () => {
    const order = projectOrder(tree([], [diagram("orphan", "a0", { folderId: "gone" })]));
    expect(order.map((e) => e.diagram.id)).toEqual(["orphan"]);
  });
});
