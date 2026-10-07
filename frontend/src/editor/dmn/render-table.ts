import { inputLabel, type Decision } from "@/lib/dmn";

const SCALE = 2;
const PAD = 32;
const CELL_X = 10;
const CELL_Y = 7;
const LINE = 17;
const MAX_COL = 260;
const MIN_COL = 56;
const FONT = '13px "Onest", system-ui, sans-serif';
const BOLD = '600 13px "Onest", system-ui, sans-serif';
const MONO = '12px ui-monospace, "SF Mono", Menlo, monospace';
const SMALL = '500 10px "Onest", system-ui, sans-serif';
const TITLE = '600 22px "Onest", system-ui, sans-serif';
const SUB = '13px "Onest", system-ui, sans-serif';

const HIT: Record<string, string> = {
  UNIQUE: "Unique",
  FIRST: "First",
  PRIORITY: "Priority",
  ANY: "Any",
  COLLECT: "Collect",
  "RULE ORDER": "Rule order",
  "OUTPUT ORDER": "Output order",
};

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= width || !line) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.flatMap((l) => {
    if (ctx.measureText(l).width <= width) return [l];
    const parts: string[] = [];
    let chunk = "";
    for (const ch of l) {
      if (ctx.measureText(chunk + ch).width > width && chunk) {
        parts.push(chunk);
        chunk = ch;
      } else chunk += ch;
    }
    if (chunk) parts.push(chunk);
    return parts;
  });
}

const show = (value: string) => (value.trim() === "" || value.trim() === "-" ? "–" : value.trim());

type Column = { header: string; type: string; kind: "index" | "input" | "output" | "note"; first: boolean; values: string[]; width: number };

export async function renderDecisionTable(
  decision: Decision,
  { title, subtitle }: { title: string; subtitle: string },
): Promise<{ blob: Blob; width: number; height: number; cssWidth: number; cssHeight: number }> {
  if (typeof document !== "undefined" && document.fonts?.ready) await document.fonts.ready;
  const probe = document.createElement("canvas").getContext("2d")!;
  const columns: Column[] = [
    { header: "#", type: "", kind: "index", first: false, values: decision.rules.map((_, i) => String(i + 1)), width: 0 },
    ...decision.inputs.map((input, i) => ({
      header: inputLabel(input),
      type: input.typeRef,
      kind: "input" as const,
      first: i === 0,
      values: decision.rules.map((r) => show(r.inputs[i] ?? "")),
      width: 0,
    })),
    ...decision.outputs.map((output, i) => ({
      header: output.label || output.name || "Result",
      type: output.typeRef,
      kind: "output" as const,
      first: i === 0,
      values: decision.rules.map((r) => show(r.outputs[i] ?? "")),
      width: 0,
    })),
  ];
  if (decision.rules.some((r) => r.description)) {
    columns.push({ header: "Notes", type: "", kind: "note", first: false, values: decision.rules.map((r) => r.description), width: 0 });
  }
  for (const column of columns) {
    probe.font = BOLD;
    let width = probe.measureText(column.header).width;
    probe.font = column.kind === "note" ? FONT : MONO;
    for (const value of column.values) width = Math.max(width, probe.measureText(value).width);
    column.width = Math.ceil(Math.min(MAX_COL, Math.max(column.kind === "index" ? 28 : MIN_COL, width)) + CELL_X * 2);
  }
  const tableWidth = columns.reduce((s, c) => s + c.width, 0);
  probe.font = TITLE;
  const titleWidth = probe.measureText(title).width;
  probe.font = SUB;
  const subWidth = probe.measureText(subtitle).width;
  const width = Math.ceil(Math.max(tableWidth, titleWidth, subWidth, 420) + PAD * 2);

  const cellLines = (column: Column, value: string) => {
    probe.font = column.kind === "note" ? FONT : column.kind === "index" ? FONT : MONO;
    return wrap(probe, value, column.width - CELL_X * 2);
  };
  probe.font = BOLD;
  const headerLines = columns.map((c) => wrap(probe, c.header, c.width - CELL_X * 2));
  const headerHeight = CELL_Y * 2 + 14 + LINE * Math.max(...headerLines.map((l) => l.length)) + (columns.some((c) => c.type) ? 14 : 0);
  const rowHeights = decision.rules.map((_, r) => CELL_Y * 2 + LINE * Math.max(...columns.map((c) => cellLines(c, c.values[r]).length)));
  const tableTop = PAD + 30 + 22 + 18;
  const tableHeight = headerHeight + rowHeights.reduce((s, h) => s + h, 0) + (decision.rules.length ? 0 : 40);
  const height = Math.ceil(tableTop + tableHeight + 40 + PAD);

  const canvas = document.createElement("canvas");
  canvas.width = width * SCALE;
  canvas.height = height * SCALE;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.textBaseline = "top";

  ctx.fillStyle = "#71717a";
  ctx.font = SMALL;
  ctx.fillText("DECISION TABLE", PAD, PAD);
  ctx.fillStyle = "#101012";
  ctx.font = TITLE;
  ctx.fillText(title, PAD, PAD + 16);
  ctx.fillStyle = "#71717a";
  ctx.font = SUB;
  ctx.fillText(subtitle, PAD, PAD + 46);

  const left = PAD;
  let x = left;
  ctx.fillStyle = "#f3f3f4";
  ctx.fillRect(left, tableTop, tableWidth, headerHeight);
  columns.forEach((column, i) => {
    ctx.fillStyle = "#71717a";
    ctx.font = SMALL;
    if (column.kind === "input" || column.kind === "output") {
      ctx.fillText(column.kind === "input" ? (column.first ? "WHEN" : "AND") : column.first ? "THEN" : "AND", x + CELL_X, tableTop + CELL_Y);
    }
    ctx.fillStyle = "#101012";
    ctx.font = BOLD;
    headerLines[i].forEach((line, l) => ctx.fillText(line, x + CELL_X, tableTop + CELL_Y + 14 + l * LINE));
    if (column.type) {
      ctx.fillStyle = "#71717a";
      ctx.font = SMALL;
      ctx.fillText(column.type, x + CELL_X, tableTop + CELL_Y + 14 + headerLines[i].length * LINE);
    }
    x += column.width;
  });

  let y = tableTop + headerHeight;
  decision.rules.forEach((_, r) => {
    if (r % 2) {
      ctx.fillStyle = "#fafafa";
      ctx.fillRect(left, y, tableWidth, rowHeights[r]);
    }
    let cx = left;
    columns.forEach((column) => {
      ctx.fillStyle = column.kind === "index" ? "#71717a" : "#101012";
      ctx.font = column.kind === "note" || column.kind === "index" ? FONT : MONO;
      cellLines(column, column.values[r]).forEach((line, l) => ctx.fillText(line, cx + CELL_X, y + CELL_Y + l * LINE));
      cx += column.width;
    });
    y += rowHeights[r];
  });
  if (!decision.rules.length) {
    ctx.fillStyle = "#71717a";
    ctx.font = FONT;
    ctx.fillText("No rules yet.", left + CELL_X, y + 12);
    y += 40;
  }

  ctx.strokeStyle = "#e4e4e7";
  ctx.lineWidth = 1;
  ctx.strokeRect(left + 0.5, tableTop + 0.5, tableWidth - 1, y - tableTop - 1);
  let gx = left;
  columns.forEach((column, i) => {
    if (i > 0) {
      const strong = column.kind === "output" && column.first;
      ctx.strokeStyle = strong ? "#a1a1aa" : "#e4e4e7";
      ctx.lineWidth = strong ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(gx + 0.5, tableTop);
      ctx.lineTo(gx + 0.5, y);
      ctx.stroke();
    }
    gx += column.width;
  });
  ctx.strokeStyle = "#e4e4e7";
  ctx.lineWidth = 1;
  let ry = tableTop + headerHeight;
  for (const h of [0, ...rowHeights]) {
    ry += h;
    ctx.beginPath();
    ctx.moveTo(left, ry - h + 0.5);
    ctx.lineTo(left + tableWidth, ry - h + 0.5);
    ctx.stroke();
  }

  ctx.fillStyle = "#71717a";
  ctx.font = SUB;
  ctx.fillText(`Hit policy: ${HIT[decision.hitPolicy.toUpperCase()] ?? decision.hitPolicy}`, left, y + 14);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.95));
  if (!blob) throw new Error("could not render the decision table");
  return { blob, width: canvas.width, height: canvas.height, cssWidth: width, cssHeight: height };
}
