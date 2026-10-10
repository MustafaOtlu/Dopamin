import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createCanvas } from "@napi-rs/canvas";
import { loginDemo } from "./auth";
import { expectAccessible } from "./accessibility";
const headers = { origin: "http://127.0.0.1:3001" };
async function fits(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(
    true,
  );
  await expect(page.getByRole("button", { name: "Cevabımı kontrol et" })).toBeInViewport({
    ratio: 1,
  });
}
test("matching tiles, mouse and touch reordering fit the screen; exit can be cancelled", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 794, height: 719 },
    hasTouch: true,
  });
  await loginDemo(context, "student");
  const data = await (await context.request.get("/api/bootstrap")).json();
  const course = data.courses.find((c: { code: string }) => c.code === "BIL101");
  const objectives = await (
    await context.request.get("/api/courses/" + course.id + "/objectives")
  ).json();
  const session = await (
    await context.request.post("/api/sessions", {
      headers,
      data: {
        course_id: course.id,
        topic_id: objectives.find((o: { week: number }) => o.week === 1).topic_id,
      },
    })
  ).json();
  expect(session.items).toHaveLength(5);
  const page = await context.newPage();
  await page.goto("/learn/" + session.id);
  await page.getByRole("button", { name: "Doğru", exact: true }).click();
  await page.getByRole("button", { name: "Cevabımı kontrol et" }).click();
  await page.getByRole("button", { name: "Devam et", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Kavramları eşleştir", exact: true })).toHaveCount(
    1,
  );
  await expect(page.locator(".activity-type")).toHaveCount(0);
  await expect(page.locator(".tile-matching select")).toHaveCount(0);
  await fits(page);
  for (const [left, right] of [
    ["Değişken", "Bir değeri saklayan ad"],
    ["Döngü", "Tekrarlayan işlem"],
    ["Koşul", "Karara göre dallanma"],
  ]) {
    await page.getByRole("button", { name: left, exact: true }).click();
    await page.getByRole("button", { name: right, exact: true }).click();
  }
  await expect(page.locator(".match-tile.is-paired")).toHaveCount(6);
  await expectAccessible(page, "tile-matching");
  await page.getByRole("button", { name: "Cevabımı kontrol et" }).click();
  await expect(page.getByText("Güzel, doğru cevap!", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Devam et", exact: true }).click();
  await fits(page);
  const before = await page.locator(".sortable-steps li").allTextContents();
  const start = page.getByRole("button", { name: /^Başla,/ });
  const from = (await start.boundingBox())!;
  const target = (await page.locator(".sortable-steps li").first().boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 18 });
  await page.mouse.up();
  await expect(page.locator(".sortable-steps li").first()).toContainText("Başla");
  expect(await page.locator(".sortable-steps li").allTextContents()).not.toEqual(before);
  await page.reload();
  await page.setViewportSize({ width: 390, height: 667 });
  await start.waitFor();
  await fits(page);
  const touch = await context.newCDPSession(page);
  const tfrom = (await start.boundingBox())!,
    tto = (await page.locator(".sortable-steps li").first().boundingBox())!;
  const x = tfrom.x + tfrom.width / 2,
    y = tfrom.y + tfrom.height / 2,
    end = tto.y + tto.height / 2;
  await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  for (let n = 1; n <= 15; n++)
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y: y + ((end - y) * n) / 15 }],
    });
  await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(page.locator(".sortable-steps li").first()).toContainText("Başla");
  await fits(page);
  await page.evaluate(() => window.history.back());
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page).toHaveURL(new RegExp("/learn/" + session.id));
  await page.getByRole("button", { name: "Derse devam et", exact: true }).click();
  await page.getByRole("button", { name: "Çalışmaya ara ver ve ana sayfaya dön" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator(".penguin-cry")).toBeVisible();
  await page.getByRole("button", { name: "Derse devam et", exact: true }).click();
  await expect(page).toHaveURL(new RegExp("/learn/" + session.id));
  await page.getByRole("button", { name: "Çalışmaya ara ver ve ana sayfaya dön" }).click();
  await page.getByRole("button", { name: "Dersi terk et", exact: true }).click();
  await expect(page).toHaveURL(new RegExp("course=" + course.id));
  await page.locator(".dp-topic-node").first().click();
  await expect(page.locator(".dp-choice").first()).toContainText("Derse hazırlık");
  await page.getByRole("button", { name: /Derse hazırlık/ }).click();
  await expect(page.locator(".dp-prep-fact")).toContainText("açık ve sıralı");
  for (let n = 0; n < 3; n++) await page.getByRole("button", { name: "Sonraki bilgi" }).click();
  await page.getByRole("button", { name: "Derse hazırım" }).click();
  await context.close();
});
test("free uploaded profile photos follow privacy and appear in the store preview; outfits replace avatars", async ({
  browser,
}) => {
  const context = await browser.newContext(),
    other = await browser.newContext(),
    teacher = await browser.newContext();
  await loginDemo(teacher);
  async function signup(c: typeof context) {
    const r = await c.request.post("/api/auth/signup", {
      headers,
      data: {
        email: "photo-" + randomUUID() + "@test.edu",
        display_name: "Fotoğraf Öğrencisi",
        password: "PhotoTest2026!",
        role: "student",
      },
    });
    expect(r.ok()).toBe(true);
    return (await r.json()).user;
  }
  const user = await signup(context);
  await signup(other);
  const page = await context.newPage();
  await page.goto("/app?page=profile");
  const png = createCanvas(40, 40).toBuffer("image/png");
  await page
    .getByLabel("Profil fotoğrafı yükle")
    .setInputFiles({ name: "ben.png", mimeType: "image/png", buffer: png });
  await expect(page.getByText("Fotoğrafın güncellendi.", { exact: true })).toBeVisible();
  const rewards = await (await context.request.get("/api/rewards")).json();
  expect(rewards.wallet.tokens).toBe(0);
  expect(rewards.products.every((p: { kind: string }) => p.kind !== "avatar")).toBe(true);
  expect(rewards.products.some((p: { kind: string }) => p.kind === "outfit")).toBe(true);
  const url = rewards.wallet.photo_url;
  expect((await context.request.get(url)).status()).toBe(200);
  expect((await teacher.request.get(url)).status()).toBe(403);
  await context.request.post("/api/profile", {
    headers,
    data: { display_name: user.display_name, university: "", public_profile: false },
  });
  expect((await other.request.get(url)).status()).toBe(404);
  await context.request.post("/api/profile", {
    headers,
    data: { display_name: user.display_name, university: "", public_profile: true },
  });
  expect((await other.request.get(url)).status()).toBe(200);
  await page.getByRole("button", { name: "Mağaza", exact: true }).click();
  await page.getByRole("button", { name: "Buz parıltısı önizle" }).click();
  await expect(page.getByRole("dialog").locator(".dp-profile-photo")).toHaveAttribute("src", url);
  await expect(page.getByRole("dialog").locator(".dp-profile-companion svg")).toBeVisible();
  await expectAccessible(page, "photo-preview");
  await page.getByRole("button", { name: "Mağazaya dön", exact: true }).click();
  await expect(page.getByRole("button", { name: "Kıyafetler", exact: true })).toBeVisible();
  await context.close();
  await other.close();
  await teacher.close();
});
