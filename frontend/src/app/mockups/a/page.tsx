import { ChevronDown, PanelLeft, Share2, Undo2, Redo2 } from "lucide-react";

import { FilesPanel } from "@/components/editor-chrome/files-panel";
import { Inspector } from "@/components/editor-chrome/inspector";
import { NotationDock } from "@/components/editor-chrome/notation-dock";
import { Facepile, UserAvatar } from "@/components/editor-chrome/presence";
import { JamChip, SaveStatus, ZoomControl } from "@/components/editor-chrome/status";

import { MockCanvas } from "../_components/mock-canvas";
import { FILES, FOLDERS, ME, PEOPLE, PRESENCE } from "../_components/mock-data";

export const metadata = { title: "Layout A · Floating" };

const INSETS = { top: 90, right: 350, bottom: 120, left: 330 };

export default function FloatingLayoutMockup() {
  return (
    <main className="dot-grid relative h-dvh w-full overflow-hidden">
      <MockCanvas src="/mockups/sample.bpmn" insets={INSETS} presence={PRESENCE} />

      <div className="absolute left-4 top-4 flex h-12 items-center gap-1 rounded-full border border-hairline bg-paper pl-1.5 pr-4 shadow-float">
        <button type="button" aria-label="Toggle files" className="grid size-9 place-items-center rounded-full bg-fog">
          <PanelLeft className="size-[18px]" strokeWidth={1.75} />
        </button>
        <span className="ml-2 text-[14px] text-slate">Operations</span>
        <span className="text-slate-soft">/</span>
        <span className="text-[14px] text-slate">Finance</span>
        <span className="text-slate-soft">/</span>
        <button type="button" className="flex items-center gap-1 text-[14px] font-semibold tracking-tight">
          Order to cash <ChevronDown className="size-4 text-slate" />
        </button>
        <span className="mx-3 h-5 w-px bg-hairline" />
        <SaveStatus state="saved" />
      </div>

      <div className="absolute right-4 top-4 flex h-12 items-center gap-2 rounded-full border border-hairline bg-paper pl-2 pr-1.5 shadow-float">
        <button type="button" aria-label="Undo" className="grid size-9 place-items-center rounded-full hover:bg-fog">
          <Undo2 className="size-[18px]" strokeWidth={1.75} />
        </button>
        <button type="button" aria-label="Redo" className="grid size-9 place-items-center rounded-full text-slate-soft">
          <Redo2 className="size-[18px]" strokeWidth={1.75} />
        </button>
        <span className="h-5 w-px bg-hairline" />
        <Facepile users={PEOPLE.slice(1)} />
        <JamChip code="K7MQ2P" />
        <button
          type="button"
          className="flex h-9 items-center gap-1.5 rounded-full bg-ink px-4 text-[14px] font-medium text-paper hover:opacity-90"
        >
          <Share2 className="size-4" strokeWidth={2} /> Share
        </button>
        <UserAvatar user={ME} size={36} ring={false} />
      </div>

      <FilesPanel
        projectName="Operations"
        folders={FOLDERS}
        files={FILES}
        activeFileId="d1"
        trashCount={2}
        className="absolute bottom-4 left-4 top-20 w-[300px] rounded-[24px] border border-hairline bg-paper shadow-float"
      />

      <Inspector
        typeLabel="User task"
        glyph="task-user"
        name="Check order"
        documentation="Sales checks stock and the delivery address before confirming."
        elementId="Task_check"
        className="absolute right-4 top-20 w-[320px] rounded-[24px] border border-hairline bg-paper shadow-float"
      />

      <NotationDock openGroupId="task" className="absolute bottom-5 left-1/2 -translate-x-1/2" />

      <ZoomControl zoom={0.92} className="absolute bottom-5 right-16" />
    </main>
  );
}
