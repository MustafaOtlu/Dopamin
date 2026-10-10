import { test, expect } from "@playwright/test";
import { loginDemo } from "./auth";
import { academicPdf, scannedAcademicPdf } from "../src/tests/fixtures";

test("taranmış PDF okunur, kaynak sürümü yenilenir, önceki sürüm incelenir ve kaldırma erişimi kapatır", async ({
  page,
}) => {
  const headers = { origin: "http://127.0.0.1:3001" };
  await loginDemo(page.context());
  const response = await page.request.post("/api/courses", {
    headers,
    data: { title: `Kaynak Sürümleri ${Date.now()}`, term: "Güz" },
  });
  expect(response.ok()).toBe(true);
  const course = await response.json();
  await page.goto("/app?page=courses");
  await page.getByRole("button", { name: course.title, exact: true }).click();
  await page.getByRole("tab", { name: "Kaynaklar ve AI", exact: true }).click();
  await page
    .getByLabel("PDF kaynağı seç")
    .setInputFiles({
      name: "Taranmış not.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(scannedAcademicPdf()),
    });
  await expect(page.getByText("OCR · İncele", { exact: true })).toBeVisible({ timeout: 40000 });
  await page.getByRole("button", { name: "Taranmış not.pdf metnini incele", exact: true }).click();
  await expect(page.locator(".document-text")).toContainText("finite sequence");
  await page.getByRole("dialog").getByRole("button", { name: "Kapat", exact: true }).click();
  await page
    .getByRole("button", { name: "Taranmış not.pdf yeni sürüm yükle", exact: true })
    .click();
  await page
    .getByLabel("PDF kaynağı seç")
    .setInputFiles({
      name: "Güncel not.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(
        academicPdf([
          "Algorithms - New Edition",
          "A finite algorithm transforms input into output.",
        ]),
      ),
    });
  await expect(page.getByText("Hazır", { exact: true })).toBeVisible({ timeout: 30000 });
  await page.getByRole("button", { name: "Güncel not.pdf metnini incele", exact: true }).click();
  await expect(page.getByLabel("Kaynak sürümü")).toHaveValue(/./);
  await expect(page.locator(".document-text")).toContainText("transforms input");
  const old = await page
    .getByLabel("Kaynak sürümü")
    .locator("option")
    .filter({ hasText: "Sürüm 1" })
    .getAttribute("value");
  await page.getByLabel("Kaynak sürümü").selectOption(old!);
  await expect(page.locator(".document-text")).toContainText("finite sequence");
  await expect(page.getByRole("button", { name: "Öğrencilere aç", exact: true })).toBeHidden();
  await page.getByRole("dialog").getByRole("button", { name: "Kapat", exact: true }).click();
  const documents = await (await page.request.get(`/api/courses/${course.id}/documents`)).json();
  expect(documents).toHaveLength(1);
  await page.getByRole("button", { name: "Güncel not.pdf kaldır", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("30 günlük saklama");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Kaynağı kaldır", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Kaynaklarını ekle" })).toBeVisible();
  expect((await page.request.get(`/api/files/${documents[0].file_id}`)).status()).toBe(404);
});
