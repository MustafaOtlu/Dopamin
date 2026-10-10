import { test, expect } from "@playwright/test";
import { expectAccessible } from "./accessibility";
test("web kaynağı inceleme, paylaşma, izin iptali ve eski sürümün kapalı kalması", async ({
  page,
  browser,
}) => {
  const headers = { origin: "http://127.0.0.1:3001" };
  expect(
    (
      await page.request.post("/api/auth/login", {
        headers,
        data: { email: "web-e2e@pusula.local", password: "PusulaDemo2026!" },
      })
    ).ok(),
  ).toBe(true);
  const course = (await (await page.request.get("/api/courses")).json())[0];
  const doc = (await (await page.request.get(`/api/courses/${course.id}/documents`)).json())[0];
  const student = await browser.newContext();
  try {
    expect(
      (
        await student.request.post("/api/auth/login", {
          headers,
          data: { email: "web-student-e2e@pusula.local", password: "PusulaDemo2026!" },
        })
      ).ok(),
    ).toBe(true);
    expect((await student.request.get(`/api/courses/${course.id}/web-sources`)).ok()).toBe(false);
    expect((await student.request.get(`/api/files/${doc.file_id}`)).status()).toBe(404);
    await page.goto("/app?page=courses");
    await page.getByRole("button", { name: course.title, exact: true }).click();
    await page.getByRole("tab", { name: "Kaynaklar ve AI", exact: true }).click();
    await expect(page.getByText("Kayıtlı metin kullanıma hazır", { exact: true })).toBeVisible();
    await expectAccessible(page, "web-source-ready");
    await page.getByRole("button", { name: "Web adresi ekle", exact: true }).click();
    await expectAccessible(page, "web-permission-dialog");
    await page.getByLabel("Kaynak adı", { exact: true }).fill("Yerel hedef denemesi");
    await page.getByLabel("Tam web adresi", { exact: true }).fill("https://127.0.0.1/private");
    await page.getByRole("button", { name: "İzin ver ve metni al", exact: true }).click();
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
      "herkese açık alan adları",
    );
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: `${doc.title} metnini incele`, exact: true }).click();
    await expect(page.locator(".document-text")).toContainText(
      "Algoritma sonlu ve açık adımlardan oluşur.",
    );
    await expect(page.locator(".document-text")).toContainText("BÖLÜM 1");
    const download = await page.request.get(`/api/files/${doc.file_id}`);
    expect(download.headers()["content-type"]).toContain("text/plain");
    expect(await download.text()).toContain("Algoritma sonlu");
    await page.getByRole("button", { name: "Öğrencilere aç", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Öğrenci erişimini kapat", exact: true }),
    ).toBeVisible();
    expect((await student.request.get(`/api/files/${doc.file_id}`)).ok()).toBe(true);
    await expectAccessible(page, "web-source-text");
    await page.keyboard.press("Escape");
    await page.getByRole("checkbox", { name: `${doc.title} kaynağını seç`, exact: true }).check();
    await page.getByRole("button", { name: `${doc.title} iznini kapat`, exact: true }).click();
    const checkbox = page.getByRole("checkbox", {
      name: `${doc.title} kaynağını seç`,
      exact: true,
    });
    await expect(checkbox).toBeDisabled();
    await expect(checkbox).not.toBeChecked();
    expect((await student.request.get(`/api/files/${doc.file_id}`)).status()).toBe(404);
    await page.getByRole("button", { name: `${doc.title} iznini aç`, exact: true }).click();
    await expect(
      page.getByText("Güncel izinle okunması bekleniyor", { exact: true }),
    ).toBeVisible();
    await expect(checkbox).toBeDisabled();
    await page.getByRole("button", { name: `${doc.title} metnini incele`, exact: true }).click();
    await expect(page.getByRole("button", { name: "Öğrencilere aç", exact: true })).toBeDisabled();
    await page.keyboard.press("Escape");
    await page.getByLabel("Kaynak kapsamı", { exact: true }).selectOption("documents_only");
    await expect(page.getByRole("button", { name: "Web adresi ekle", exact: true })).toBeDisabled();
    await page.reload();
    await page.getByRole("tab", { name: "Kaynaklar ve AI", exact: true }).click();
    await expect(page.getByLabel("Kaynak kapsamı", { exact: true })).toHaveValue("documents_only");
    await page.setViewportSize({ width: 390, height: 844 });
    await expectAccessible(page, "web-sources-mobile");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  } finally {
    await student.close();
  }
});
