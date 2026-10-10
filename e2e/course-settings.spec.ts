import { test, expect } from "@playwright/test";

test("ders ayarları, kod iptali, arşiv ve geri açma öğrencinin eski üyeliğini korur", async ({
  page,
  browser,
}) => {
  const headers = { origin: "http://127.0.0.1:3001" },
    suffix = Date.now();
  expect(
    (
      await page.request.post("/api/auth/login", {
        headers,
        data: { email: "akademisyen@pusula.local", password: "PusulaDemo2026!" },
      })
    ).ok(),
  ).toBe(true);
  const response = await page.request.post("/api/courses", {
    headers,
    data: { title: `Yönetim Dersi ${suffix}`, term: "Güz", code: "YON101" },
  });
  expect(response.ok()).toBe(true);
  const course = await response.json();
  const student = await browser.newContext();
  try {
    expect(
      (
        await student.request.post("/api/auth/login", {
          headers,
          data: { email: "ogrenci@pusula.local", password: "PusulaDemo2026!" },
        })
      ).ok(),
    ).toBe(true);
    expect(
      (
        await student.request.post("/api/courses/join", {
          headers,
          data: { code: course.invite_code },
        })
      ).ok(),
    ).toBe(true);
    await page.goto("/app?page=courses");
    await page.getByRole("button", { name: course.title, exact: true }).click();
    await page.getByRole("button", { name: "Ders ayarları", exact: true }).click();
    const dialog = page.getByRole("dialog");
    const title = `Düzenlenmiş Yönetim ${suffix}`;
    await dialog.getByLabel("Ders adı", { exact: true }).fill(title);
    await dialog
      .getByLabel("Açıklama", { exact: true })
      .fill("Öğrenci üyeliğini koruyan ders düzenlemesi.");
    await dialog.getByRole("button", { name: "Bilgileri kaydet", exact: true }).click();
    await expect(dialog.getByText("Ders bilgileri kaydedildi.", { exact: true })).toBeVisible();
    const policy = dialog.locator(".publication-policy");
    await policy.getByLabel("Yayın biçimi", { exact: true }).selectOption("automatic");
    await expect(policy.getByRole("button", { name: "Yayın tercihini kaydet" })).toBeDisabled();
    await policy.getByRole("checkbox").check();
    await policy.getByRole("button", { name: "Yayın tercihini kaydet" }).click();
    await expect(policy.getByText("Otomatik", { exact: true })).toBeVisible();
    await policy.getByLabel("Yayın biçimi", { exact: true }).selectOption("review");
    await policy.getByRole("button", { name: "Yayın tercihini kaydet" }).click();
    await expect(policy.getByText("Hoca onayı", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Kodu iptal et", exact: true }).click();
    await expect(dialog.getByText("Kapalı", { exact: true })).toBeVisible();
    expect(
      (
        await student.request.post("/api/courses/join", {
          headers,
          data: { code: course.invite_code },
        })
      ).ok(),
    ).toBe(false);
    await dialog.getByRole("button", { name: "Dersi arşivle", exact: true }).click();
    await dialog.getByRole("button", { name: "Onayla ve arşivle", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("button", { name: title, exact: true })).toBeHidden();
    expect(
      (await (await student.request.get("/api/courses")).json()).some(
        (c: { id: string }) => c.id === course.id,
      ),
    ).toBe(false);
    await page.getByRole("button", { name: "Arşiv", exact: true }).click();
    await expect(dialog.getByRole("heading", { name: title, exact: true })).toBeVisible();
    await dialog
      .locator(".activity-row")
      .filter({ hasText: title })
      .getByRole("button", { name: "Dersi geri aç", exact: true })
      .click();
    await expect(dialog.getByRole("heading", { name: title, exact: true })).toBeHidden();
    await dialog.getByRole("button", { name: "Kapat", exact: true }).click();
    await expect(page.getByRole("button", { name: title, exact: true })).toBeVisible();
    const restored = (await (await student.request.get("/api/courses")).json()).find(
      (c: { id: string }) => c.id === course.id,
    );
    expect(restored.title).toBe(title);
    expect(restored.invite_code).toBeNull();
  } finally {
    await student.close().catch(() => {});
  }
});
