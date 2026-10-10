import { test, expect } from "@playwright/test";
import { academicPdf } from "../src/tests/fixtures";
import { expectAccessible } from "./accessibility";

test("akademisyen dersi ve üç etkinliği oluşturur; öğrenci katılır, çözer, sonuç görüntülenir", async ({
  browser,
}) => {
  const teacherContext = await browser.newContext();
  const teacher = await teacherContext.newPage();
  await teacher.goto("/login");
  await teacher.getByLabel("E-posta adresi").fill("akademisyen@pusula.local");
  await teacher.getByLabel("Şifre", { exact: true }).fill("PusulaDemo2026!");
  await teacher.getByRole("button", { name: "Giriş yap", exact: true }).click();
  await expect(teacher.getByRole("heading", { name: "Çalışma masası" })).toBeVisible();
  await teacher.getByRole("button", { name: "Yeni ders", exact: true }).click();
  const dialog = teacher.getByRole("dialog");
  const title = `E2E Öğrenme ${Date.now()}`;
  await dialog.getByLabel("Ders adı", { exact: true }).fill(title);
  await dialog.getByLabel("Ders kodu").fill("E2E101");
  await dialog.getByRole("button", { name: "Dersi oluştur" }).click();
  await expect(teacher.getByRole("heading", { name: title, exact: true })).toBeVisible();
  const code = (await teacher.locator(".invite-box strong").innerText()).trim();
  await teacher.getByRole("tab", { name: "Müfredat", exact: true }).click();
  await teacher.getByRole("button", { name: "Kazanım ekle", exact: true }).click();
  await dialog.getByLabel("Konu", { exact: true }).fill("Algoritmalar");
  await dialog.getByLabel("Ölçülebilir öğrenme kazanımı").fill("Algoritma akışını anlayabilme");
  await dialog.getByRole("button", { name: "Kazanımı ekle", exact: true }).click();
  await expect(
    teacher.getByRole("heading", { name: "Algoritma akışını anlayabilme" }),
  ).toBeVisible();
  await teacher.getByRole("tab", { name: "Etkinlikler", exact: true }).click();
  for (const [kind, label, items] of [
    ["true_false", "Boolean etkinliği", ""],
    ["matching", "Eşleştirme etkinliği", "Girdi = Başlangıç verisi\nÇıktı = Sonuç"],
    ["ordering", "Sıralama etkinliği", "Başla\nİşle\nBitir"],
  ]) {
    await teacher.getByRole("button", { name: "Etkinlik hazırla" }).click();
    await dialog.getByLabel("Etkinlik türü").selectOption(kind);
    await dialog.getByLabel("Başlık", { exact: true }).fill(label);
    if (kind === "true_false")
      await dialog
        .getByLabel("Önerme", { exact: true })
        .fill("Algoritmalar sonlu adımlardan oluşur.");
    else await dialog.locator("textarea[name=items]").fill(items);
    await dialog
      .getByLabel("Öğrenme açıklaması")
      .fill("Adımların anlamını ve doğru sırasını incele.");
    await dialog.getByRole("button", { name: "Taslağı kaydet" }).click();
    const row = teacher
      .locator(".activity-row")
      .filter({ has: teacher.getByRole("heading", { name: label, exact: true }) });
    await row.getByRole("button", { name: "Yayımla", exact: true }).click();
    await expect(row.getByText("Yayında", { exact: true })).toBeVisible();
  }
  const studentContext = await browser.newContext();
  const student = await studentContext.newPage();
  await student.goto("/register");
  await student.getByLabel("Adın ve soyadın").fill("E2E Öğrenci");
  await student.getByLabel("E-posta adresi").fill(`e2e-${Date.now()}@pusula.local`);
  await student.getByLabel("Şifre", { exact: true }).fill("TestPassword2026!");
  await student.getByRole("button", { name: "Hesabımı oluştur" }).click();
  await expect(student.getByRole("heading", { name: "Öğrenme yolun" })).toBeVisible();
  await student.getByRole("button", { name: "Sınıfa katıl", exact: true }).first().click();
  await student.getByRole("dialog").getByLabel("Sınıf kodu").fill(code);
  await student.getByRole("dialog").getByRole("button", { name: "Katıl", exact: true }).click();
  await student.getByRole("combobox", { name: "Ders seç", exact: true }).click();
  await student.getByRole("option").filter({ hasText: title }).click();
  await student.getByRole("button", { name: "Algoritmalar konusunu aç", exact: true }).click();
  await student.getByRole("button", { name: /^Tekrar/ }).click();
  await student.getByRole("button", { name: "Doğru", exact: true }).waitFor();
  await expectAccessible(student, "true-false");
  await student.getByRole("button", { name: "Doğru", exact: true }).press("Enter");
  await student.getByRole("button", { name: "Cevabımı kontrol et" }).click();
  await expect(student.getByText("Güzel, doğru cevap!", { exact: true })).toBeVisible();
  await student.getByRole("button", { name: "Devam et", exact: true }).click();
  await student.getByRole("button", { name: "Girdi", exact: true }).click();
  await student.getByRole("button", { name: "Başlangıç verisi", exact: true }).click();
  await student.getByRole("button", { name: "Çıktı", exact: true }).click();
  await student.getByRole("button", { name: "Sonuç", exact: true }).click();
  await expectAccessible(student, "matching");
  await student.getByRole("button", { name: "Cevabımı kontrol et" }).click();
  await student.getByRole("button", { name: "Devam et", exact: true }).click();
  const start = student.getByRole("button", { name: /^Başla,/ });
  await start.press("Space");
  await start.press("ArrowUp");
  await start.press("ArrowUp");
  await start.press("Space");
  const process = student.getByRole("button", { name: /^İşle,/ });
  await process.press("Space");
  await process.press("ArrowUp");
  await process.press("Space");
  await expectAccessible(student, "ordering");
  await student.getByRole("button", { name: "Cevabımı kontrol et" }).click();
  await expect(student.getByText("Güzel, doğru cevap!", { exact: true })).toBeVisible();
  await student.getByRole("button", { name: "Sonucumu gör" }).click();
  await expect(student.getByRole("heading", { name: "Çalışma tamamlandı!" })).toBeVisible();
  await expect(student.getByText("3/3", { exact: true })).toBeVisible();
  await teacher.reload();
  await teacher.getByRole("button", { name: "Derslerim", exact: true }).click();
  await teacher.getByRole("button", { name: title, exact: true }).click();
  await teacher.getByRole("tab", { name: "Analiz", exact: true }).click();
  await expect(teacher.getByRole("cell", { name: "E2E Öğrenci", exact: true })).toHaveCount(3);
  await teacherContext.close();
  await studentContext.close();
});

test("mobil ekranda yatay taşma yok ve gezinme çalışır", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  await page.getByLabel("E-posta adresi").fill("ogrenci@pusula.local");
  await page.getByLabel("Şifre", { exact: true }).fill("PusulaDemo2026!");
  await page.getByRole("button", { name: "Giriş yap", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Öğrenme yolun" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole("button", { name: "Görevler", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Görevler", exact: true })).toBeVisible();
});

test("PDF yükleme, sayfa metni ve özel öğrenci erişimi", async ({ browser }) => {
  const teacherContext = await browser.newContext();
  const page = await teacherContext.newPage();
  await page.goto("/login");
  await page.getByLabel("E-posta adresi").fill("akademisyen@pusula.local");
  await page.getByLabel("Şifre", { exact: true }).fill("PusulaDemo2026!");
  await page.getByRole("button", { name: "Giriş yap", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Çalışma masası" })).toBeVisible();
  const response = await page.request.post("/api/courses", {
    headers: { origin: "http://127.0.0.1:3001" },
    data: { title: `PDF Ders ${Date.now()}`, term: "Test" },
  });
  expect(response.status()).toBe(200);
  const course = await response.json();
  await page.reload();
  await page.getByRole("button", { name: "Derslerim", exact: true }).click();
  await page.getByRole("button", { name: course.title, exact: true }).click();
  await page.getByRole("tab", { name: "Kaynaklar ve AI" }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "test-curriculum.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(academicPdf()),
  });
  await expect(page.getByText("Hazır", { exact: true })).toBeVisible({ timeout: 30000 });
  await page.getByRole("button", { name: "test-curriculum.pdf metnini incele" }).click();
  await expect(page.getByRole("dialog").getByText(/finite sequence/)).toBeVisible();
  await expect(page.getByRole("dialog").getByText("SAYFA 1", { exact: true })).toBeVisible();
  const docs = await (await page.request.get(`/api/courses/${course.id}/documents`)).json();
  const fileId = docs[0].file_id;
  const studentContext = await browser.newContext();
  const student = await studentContext.newPage();
  await student.goto("/login");
  await student.getByLabel("E-posta adresi").fill("ogrenci@pusula.local");
  await student.getByLabel("Şifre", { exact: true }).fill("PusulaDemo2026!");
  await student.getByRole("button", { name: "Giriş yap", exact: true }).click();
  await expect(student.getByRole("heading", { name: "Öğrenme yolun" })).toBeVisible();
  await student.request.post("/api/courses/join", {
    headers: { origin: "http://127.0.0.1:3001" },
    data: { code: course.invite_code },
  });
  expect((await student.request.get(`/api/files/${fileId}`)).status()).toBe(404);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Öğrencilere aç", exact: true })
    .click();
  await expect(
    page.getByRole("dialog").getByRole("button", { name: "Öğrenci erişimini kapat" }),
  ).toBeVisible();
  const download = await student.request.get(`/api/files/${fileId}`);
  expect(download.status()).toBe(200);
  expect(download.headers()["content-type"]).toBe("application/pdf");
  await teacherContext.close();
  await studentContext.close();
});
