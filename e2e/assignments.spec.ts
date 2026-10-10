import { test, expect } from "@playwright/test";
import { loginDemo } from "./auth";
import { academicPdf } from "../src/tests/fixtures";
test("akademisyen PDF ödevi açar; öğrenci teslim eder, geri bildirimle yeniden teslim eder", async ({
  browser,
}) => {
  const teacher = await browser.newContext(),
    student = await browser.newContext();
  const headers = { origin: "http://127.0.0.1:3001" };
  await loginDemo(teacher);
  const c = await (
    await teacher.request.post("/api/courses", {
      headers,
      data: { title: `Ödev Sınıfı ${Date.now()}`, term: "Güz" },
    })
  ).json();
  await student.request.post("/api/auth/signup", {
    headers,
    data: {
      email: `submission-${Date.now()}@pusula.local`,
      password: "TestPassword2026!",
      display_name: "Ödev Öğrenci",
      role: "student",
    },
  });
  await student.request.post("/api/courses/join", { headers, data: { code: c.invite_code } });
  const t = await teacher.newPage();
  await t.goto("/app?page=courses");
  await t.getByRole("button", { name: c.title, exact: true }).click();
  await t.getByRole("tab", { name: "Ödevler", exact: true }).click();
  await t.getByRole("button", { name: "Ödev oluştur" }).click();
  const td = t.getByRole("dialog");
  await td.getByLabel("Ödev başlığı").fill("Algoritma raporu");
  await td
    .getByLabel("Açıklama", { exact: true })
    .fill("Bir günlük hayat algoritmasını PDF ile anlat.");
  await td.getByRole("button", { name: "Ödev taslağını kaydet" }).click();
  await t.getByRole("button", { name: "Yayımla", exact: true }).click();
  await expect(t.getByText("Yayında", { exact: true })).toBeVisible();
  const s = await student.newPage();
  await s.goto("/app?page=courses");
  await s.getByRole("button", { name: "Görevler", exact: true }).click();
  await s.getByRole("button", { name: "Ödevler", exact: true }).click();
  await s.getByRole("button", { name: "Ödevi aç" }).click();
  const sd = s.getByRole("dialog");
  await sd.getByLabel("Teslim metni").fill("Algoritmamın adımları ekte.");
  await sd
    .locator("input[type=file]")
    .setInputFiles({
      name: "odev.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(academicPdf()),
    });
  await expect(sd.getByText("Eklendi: odev.pdf", { exact: true })).toBeVisible();
  await sd.getByRole("button", { name: "Ödevi teslim et" }).click();
  await expect(sd.getByText("Teslim edildi", { exact: true })).toBeVisible();
  await t.getByRole("button", { name: "Ödevi aç" }).click();
  await td.getByLabel("Ödev Öğrenci için geri bildirim").fill("Bir kaynak bağlantısı ekle.");
  await td.getByLabel("Düzeltme için öğrenciye geri gönder").check();
  await td.getByRole("button", { name: "Değerlendirmeyi kaydet" }).click();
  await expect(td.getByText("Düzeltme istendi", { exact: true }).first()).toBeVisible();
  await sd.getByRole("button", { name: "Kapat", exact: true }).click();
  await s.reload();
  await s.getByRole("button", { name: "Görevler", exact: true }).click();
  await s.getByRole("button", { name: "Ödevler", exact: true }).click();
  await s.getByRole("button", { name: "Ödevi aç" }).click();
  await expect(sd.getByText("Bir kaynak bağlantısı ekle.", { exact: true })).toBeVisible();
  await sd.getByLabel("Teslim metni").fill("Kaynaklar eklendi.");
  await sd.getByLabel("Teslim bağlantısı").fill("https://example.edu/source");
  await sd.getByRole("button", { name: "Ödevi teslim et" }).click();
  await expect(sd.getByText(/2\. teslim/)).toBeVisible();
  await td.getByRole("button", { name: "Kapat", exact: true }).click();
  await t.reload();
  await t.getByRole("button", { name: c.title, exact: true }).click();
  await t.getByRole("tab", { name: "Ödevler", exact: true }).click();
  await t.getByRole("button", { name: "Ödevi aç" }).click();
  await td.getByLabel("Ödev Öğrenci için geri bildirim").fill("Çalışman tamamlandı.");
  await td.getByLabel("Not (0–100, isteğe bağlı)").fill("90");
  await td.getByRole("button", { name: "Değerlendirmeyi kaydet" }).click();
  await expect(td.getByText("Değerlendirildi", { exact: true })).toBeVisible();
  expect((await (await student.request.get("/api/daily")).json()).plan.status).toBe("no_content");
  await teacher.close();
  await student.close();
});
