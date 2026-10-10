import { test, expect } from "@playwright/test";

test("şifre değiştirme mevcut şifreyi doğrular, diğer oturumları kapatır ve yeni şifreyle giriş çalışır", async ({
  page,
  browser,
}) => {
  const headers = { origin: "http://127.0.0.1:3001" },
    email = `security-${Date.now()}@pusula.local`,
    password = "InitialStudy2026!",
    next = "ChangedStudy2026!";
  expect(
    (
      await page.request.post("/api/auth/signup", {
        headers,
        data: { email, password, role: "student", display_name: "Güvenlik Öğrencisi" },
      })
    ).ok(),
  ).toBe(true);
  const other = await browser.newContext();
  try {
    expect(
      (await other.request.post("/api/auth/login", { headers, data: { email, password } })).ok(),
    ).toBe(true);
    await page.goto("/app?page=profile");
    await page.getByLabel("Mevcut şifre", { exact: true }).fill("WrongPassword2026!");
    await page.getByLabel("Yeni şifre", { exact: true }).fill(next);
    await page.getByLabel("Yeni şifreyi doğrula", { exact: true }).fill(next);
    await page.getByRole("button", { name: "Şifremi değiştir", exact: true }).click();
    await expect(page.locator(".account-security-panel").getByRole("alert")).toContainText(
      "Mevcut şifre hatalı",
    );
    expect((await other.request.get("/api/bootstrap")).status()).toBe(200);
    await page.getByLabel("Mevcut şifre", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Şifremi değiştir", exact: true }).click();
    await expect(page.locator(".account-security-panel").getByRole("status")).toContainText(
      "Şifren değiştirildi",
    );
    expect((await page.request.get("/api/bootstrap")).status()).toBe(200);
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("link", { name: "Verilerimi indir", exact: true }).click();
    expect((await downloadPromise).suggestedFilename()).toMatch(/^pusula-verilerim-.*\.json$/);
    const exportResponse = await page.request.get("/api/account/export?user_id=someone-else");
    expect(exportResponse.status()).toBe(200);
    expect(exportResponse.headers()["cache-control"]).toContain("no-store");
    const exported = await exportResponse.json();
    expect(exported.profile.email).toBe(email);
    expect(exported.attempts).toEqual([]);
    expect(JSON.stringify(exported)).not.toContain("password_hash");
    expect((await other.request.get("/api/bootstrap")).status()).toBe(401);
    expect(
      (
        await other.request.post("/api/auth/login", { headers, data: { email, password } })
      ).status(),
    ).toBe(401);
    expect(
      (
        await other.request.post("/api/auth/login", { headers, data: { email, password: next } })
      ).status(),
    ).toBe(200);
    await page.getByRole("button", { name: "Diğer cihazlardan çık", exact: true }).click();
    await expect(page.locator(".account-security-panel").getByRole("status")).toContainText(
      "Diğer cihazlar",
    );
    expect((await other.request.get("/api/bootstrap")).status()).toBe(401);
    expect((await page.request.get("/api/bootstrap")).status()).toBe(200);
    await page.goto("/forgot-password");
    await expect(page.getByText(/e-posta ile kurtarma henüz bağlı değil/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Kurtarma bağlantısı gönder", exact: true }),
    ).toBeDisabled();
  } finally {
    await other.close().catch(() => {});
  }
});
