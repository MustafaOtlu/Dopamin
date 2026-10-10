import { chromium } from "@playwright/test";
import { resolve } from "node:path";
const base = "http://127.0.0.1:3000",
  out = resolve(".data/previews");
const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    storageState: resolve(out, "dopamin-session.json"),
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const failures = [];
  page.on("pageerror", (e) => failures.push(e.message));
  await page.goto(`${base}/app`);
  await page.locator(".dp-topic-node").first().waitFor();
  await page.getByRole("combobox", { name: "Ders seç", exact: true }).click();
  await page.screenshot({ path: resolve(out, "dopamin-course-menu.png"), animations: "disabled" });
  await page.getByRole("combobox", { name: "Ders seç", exact: true }).press("Escape");
  await page.getByRole("button", { name: "Mağaza", exact: true }).click();
  await page.getByRole("button", { name: "Sonsuz uzay önizle" }).click();
  await page.screenshot({
    path: resolve(out, "dopamin-personal-preview.png"),
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Mağazaya dön", exact: true }).click();
  await page.getByRole("button", { name: "Avatarlar", exact: true }).click();
  await page.screenshot({
    path: resolve(out, "dopamin-penguin-wardrobe.png"),
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Maç", exact: true }).click();
  await page
    .getByLabel("Sınıf arkadaşın", { exact: true })
    .locator("option")
    .first()
    .waitFor({ state: "attached" });
  await page.screenshot({ path: resolve(out, "dopamin-classic.png"), animations: "disabled" });
  await page.getByRole("button", { name: /Seri.*Yan yanayken/ }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: resolve(out, "dopamin-rapid-mobile.png"), animations: "disabled" });
  console.log(JSON.stringify({ failures, out }));
} finally {
  await browser.close();
}
