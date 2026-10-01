import { ChevronDown, ChevronsUpDown, Redo2, Share2, Undo2 } from "lucide-react";

import { FilesPanel } from "@/components/editor-chrome/files-panel";
import { Inspector } from "@/components/editor-chrome/inspector";
import { NotationRibbon } from "@/components/editor-chrome/notation-dock";
import { Facepile, UserAvatar } from "@/components/editor-chrome/presence";
import { JamChip, SaveStatus, ZoomControl } from "@/components/editor-chrome/status";

import { MockCanvas } from "../_components/mock-canvas";
import { FILES, ME, PEOPLE, PRESENCE } from "../_components/mock-data";

export const metadata = { title: "Layout B · Studio" };

const INSETS = { top: 40, right: 40, bottom: 70, left: 40 };

export default function StudioLayoutMockup() {
  return (
    <main className="flex h-dvh w-full overflow-hidden bg-fog">
      <div className="flex w-[292px] shrink-0 flex-col">
        <button type="button" className="mx-3 mt-3 flex h-12 items-center gap-2.5 rounded-2xl px-2 hover:bg-fog-strong">
          <UserAvatar user={ME} size={30} ring={false} />
          <span className="flex-1 text-left">
            <span className="block text-[13px] font-semibold leading-4">Nurasyl&apos;s team</span>
            <span className="block text-[12px] leading-4 text-slate">4 members</span>
          </span>
          <ChevronsUpDown className="size-4 text-slate" />
        </button>
        <FilesPanel
          projectName="Operations"
          folders={[]}
          files={FILES}
          activeFileId="d1"
          mode="thumbnails"
          trashCount={2}
          className="mx-3 mb-3 mt-2 min-h-0 flex-1 rounded-[24px] border border-hairline bg-paper"
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col py-3">
        <header className="flex h-12 items-center gap-3 px-2">
          <button type="button" className="flex items-center gap-1.5 text-[22px] font-semibold tracking-[-0.03em]">
            Order to cash <ChevronDown className="size-5 text-slate" />
          </button>
          <SaveStatus state="saved" />
          <div className="ml-auto flex items-center gap-2">
            <Facepile users={PEOPLE.slice(1)} />
            <JamChip code="K7MQ2P" />
            <button
              type="button"
              className="flex h-10 items-center gap-1.5 rounded-full bg-ink px-4 text-[14px] font-medium text-paper hover:opacity-90"
            >
              <Share2 className="size-4" strokeWidth={2} /> Share
            </button>
          </div>
        </header>

        <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] border border-hairline bg-paper">
          <div className="flex items-end gap-3 border-b border-hairline px-4 pb-3 pt-2.5">
            <NotationRibbon className="flex-1" />
            <div className="flex items-center gap-1 pb-0.5">
              <button type="button" aria-label="Undo" className="grid size-9 place-items-center rounded-xl hover:bg-fog">
                <Undo2 className="size-[18px]" strokeWidth={1.75} />
              </button>
              <button type="button" aria-label="Redo" className="grid size-9 place-items-center rounded-xl text-slate-soft">
                <Redo2 className="size-[18px]" strokeWidth={1.75} />
              </button>
            </div>
          </div>
          <div className="dot-grid relative min-h-0 flex-1">
            <MockCanvas src="/mockups/sample.bpmn" insets={INSETS} presence={PRESENCE} />
            <ZoomControl zoom={1} className="absolute bottom-4 left-4" />
          </div>
        </div>
      </div>

      <div className="w-[332px] shrink-0 py-3 pr-3 pl-3">
        <Inspector
          typeLabel="User task"
          glyph="task-user"
          name="Check order"
          documentation="Sales checks stock and the delivery address before confirming."
          elementId="Task_check"
          className="h-full rounded-[24px] border border-hairline bg-paper"
        />
      </div>
    </main>
  );
}
