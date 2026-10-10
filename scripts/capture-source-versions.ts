import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { scannedAcademicPdf } from "../src/tests/fixtures";
const base = "http://127.0.0.1:3000",
  headers = { origin: base },
  output = path.resolve(".data/previews");
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const login = await context.request.post(`${base}/api/auth/login`, {
    headers,
    data: { email: "akademisyen@pusula.local", password: "PusulaDemo2026!" },
  });
  if (!login.ok()) throw new Error(await login.text());
  const course = (await (await context.request.get(`${base}/api/courses`)).json()).find(
    (c: { code: string }) => c.code === "BIL101",
  );
  const docs = await (
    await context.request.get(`${base}/api/courses/${course.id}/documents`)
  ).json();
  const current = docs.find(
    (d: { title: string }) => d.title === "Algoritmalar — güncellenmiş ders notu.pdf",
  );
  let doc = current;
  if (!current) {
    const previous = docs.find(
      (d: { title: string }) => d.title === "Algoritmalar — taranmış ders notu.pdf",
    );
    if (!previous) throw new Error("Initial OCR preview fixture not found");
    const response = await context.request.post(`${base}/api/uploads`, {
      headers,
      multipart: {
        course_id: course.id,
        purpose: "document",
        replace_id: previous.id,
        file: {
          name: "Algoritmalar — güncellenmiş ders notu.pdf",
          mimeType: "application/pdf",
          buffer: Buffer.from(scannedAcademicPdf(2)),
        },
      },
    });
    if (!response.ok()) throw new Error(await response.text());
    doc = await response.json();
  }
  let ready = false;
  for (let i = 0; i < 60; i++) {
    const detail = await (
      await context.request.get(`${base}/api/courses/${course.id}/documents/${doc.id}`)
    ).json();
    if (detail.status === "ready") {
      ready = true;
      break;
    }
    if (detail.status === "failed") throw new Error(JSON.stringify(detail));
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (!ready) throw new Error("OCR did not finish");
  const page = await context.newPage();
  await page.goto(`${base}/app?page=courses`);
  await page.getByRole("button", { name: course.title, exact: true }).click();
  await page.getByRole("tab", { name: "Kaynaklar ve AI", exact: true }).click();
  await page.getByRole("button", { name: `${doc.title} metnini incele`, exact: true }).click();
  await page.getByLabel("Kaynak sürümü").waitFor();
  await page.screenshot({
    path: path.join(output, "teacher-source-versions-m2.png"),
    animations: "disabled",
  });
  console.log(path.join(output, "teacher-source-versions-m2.png"));
} finally {
  await browser.close();
}
