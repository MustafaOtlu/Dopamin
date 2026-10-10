import { describe, expect, it } from "vitest";
import { extractPdf } from "@/modules/documents/extractor";
import { academicPdf, scannedAcademicPdf } from "./fixtures";

describe("Gerçek taranmış PDF ve OCR", () => {
  it("metin katmanı olmayan sayfayı OCR kapalıyken okunmuş saymaz", async () => {
    const result = await extractPdf(scannedAcademicPdf(), { ocr: false });
    expect(result.chunks).toHaveLength(0);
    expect(result.needs_ocr).toBe(true);
    expect(result.ocr_pages).toEqual([1]);
    expect(result.ocr_confidence).toBeNull();
  });
  it("PDF sayfasını gerçekten render eder ve Türkçe/İngilizce metni yerel OCR ile çıkarır", async () => {
    const result = await extractPdf(scannedAcademicPdf());
    expect(result.needs_ocr).toBe(false);
    expect(result.ocr_pages).toEqual([1]);
    expect(result.ocr_confidence).toBeGreaterThan(50);
    expect(result.chunks[0].page).toBe(1);
    const text = result.chunks.map((c) => c.text).join(" ");
    expect(text).toContain("Algoritmalar");
    expect(text).toContain("finite sequence");
    expect(text).toContain("çıktı");
  });
  it("metin katmanı olan PDF için OCR çalıştırmaz", async () => {
    const result = await extractPdf(academicPdf());
    expect(result.needs_ocr).toBe(false);
    expect(result.ocr_pages).toEqual([]);
    expect(result.ocr_confidence).toBeNull();
  });
});
