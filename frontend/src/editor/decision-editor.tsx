"use client";

import { useRef, useState } from "react";

import type { Diagram, Project, User } from "@/lib/api/types";
import { useFilesPanel } from "@/lib/panels";

import { DmnWorkspace, type DmnState, type DmnWorkspaceHandle } from "./dmn/dmn-workspace";
import { OwnerBar } from "./dmn/owner-bar";
import { EditorTopBar } from "./ui/editor-top-bar";

export function DecisionEditor({ diagram, project, me }: { diagram: Diagram; project: Project; me: User }) {
  const readOnly = diagram.access !== "edit";
  const workspace = useRef<DmnWorkspaceHandle>(null);
  const [state, setState] = useState<DmnState>({ saveState: "saved", canUndo: false, canRedo: false });
  const files = useFilesPanel();

  return (
    <div className="coframe-decision absolute inset-0 isolate overflow-hidden bg-canvas">
      <EditorTopBar
        diagram={diagram}
        project={project}
        me={me}
        saveState={state.saveState}
        peers={[]}
        onFollow={() => {}}
        canUndo={state.canUndo}
        canRedo={state.canRedo}
        onUndo={() => workspace.current?.undo()}
        onRedo={() => workspace.current?.redo()}
        readOnly={readOnly}
        view="edit"
      />
      <div
        className="absolute inset-x-3 bottom-3 top-[76px] flex flex-col overflow-hidden rounded-[24px] border border-hairline bg-paper shadow-float sm:inset-x-4 sm:bottom-4 sm:top-20"
        style={files.wide && files.open ? { left: 332 } : undefined}
      >
        <OwnerBar projectId={project.id} ownerId={diagram.ownerId ?? null} diagramId={diagram.id} />
        <DmnWorkspace ref={workspace} diagramId={diagram.id} readOnly={readOnly} onState={setState} className="flex-1" />
      </div>
    </div>
  );
}
