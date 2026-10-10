import { assert } from "@/lib/errors";
import { createCanvas } from "@napi-rs/canvas";
import type { Worker } from "tesseract.js";
import { createOcrWorker, recognizePage, maxOcrPages } from "./ocr";
export interface Chunk {
  page: number;
  chunk_index: number;
  text: string;
  heading: string | null;
}
export async function extractPdf(
  bytes: Uint8Array,
  options: { ocr?: boolean } = {},
): Promise<{
  page_count: number;
  chunks: Chunk[];
  needs_ocr: boolean;
  ocr_pages: number[];
  ocr_confidence: number | null;
}> {
  // The legacy Node build supplies DOMMatrix through the optional native canvas package.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({
    data: bytes,
    useSystemFonts: true,
    useWorkerFetch: false,
    disableFontFace: true,
  });
  const pdf = await task.promise;
  const chunks: Chunk[] = [];
  const ocrPages: number[] = [],
    confidences: number[] = [];
  let ocr: Worker | undefined,
    unreadable = false;
  try {
    assert(pdf.numPages <= 300, "PDF en fazla 300 sayfa olabilir.");
    let total = 0;
    for (let page = 1; page <= pdf.numPages; page++) {
      const item = await pdf.getPage(page),
        text = await item.getTextContent();
      const lines: string[] = [];
      let line = "";
      for (const part of text.items) {
        if ("str" in part) {
          line += part.str + " ";
          if (part.hasEOL) {
            lines.push(line.trim());
            line = "";
          }
        }
      }
      if (line.trim()) lines.push(line.trim());
      let plain = lines.join("\n").split(String.fromCharCode(0)).join("").trim();
      if (plain.length < 30) {
        const ops = await item.getOperatorList();
        const hasImage = ops.fnArray.some((op) =>
          [
            pdfjs.OPS.paintImageXObject,
            pdfjs.OPS.paintInlineImageXObject,
            pdfjs.OPS.paintImageMaskXObject,
          ].includes(op),
        );
        if (hasImage) {
          ocrPages.push(page);
          if (options.ocr === false || process.env.OCR_ENABLED === "0") unreadable = true;
          else {
            assert(
              ocrPages.length <= maxOcrPages,
              `OCR bir belgede en fazla ${maxOcrPages} taranmış sayfa işler. Belgeyi bölüp yeniden yükle.`,
            );
            ocr ||= await createOcrWorker();
            const unit = item.getViewport({ scale: 1 });
            const scale = Math.min(
              2,
              Math.sqrt(8_000_000 / (unit.width * unit.height)),
              5000 / unit.width,
              5000 / unit.height,
            );
            const viewport = item.getViewport({ scale }),
              canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
            await item.render({
              canvas: canvas as unknown as HTMLCanvasElement,
              canvasContext: canvas.getContext("2d") as unknown as CanvasRenderingContext2D,
              viewport,
            }).promise;
            const recognized = await recognizePage(ocr, canvas.toBuffer("image/png"));
            plain = recognized.data.text.split(String.fromCharCode(0)).join("").trim();
            confidences.push(recognized.data.confidence);
            if (plain.length < 30) unreadable = true;
          }
        }
      }
      total += plain.length;
      assert(total <= 2_000_000, "PDF'den çıkarılan metin çok büyük.");
      const heading = plain.split("\n").find((l) => l.length >= 3 && l.length < 150) || null;
      for (let offset = 0; offset < plain.length; offset += 1800) {
        chunks.push({
          page,
          chunk_index: chunks.length,
          text: plain.slice(offset, offset + 2000),
          heading,
        });
      }
      item.cleanup();
    }
    return {
      page_count: pdf.numPages,
      chunks,
      needs_ocr: unreadable || chunks.map((c) => c.text).join("").length < 30,
      ocr_pages: ocrPages,
      ocr_confidence: confidences.length
        ? confidences.reduce((a, b) => a + b, 0) / confidences.length
        : null,
    };
  } finally {
    try {
      if (ocr) await ocr.terminate();
    } finally {
      await task.destroy();
    }
  }
}
