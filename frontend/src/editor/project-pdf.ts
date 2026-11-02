import type { DiagramMeta, Tree } from "@/lib/api/types";

import { download, loadDiagramXml, rasterizeSvg, safeFileName, type RenderedImage, type XmlLoader } from "./actions";
import type { PdfPage } from "./pdf";

export type ProjectEntry = { diagram: DiagramMeta; path: string };

const byPosition = <T extends { position: string }>(a: T, b: T) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0);

/** Every diagram of the project in panel order: each folder's diagrams (decisions right after their owner), then its subfolders. */
export function projectOrder(tree: Tree): ProjectEntry[] {
  const folderIds = new Set(tree.folders.map((f) => f.id));
  const entries: ProjectEntry[] = [];
  const visited = new Set<string | null>();
  const walk = (folderId: string | null, path: string) => {
    if (visited.has(folderId)) return;
    visited.add(folderId);
    const here = tree.diagrams
      .filter((d) => (d.folderId && folderIds.has(d.folderId) ? d.folderId : null) === folderId)
      .sort(byPosition);
    const ids = new Set(here.map((d) => d.id));
    const nested = (d: DiagramMeta) => d.kind === "dmn" && !!d.ownerId && ids.has(d.ownerId);
    for (const d of here) {
      if (nested(d)) continue;
      entries.push({ diagram: d, path });
      for (const child of here) if (child.ownerId === d.id && nested(child)) entries.push({ diagram: child, path });
    }
    const subfolders = tree.folders
      .filter((f) => (f.parentId && folderIds.has(f.parentId) ? f.parentId : null) === folderId)
      .sort(byPosition);
    for (const f of subfolders) walk(f.id, path ? `${path} / ${f.name}` : f.name);
  };
  walk(null, "");
  return entries;
}

type ExportProgress = (done: number, total: number) => void;

export type ProjectPdfResult = { pages: number; skipped: string[] };

const SCALE = 2;

function toPage(image: RenderedImage): Promise<PdfPage> {
  return image.blob.arrayBuffer().then((buffer) => ({
    jpeg: new Uint8Array(buffer),
    pixelWidth: image.width,
    pixelHeight: image.height,
    pageWidth: image.cssWidth * 0.75,
    pageHeight: image.cssHeight * 0.75,
  }));
}

async function createViewer() {
  const [{ default: Viewer }, { COFRAME_MODDLE }, { renderer }] = await Promise.all([
    import("bpmn-js/lib/Viewer"),
    import("./coframe-moddle"),
    import("./modeler"),
  ]);
  const container = document.createElement("div");
  Object.assign(container.style, { position: "fixed", left: "-20000px", top: "0", width: "1600px", height: "1000px" });
  document.body.appendChild(container);
  const viewer = new Viewer({ container, bpmnRenderer: renderer, moddleExtensions: { coframe: COFRAME_MODDLE } });
  return {
    viewer,
    dispose: () => {
      viewer.destroy();
      container.remove();
    },
  };
}

type Root = { id: string; children?: unknown[]; businessObject?: { name?: string; $type?: string } };

async function bpmnPages(viewer: Awaited<ReturnType<typeof createViewer>>["viewer"], xml: string, title: string, path: string): Promise<PdfPage[]> {
  await viewer.importXML(xml);
  const canvas = viewer.get("canvas") as { getRootElements(): Root[]; getRootElement(): Root; setRootElement(root: Root): void };
  const main = canvas.getRootElement();
  const roots = [main, ...canvas.getRootElements().filter((r) => r !== main)];
  const pages: PdfPage[] = [];
  for (const root of roots) {
    if (!root.children?.length) continue;
    canvas.setRootElement(root);
    const { svg } = await viewer.saveSVG();
    const sub = root === main ? null : root.businessObject?.name?.trim() || "Untitled subprocess";
    const header = sub
      ? { title: `${title} › ${sub}`, subtitle: [path, "Subprocess"].filter(Boolean).join(" · ") }
      : { title, subtitle: path || undefined };
    pages.push(await toPage(await rasterizeSvg(svg, SCALE, "image/jpeg", 0.92, header)));
  }
  return pages;
}

async function dmnPages(xml: string, title: string, path: string): Promise<PdfPage[]> {
  const [{ parseDmn }, { renderDecisionTable }] = await Promise.all([import("@/lib/dmn"), import("./dmn/render-table")]);
  const pages: PdfPage[] = [];
  for (const decision of parseDmn(xml)) {
    if (decision.kind !== "table") continue;
    const name = decision.name || title;
    const subtitle = [path, name === title ? "" : title].filter(Boolean).join(" · ") || "Decision table";
    pages.push(await toPage(await renderDecisionTable(decision, { title: name, subtitle })));
  }
  return pages;
}

/** Renders every diagram, subprocess and decision table of the project into one PDF and downloads it. */
export async function exportProjectPdf(tree: Tree, onProgress?: ExportProgress, load: XmlLoader = loadDiagramXml): Promise<ProjectPdfResult> {
  const { jpegsToPdf } = await import("./pdf");
  const entries = projectOrder(tree);
  const pages: PdfPage[] = [];
  const skipped: string[] = [];
  let viewer: Awaited<ReturnType<typeof createViewer>> | null = null;
  try {
    for (const [i, { diagram, path }] of entries.entries()) {
      onProgress?.(i, entries.length);
      try {
        const xml = await load(diagram.id);
        if (!xml) throw new Error("not loaded");
        if (diagram.kind === "dmn") pages.push(...(await dmnPages(xml, diagram.name, path)));
        else {
          viewer ??= await createViewer();
          pages.push(...(await bpmnPages(viewer.viewer, xml, diagram.name, path)));
        }
      } catch {
        skipped.push(diagram.name);
      }
    }
  } finally {
    viewer?.dispose();
  }
  onProgress?.(entries.length, entries.length);
  if (pages.length === 0) throw new Error("Nothing to export yet");
  download(jpegsToPdf(pages), `${safeFileName(tree.project.name)}.pdf`);
  return { pages: pages.length, skipped };
}

let exporting = false;

/** Loads the project tree, renders the whole-project PDF and reports progress in a toast. */
export async function exportWholeProjectPdf(projectId: string): Promise<void> {
  if (exporting) return;
  exporting = true;
  const [{ toast }, { track }] = await Promise.all([import("sonner"), import("@/lib/analytics")]);
  track("export", { format: "project-pdf" });
  const id = toast.loading("Preparing PDF…");
  try {
    const res = await fetch(`/api/projects/${projectId}/tree`, { credentials: "same-origin" });
    if (!res.ok) throw new Error("Could not load the project");
    const tree = (await res.json()) as Tree;
    const { pages, skipped } = await exportProjectPdf(tree, (done, total) =>
      toast.loading(`Rendering ${Math.min(done + 1, total)} of ${total}…`, { id }),
    );
    const note = skipped.length ? ` · skipped: ${skipped.join(", ")}` : "";
    toast.success(`PDF with ${pages} ${pages === 1 ? "page" : "pages"}${note}`, { id });
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Export failed", { id });
  } finally {
    exporting = false;
  }
}
