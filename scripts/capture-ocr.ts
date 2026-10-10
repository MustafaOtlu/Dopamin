import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { scannedAcademicPdf } from "../src/tests/fixtures";
const base = "http://127.0.0.1:3000",
  headers = { origin: base },
  output = path.resolve(".data/previews");
await mkdir(output, { recursive: true });
const bytes = scannedAcademicPdf();
await writeFile(path.join(output, "scanned-algorithms.pdf"), bytes);
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const login = await context.request.post(`${base}/api/auth/login`, {
    headers,
    data: { email: "akademisyen@pusula.local", password: "PusulaDemo2026!" },
  });
  if (!login.ok()) throw new Error(await login.text());
  const courses = await (await context.request.get(`${base}/api/courses`)).json();
  const course = courses.find((c: { code: string }) => c.code === "BIL101");
  const upload = await context.request.post(`${base}/api/uploads`, {
    headers,
    multipart: {
      course_id: course.id,
      purpose: "document",
      file: {
        name: "Algoritmalar — taranmış ders notu.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from(bytes),
      },
    },
  });
  if (!upload.ok()) throw new Error(await upload.text());
  const doc = await upload.json();
  let ready = false;
  for (let i = 0; i < 60; i++) {
    const detail = await (
      await context.request.get(`${base}/api/courses/${course.id}/documents/${doc.id}`)
    ).json();
    if (detail.status === "ready") {
      console.log({
        status: detail.status,
        ocr_pages: detail.ocr_pages,
        confidence: detail.ocr_confidence,
      });
      ready = true;
      break;
    }
    if (detail.status === "failed" || detail.status === "needs_ocr")
      throw new Error(JSON.stringify(detail));
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (!ready) throw new Error("OCR queue did not complete");
  const page = await context.newPage();
  page.on("pageerror", (err) => console.log("UI error", err.message));
  await page.goto(`${base}/app`);
  await page.getByRole("heading", { name: "Merhaba, Dr." }).waitFor();
  await page.getByRole("button", { name: "Derslerim", exact: true }).click();
  await page.getByRole("button", { name: course.title, exact: true }).click();
  await page.getByRole("tab", { name: "Kaynaklar ve AI", exact: true }).click();
  await page.getByText("OCR · İncele", { exact: true }).waitFor();
  await page.screenshot({
    path: path.join(output, "teacher-ocr-m2.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: `${doc.title} metnini incele`, exact: true }).click();
  await page
    .locator(".document-text")
    .getByText(/finite sequence/)
    .waitFor();
  await page.screenshot({
    path: path.join(output, "teacher-ocr-text-m2.png"),
    animations: "disabled",
  });
  console.log(path.join(output, "teacher-ocr-m2.png"));
} finally {
  await browser.close();
}
