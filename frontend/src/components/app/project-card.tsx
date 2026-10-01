import Link from "next/link";

import { JamChip } from "@/components/editor-chrome/status";
import type { Project } from "@/lib/api/types";
import { timeAgo } from "@/lib/time";

import { DiagramThumb } from "./diagram-thumb";

export function ProjectCard({ project, index = 0 }: { project: Project; index?: number }) {
  return (
    <Link
      href={`/p/${project.id}`}
      className="group flex flex-col rounded-[28px] bg-fog p-2 outline-none transition-colors hover:bg-fog-strong focus-visible:ring-3 focus-visible:ring-cobalt/40"
    >
      <div className="relative aspect-[16/10] overflow-hidden rounded-[22px] border border-hairline bg-paper">
        <DiagramThumb
          diagramId={project.previewDiagramId}
          version={project.updatedAt}
          seed={index}
          className="size-full transition-transform duration-300 group-hover:scale-[1.02]"
        />
        {project.activeJam && <JamChip code={project.activeJam.code} className="absolute left-3 top-3 bg-paper shadow-float" />}
      </div>
      <div className="px-3 pb-2 pt-4">
        <div className="truncate text-[16px] font-semibold tracking-[-0.01em]">{project.name}</div>
        <div className="mt-0.5 text-[13px] text-slate">
          {project.diagramCount} {project.diagramCount === 1 ? "diagram" : "diagrams"} · Updated {timeAgo(project.updatedAt)}
        </div>
      </div>
    </Link>
  );
}
