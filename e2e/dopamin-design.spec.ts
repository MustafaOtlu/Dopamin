import { test, expect } from "@playwright/test";
import { loginDemo } from "./auth";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";

test("ders seçimi korunur, penguen tepki verir ve kişisel önizleme bakiyeyi değiştirmez", async ({
  browser,
}) => {
  const teacher = await browser.newContext(),
    student = await browser.newContext({ hasTouch: true });
  const headers = { origin: "http://127.0.0.1:3001" };
  async function post(ctx: typeof student, path: string, data: unknown) {
    const r = await ctx.request.post(`/api/${path}`, { headers, data });
    expect(r.ok(), await r.text()).toBe(true);
    return r.json();
  }
  await loginDemo(teacher);
  const courses = [];
  for (const [title, topic] of [
    ["Programlamaya giriş", "Algoritma"],
    ["Biyoloji", "Hücre"],
  ]) {
    const c = await post(teacher, "courses", { title, term: "Güz" });
    const o = await post(teacher, `courses/${c.id}/objectives`, {
      topic_title: topic,
      title: `${topic} kavramı`,
      week: 1,
    });
    const a = await post(teacher, `courses/${c.id}/activities`, {
      objective_id: o.id,
      activity: {
        kind: "true_false",
        title: `${topic} sorusu`,
        instruction: "Seç",
        content: { statement: "Bu önerme doğrudur." },
        answer_key: { value: true },
        explanation: "Doğru seçeneği pekiştir.",
      },
    });
    await post(teacher, `courses/${c.id}/activities/${a.activity_id}/publish`, {});
    courses.push(c);
  }
  await post(student, "auth/signup", {
    email: `design-${Date.now()}@test.edu`,
    display_name: "Ada Tasarım",
    role: "student",
    password: "TestPassword2026!",
  });
  for (const c of courses) await post(student, "courses/join", { code: c.invite_code });
  const page = await student.newPage();
  await page.goto(`/app?course=${courses[0].id}`);
  const chooser = page.getByRole("combobox", { name: "Ders seç", exact: true });
  await expect(chooser).toContainText("Programlamaya giriş");
  await chooser.click();
  await expect(page.getByRole("listbox")).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  // Same-selection must not clear the topic list indefinitely.
  await page.getByRole("option").filter({ hasText: "Programlamaya giriş" }).click();
  await expect(page.getByRole("button", { name: "Algoritma konusunu aç" })).toBeVisible();
  await chooser.press("Enter");
  await chooser.press("Home");
  await chooser.press("Enter");
  await expect(chooser).toContainText("Biyoloji");
  await page.reload();
  await expect(chooser).toContainText("Biyoloji");
  await page.getByRole("button", { name: "Hücre konusunu aç" }).click();
  await page.getByRole("button", { name: /^Tekrar/ }).click();
  await page.getByRole("button", { name: "Yanlış", exact: true }).click();
  await page.getByRole("button", { name: "Cevabımı kontrol et" }).click();
  await expect(page.locator(".dp-answer-reaction .penguin-sad")).toBeVisible();
  await expect(page.locator(".dp-answer-reaction .penguin-sad")).toBeInViewport();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await mkdir(".data/previews", { recursive: true });
  await page.screenshot({ path: ".data/previews/dopamin-incorrect.png", animations: "disabled" });
  await page.locator(".dp-answer-reaction .penguin-friend").click();
  await expect(page.locator(".dp-answer-reaction .penguin-sad")).toBeVisible();
  await page.getByRole("button", { name: "Devam et", exact: true }).click();
  await page.getByRole("button", { name: "Doğru", exact: true }).click();
  await page.getByRole("button", { name: "Cevabımı kontrol et" }).click();
  await expect(page.locator(".dp-answer-reaction .penguin-clap")).toBeVisible();
  await expect(page.locator(".dp-answer-reaction .penguin-clap")).toBeInViewport();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: ".data/previews/dopamin-correct.png", animations: "disabled" });
  expect(
    await page
      .locator(".penguin-clap .penguin-wing-left")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("penguin-clap-left");
  await page.getByRole("button", { name: "Sonucumu gör", exact: true }).click();
  await expect(page.locator(".penguin-celebrate")).toBeVisible();
  await page.getByRole("link", { name: "Öğrenme alanına dön" }).click();
  await expect(chooser).toContainText("Biyoloji");
  await page.getByRole("button", { name: "Hücre konusunu aç" }).click();
  await page.getByRole("button", { name: /^Tekrar/ }).click();
  await page.getByRole("button", { name: "Çalışmaya ara ver ve ana sayfaya dön" }).click();
  await expect(page.locator(".penguin-cry")).toBeVisible();
  await page.getByRole("button", { name: "Dersi terk et", exact: true }).click();
  await expect(chooser).toContainText("Biyoloji");
  await page.setViewportSize({ width: 390, height: 844 });
  await chooser.tap();
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.getByRole("option").filter({ hasText: "Biyoloji" }).tap();
  await expect(chooser).toContainText("Biyoloji");
  await chooser.click();
  await chooser.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(chooser).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Mağaza", exact: true }).click();
  const before = await (await student.request.get("/api/rewards")).json();
  await page.getByRole("button", { name: "Sonsuz uzay önizle" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Ada Tasarım" })).toBeVisible();
  await expect(dialog.locator(".dp-personal-preview")).toHaveAttribute("data-theme", "cosmos");
  await expect(dialog.locator(".dp-profile-avatar svg")).toHaveAttribute(
    "aria-label",
    "Dopamin pengueni",
  );
  expect(
    await dialog
      .locator(".dp-personal-preview")
      .evaluate((el) => getComputedStyle(el).backgroundRepeat),
  ).toBe("no-repeat");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await dialog.getByRole("button", { name: "Mağazaya dön" }).click();
  expect((await (await student.request.get("/api/rewards")).json()).wallet).toEqual(before.wallet);
  await page.getByRole("button", { name: "Öğren", exact: true }).click();
  await expect(chooser).toContainText("Biyoloji");
  await page
    .locator(".dp-path-mascot svg")
    .evaluate((el) => el.setAttribute("data-before-tap", "true"));
  await page.locator(".dp-path-mascot .penguin-friend").tap();
  await expect(page.locator(".dp-path-mascot [data-before-tap]")).toHaveCount(0);
  await expect(page.locator(".dp-path-mascot .penguin-wave")).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await page
      .locator(".dp-path-mascot .penguin-wing-right")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
  expect(await page.locator("body").innerText()).not.toMatch(/\p{Extended_Pictographic}/u);
  await teacher.close();
  await student.close();
});
