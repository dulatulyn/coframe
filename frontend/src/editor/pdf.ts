const encoder = new TextEncoder();

export type PdfPage = { jpeg: Uint8Array; pixelWidth: number; pixelHeight: number; pageWidth: number; pageHeight: number };

export function jpegToPdf(jpeg: Uint8Array, pixelWidth: number, pixelHeight: number, pageWidth: number, pageHeight: number): Blob {
  return jpegsToPdf([{ jpeg, pixelWidth, pixelHeight, pageWidth, pageHeight }]);
}

export function jpegsToPdf(pages: PdfPage[]): Blob {
  const kids = pages.map((_, i) => `${3 + i * 3} 0 R`).join(" ");
  const objects: (string | Uint8Array)[][] = [
    ["<< /Type /Catalog /Pages 2 0 R >>"],
    [`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`],
  ];
  pages.forEach((page, i) => {
    const w = page.pageWidth.toFixed(2);
    const h = page.pageHeight.toFixed(2);
    const image = 4 + i * 3;
    const contents = 5 + i * 3;
    const content = encoder.encode(`q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q\n`);
    objects.push(
      [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${image} 0 R >> >> /Contents ${contents} 0 R >>`],
      [
        `<< /Type /XObject /Subtype /Image /Width ${page.pixelWidth} /Height ${page.pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`,
        page.jpeg,
        "\nendstream",
      ],
      [`<< /Length ${content.length} >>\nstream\n`, content, "endstream"],
    );
  });

  const chunks: Uint8Array[] = [];
  let offset = 0;
  const push = (part: string | Uint8Array) => {
    const bytes = typeof part === "string" ? encoder.encode(part) : part;
    chunks.push(bytes);
    offset += bytes.length;
  };
  push("%PDF-1.4\n%âãÏÓ\n");
  const offsets: number[] = [];
  objects.forEach((parts, i) => {
    offsets.push(offset);
    push(`${i + 1} 0 obj\n`);
    parts.forEach(push);
    push("\nendobj\n");
  });
  const xref = offset;
  push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  for (const o of offsets) push(`${String(o).padStart(10, "0")} 00000 n \n`);
  push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks as BlobPart[], { type: "application/pdf" });
}
