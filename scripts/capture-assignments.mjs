import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
const output = path.resolve(".data/previews");
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
  });
  await page.goto("http://127.0.0.1:3000/login");
  await page.getByLabel("E-posta adresi").fill("akademisyen@pusula.local");
  await page.getByLabel("Şifre", { exact: true }).fill("PusulaDemo2026!");
  await page.getByRole("button", { name: "Giriş yap", exact: true }).click();
  await page.getByRole("heading", { name: "Merhaba, Dr." }).waitFor();
  const c = (await (await page.request.get("http://127.0.0.1:3000/api/courses")).json()).find(
    (c) => c.code === "BIL101",
  );
  const headers = { origin: "http://127.0.0.1:3000" };
  // Archive only courses created by our earlier browser tests in the preview database.
  const testCourses = (
    await (await page.request.get("http://127.0.0.1:3000/api/courses")).json()
  ).filter(
    (course) =>
      (course.code === "E2E101" && /^E2E Öğrenme \d{13}$/.test(course.title)) ||
      /^PDF Ders \d{13}$/.test(course.title),
  );
  for (const course of testCourses)
    await page.request.post(`http://127.0.0.1:3000/api/courses/${course.id}/archive`, {
      headers,
      data: {},
    });
  const existing = await (
    await page.request.get(`http://127.0.0.1:3000/api/courses/${c.id}/assignments`)
  ).json();
  const options = await (
    await page.request.get(`http://127.0.0.1:3000/api/courses/${c.id}/assignment-options`)
  ).json();
  for (const data of [
    {
      title: "Algoritma adımlarını pekiştir",
      description: "Girdi, işlem ve çıktı kavramlarını üç etkileşimli etkinlikle tekrar et.",
      kind: "interactive",
      activity_version_ids: options.activities.map((a) => a.id),
    },
    {
      title: "Gündelik bir algoritma tasarla",
      description:
        "Günlük hayattan bir problemi seç. Girdileri, çözüm adımlarını ve beklenen çıktıyı açıkla. Metin veya PDF dosyasıyla teslim edebilirsin.",
      kind: "traditional",
    },
  ]) {
    if (existing.some((a) => a.title === data.title)) continue;
    const response = await page.request.post(
      `http://127.0.0.1:3000/api/courses/${c.id}/assignments`,
      { headers, data: { ...data, due_at: new Date(Date.now() + 7 * 86400000).toISOString() } },
    );
    if (!response.ok()) throw new Error(await response.text());
    const a = await response.json();
    const published = await page.request.post(
      `http://127.0.0.1:3000/api/courses/${c.id}/assignments/${a.id}/publish`,
      { headers, data: {} },
    );
    if (!published.ok()) throw new Error(await published.text());
  }
  await page.reload();
  await page.getByRole("heading", { name: "Merhaba, Dr." }).waitFor();
  await page.getByRole("button", { name: "Derslerim", exact: true }).click();
  await page.getByRole("button", { name: c.title, exact: true }).click();
  await page.getByRole("tab", { name: "Ödevler", exact: true }).click();
  await page
    .getByRole("heading", { name: "Gündelik bir algoritma tasarla", exact: true })
    .waitFor();
  await page.screenshot({
    path: path.join(output, "teacher-assignments-m4.png"),
    fullPage: true,
    animations: "disabled",
  });
  console.log(path.join(output, "teacher-assignments-m4.png"));
  await page.getByRole("tab", { name: "Analiz", exact: true }).click();
  await page.getByRole("heading", { name: "Son 7 günün katılımı", exact: true }).waitFor();
  await page.screenshot({
    path: path.join(output, "teacher-analysis-m4.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Çıkış yap", exact: true }).click();
  await page.getByLabel("E-posta adresi").fill("ogrenci@pusula.local");
  await page.getByLabel("Şifre", { exact: true }).fill("PusulaDemo2026!");
  await page.getByRole("button", { name: "Giriş yap", exact: true }).click();
  await page.getByRole("heading", { name: "Merhaba, Ece." }).waitFor();
  await page.getByRole("button", { name: "Derslerim", exact: true }).click();
  await page.getByRole("button", { name: c.title, exact: true }).click();
  await page.getByRole("button", { name: "Çalışmaya başla", exact: true }).click();
  await page.waitForURL("**/learn/**");
  await page
    .locator(".activity-player")
    .getByRole("heading", { name: "Algoritmanın özellikleri", exact: true })
    .waitFor();
  await page.screenshot({
    path: path.join(output, "student-activity-m4.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Çalışmaya ara ver ve ana sayfaya dön" }).click();
} finally {
  await browser.close();
}
