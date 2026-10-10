import { test, expect, type BrowserContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { registerTeacher } from "./auth";
import { expectAccessible } from "./accessibility";

const headers = { origin: "http://127.0.0.1:3001" };
async function post(context: BrowserContext, route: string, data: unknown) {
  const response = await context.request.post(`/api/${route}`, { headers, data });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}
test("öğretmen masası teslimi açar, not defteri güncellenir ve filtreli CSV iner", async ({
  browser,
}) => {
  const teacher = await browser.newContext(),
    student = await browser.newContext();
  await registerTeacher(teacher);
  const course = await post(teacher, "courses", { title: "Öğretmen Defteri Testi", term: "Güz" });
  await post(student, "auth/signup", {
    email: `desk-${randomUUID()}@test.edu`,
    display_name: "Defter Öğrencisi",
    password: "TeacherTest2026!",
    role: "student",
  });
  await post(student, "courses/join", { code: course.invite_code });
  const assignment = await post(teacher, `courses/${course.id}/assignments`, {
    title: "Kaynak incelemesi",
    kind: "traditional",
    due_at: new Date(Date.now() + 86400000).toISOString(),
  });
  await post(teacher, `courses/${course.id}/assignments/${assignment.id}/publish`, {});
  await post(student, `courses/${course.id}/assignments/${assignment.id}/submit`, {
    request_key: randomUUID(),
    text: "Kaynakları karşılaştırdım.",
  });
  const page = await teacher.newPage();
  await page.goto("/app");
  await page.getByRole("button", { name: "Karanlık temaya geç", exact: true }).click();
  await page.locator(".desk-inbox-row").filter({ hasText: "Defter Öğrencisi" }).click();
  const dialog = page.getByRole("dialog", { name: "Kaynak incelemesi", exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Teslimleri göster").selectOption("submitted");
  await dialog.getByLabel("Defter Öğrencisi için geri bildirim").fill("Karşılaştırma tamamlandı.");
  await dialog.getByLabel("Not (0–100, isteğe bağlı)").fill("82");
  await expectAccessible(page, "teacher-dark-submission");
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/assignments/${assignment.id}`) &&
      response.request().method() === "GET",
  );
  await dialog.getByRole("button", { name: "Değerlendirmeyi kaydet", exact: true }).click();
  expect((await saved).ok()).toBe(true);
  await expect(dialog.getByText("Bu durumda bir teslim yok.", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("tab", { name: "Not defteri", exact: true }).click();
  await expect(page.getByRole("cell", { name: "82", exact: true })).toBeVisible();
  await page.getByLabel("Teslim durumu").selectOption("reviewed");
  await expectAccessible(page, "teacher-dark-gradebook-filled");
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV indir", exact: true }).click();
  const download = await downloadEvent;
  const csv = await readFile((await download.path())!, "utf8");
  expect(csv).toContain('"Defter Öğrencisi"');
  expect(csv).toContain('"82"');
  expect(csv).toContain('"Karşılaştırma tamamlandı."');
  await page.getByLabel("Not defterinde öğrenci ara").fill("Bulunmayan kişi");
  await expect(page.getByText("Bu filtrelere uyan kayıt yok.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "CSV indir", exact: true })).toBeDisabled();
  await page.reload();
  await expect(page.getByRole("tab", { name: "Not defteri", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.locator(".teacher-dashboard")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("tab", { name: "Sıralama", exact: true })).toHaveCount(0);
  expect(await page.locator("main").innerText()).not.toMatch(/\bXP\b|token|Haftalık lig/i);
  expect((await teacher.request.get(`/api/courses/${course.id}/ranking`)).status()).toBe(403);
  expect((await student.request.get(`/api/courses/${course.id}/gradebook`)).status()).toBe(403);
  await page.getByRole("button", { name: "Genel bakış", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Bekleyen iş yok.", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expectAccessible(page, "teacher-dark-mobile");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await teacher.close();
  await student.close();
});

test("ders içeriği konu ve durumla süzülür; sekme ve ders yenilemede korunur", async ({
  browser,
}) => {
  const context = await browser.newContext();
  await registerTeacher(context);
  const course = await post(context, "courses", { title: "İçerik defteri", term: "Güz" });
  const objective = await post(context, `courses/${course.id}/objectives`, {
    topic_title: "Hücre",
    title: "Zarın görevini açıklar",
    week: 1,
  });
  await post(context, `courses/${course.id}/activities`, {
    objective_id: objective.id,
    activity: {
      kind: "true_false",
      title: "Hücre zarı",
      instruction: "Seç",
      content: { statement: "Zar seçicidir." },
      answer_key: { value: true },
      explanation: "Zar seçici geçirgendir.",
    },
  });
  const page = await context.newPage();
  await page.goto(`/app?page=courses&course=${course.id}&tab=activities`);
  await expect(page.locator(".activity-row")).toHaveCount(1);
  await page.getByLabel("Yayın durumu", { exact: true }).selectOption("published");
  await expect(page.getByText("Bu filtrelere uyan etkinlik yok.")).toBeVisible();
  await page.getByRole("button", { name: "Temizle", exact: true }).click();
  await page.getByLabel("Etkinlik ara", { exact: true }).fill("HÜCRE");
  await page.getByLabel("Konu", { exact: true }).selectOption("Hücre");
  await expect(page.locator(".activity-row")).toHaveCount(1);
  await page.getByRole("tab", { name: "Müfredat", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("tab", { name: "Müfredat", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.locator(".course-selector .selected")).toHaveText("İçerik defteri");
  await page.getByRole("button", { name: "Karanlık temaya geç", exact: true }).click();
  await page.getByRole("button", { name: "Kazanım ekle", exact: true }).click();
  await expectAccessible(page, "teacher-dark-objective-dialog");
  await page.keyboard.press("Escape");
  await context.close();
});
