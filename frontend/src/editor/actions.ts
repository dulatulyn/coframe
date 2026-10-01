import { toast } from "sonner";

import type { CatalogItem } from "@/components/bpmn/catalog";
import type { ToolId } from "@/components/editor-chrome/notation-dock";

import { hasService, service, type BpmnEditor } from "./modeler";
import { jpegToPdf } from "./pdf";

export function activateTool(editor: BpmnEditor, tool: ToolId, event: MouseEvent): void {
  switch (tool) {
    case "hand":
      service(editor, "handTool").activateHand(event);
      break;
    case "lasso":
      service(editor, "lassoTool").activateSelection(event);
      break;
    case "space":
      service(editor, "spaceTool").activateSelection(event);
      break;
    case "connect":
      service(editor, "globalConnect").start(event);
      break;
    case "select":
      if (service(editor, "dragging").context()) service(editor, "dragging").cancel();
      break;
  }
}

export function startCreate(editor: BpmnEditor, item: CatalogItem, event: MouseEvent | DragEvent): void {
  const factory = service(editor, "elementFactory");
  const create = service(editor, "create");
  const options = item.options ?? {};

  if (item.type === "bpmn:Participant") {
    create.start(event, factory.createParticipantShape({ isExpanded: options.isExpanded !== false }));
    return;
  }
  if (item.type === "bpmn:SubProcess" && options.isExpanded && !options.triggeredByEvent) {
    const subProcess = factory.createShape({ type: "bpmn:SubProcess", x: 0, y: 0, isExpanded: true });
    const startEvent = factory.createShape({ type: "bpmn:StartEvent", x: 40, y: 82, parent: subProcess });
    create.start(event, [subProcess, startEvent], { hints: { autoSelect: [subProcess] } });
    return;
  }
  const attrs: Record<string, unknown> = { type: item.type, ...options };
  if (item.eventDefinition) attrs.eventDefinitionType = item.eventDefinition;
  create.start(event, factory.createShape(attrs));
}

export function openCreateMenu(editor: BpmnEditor, anchor: { x: number; y: number }): void {
  const popupMenu = service(editor, "popupMenu");
  const canvas = service(editor, "canvas");
  popupMenu.open(canvas.getRootElement(), "bpmn-create", anchor, {
    title: "Create element",
    width: 320,
    search: true,
  });
}

export function zoomBy(editor: BpmnEditor, factor: number): void {
  const canvas = service(editor, "canvas");
  const next = Math.min(4, Math.max(0.2, canvas.zoom() * factor));
  canvas.zoom(next, "auto");
}

export function zoomToFit(editor: BpmnEditor): void {
  const canvas = service(editor, "canvas");
  canvas.zoom("fit-viewport", "auto");
  if (canvas.zoom() > 1) canvas.zoom(1, "auto");
}

export function resetZoom(editor: BpmnEditor): void {
  service(editor, "canvas").zoom(1, "auto");
}

export function toggleMinimap(editor: BpmnEditor): boolean {
  if (!hasService(editor, "minimap")) return false;
  const minimap = service(editor, "minimap");
  minimap.toggle();
  return minimap.isOpen();
}

function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, " ").trim() || "diagram";
}

function download(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportBpmn(editor: BpmnEditor, name: string): Promise<void> {
  const { xml } = await editor.saveXML({ format: true });
  download(new Blob([xml ?? ""], { type: "application/xml" }), `${safeFileName(name)}.bpmn`);
}

export async function exportSvg(editor: BpmnEditor, name: string): Promise<void> {
  const { svg } = await editor.saveSVG();
  download(new Blob([svg], { type: "image/svg+xml" }), `${safeFileName(name)}.svg`);
}

async function renderImage(editor: BpmnEditor, scale: number, type: "image/png" | "image/jpeg", quality?: number) {
  const { svg } = await editor.saveSVG();
  const image = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("could not render the diagram image"));
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(image.width * scale);
    canvas.height = Math.ceil(image.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas not available");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
    if (!blob) throw new Error("could not encode the diagram image");
    return { blob, width: canvas.width, height: canvas.height, cssWidth: image.width, cssHeight: image.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function exportPng(editor: BpmnEditor, name: string, scale = 2): Promise<void> {
  const { blob } = await renderImage(editor, scale, "image/png");
  download(blob, `${safeFileName(name)}.png`);
}

export async function exportJpeg(editor: BpmnEditor, name: string, scale = 2): Promise<void> {
  const { blob } = await renderImage(editor, scale, "image/jpeg", 0.92);
  download(blob, `${safeFileName(name)}.jpg`);
}

export async function exportPdf(editor: BpmnEditor, name: string): Promise<void> {
  const { blob, width, height, cssWidth, cssHeight } = await renderImage(editor, 3, "image/jpeg", 0.95);
  const jpeg = new Uint8Array(await blob.arrayBuffer());
  const pdf = jpegToPdf(jpeg, width, height, cssWidth * 0.75, cssHeight * 0.75);
  download(pdf, `${safeFileName(name)}.pdf`);
}

export async function copyImage(editor: BpmnEditor): Promise<void> {
  const png = renderImage(editor, 2, "image/png").then((r) => r.blob);
  await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
}

export async function copyXml(editor: BpmnEditor): Promise<void> {
  const { xml } = await editor.saveXML({ format: true });
  await navigator.clipboard.writeText(xml ?? "");
}

export type ExportFormat = "bpmn" | "svg" | "png" | "jpeg" | "pdf" | "copy-image" | "copy-xml";

export async function runExport(editor: BpmnEditor, format: ExportFormat, name: string): Promise<void> {
  try {
    if (format === "bpmn") await exportBpmn(editor, name);
    else if (format === "svg") await exportSvg(editor, name);
    else if (format === "png") await exportPng(editor, name);
    else if (format === "jpeg") await exportJpeg(editor, name);
    else if (format === "pdf") await exportPdf(editor, name);
    else if (format === "copy-image") {
      await copyImage(editor);
      toast.success("Image copied");
    } else {
      await copyXml(editor);
      toast.success("BPMN XML copied");
    }
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Export failed");
  }
}
