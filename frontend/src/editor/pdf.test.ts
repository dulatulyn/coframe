import { describe, expect, it } from "vitest";

import { jpegToPdf } from "./pdf";

async function text(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return Array.from(bytes, (b) => String.fromCharCode(b)).join("");
}

describe("jpegToPdf", () => {
  it("writes a one-page PDF whose cross-reference table points at every object", async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
    const pdf = await text(jpegToPdf(jpeg, 300, 200, 225, 150));

    expect(pdf.startsWith("%PDF-1.4\n")).toBe(true);
    expect(pdf.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(pdf).toContain("/MediaBox [0 0 225.00 150.00]");
    expect(pdf).toContain("/Width 300 /Height 200");
    expect(pdf).toContain(`/Length ${jpeg.length}`);

    const startxref = Number(pdf.match(/startxref\n(\d+)\n/)![1]);
    expect(pdf.slice(startxref, startxref + 4)).toBe("xref");
    const entries = [...pdf.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    expect(entries).toHaveLength(5);
    entries.forEach((offset, i) => expect(pdf.slice(offset, offset + 8)).toBe(`${i + 1} 0 obj\n`));
  });
});

describe("jpegsToPdf", () => {
  it("writes one page per image", async () => {
    const { jpegsToPdf } = await import("./pdf");
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const page = { jpeg, pixelWidth: 10, pixelHeight: 10, pageWidth: 100, pageHeight: 50 };
    const pdf = await text(jpegsToPdf([page, page, page]));
    expect(pdf).toContain("/Kids [3 0 R 6 0 R 9 0 R] /Count 3");
    const startxref = Number(pdf.match(/startxref\n(\d+)\n/)![1]);
    const entries = [...pdf.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    expect(entries).toHaveLength(11);
    entries.forEach((offset, i) => expect(pdf.slice(offset, offset + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
  });
});
