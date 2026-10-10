import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
const base = "http://127.0.0.1:3000";
const out = path.resolve(".data/previews");
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
try {
  const statePath = path.join(out, "dopamin-session.json");
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    ...(existsSync(statePath) ? { storageState: statePath } : {}),
  });
  const session = await context.request.get(`${base}/api/bootstrap`);
  if (session.status() === 401) {
    const response = await context.request.post(`${base}/api/auth/login`, {
      headers: { origin: base },
      data: { email: "ogrenci@pusula.local", password: "PusulaDemo2026!" },
    });
    if (!response.ok()) throw new Error(`Login ${response.status()}`);
    await context.storageState({ path: statePath });
  } else if (!session.ok()) throw new Error(`Session ${session.status()}`);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${base}/app`);
  await page.getByRole("heading", { name: "Öğrenme yolun", exact: true }).waitFor();
  await page.locator(".dp-topic-node").first().waitFor();
  await page.screenshot({ path: path.join(out, "dopamin-desktop.png"), animations: "disabled" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(out, "dopamin-mobile.png"), animations: "disabled" });
  await page.locator(".dp-topic-node").first().click();
  await page.screenshot({ path: path.join(out, "dopamin-topic.png"), animations: "disabled" });
  await page.getByRole("button", { name: /Derse hazırlık/ }).click();
  await page.screenshot({
    path: path.join(out, "dopamin-preparation.png"),
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Derse hazırım" }).click();
  await page.getByRole("button", { name: "Mağaza", exact: true }).click();
  await page.getByRole("heading", { name: "Kendine bir renk kat", exact: true }).waitFor();
  await page.getByRole("button", { name: "Temalar", exact: true }).click();
  await page.locator(".shop-card").first().waitFor();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: path.join(out, "dopamin-shop.png"), animations: "disabled" });
  await page.getByRole("button", { name: "Profil", exact: true }).click();
  await page.getByRole("heading", { name: "Günlük serin", exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(out, "dopamin-profile.png"), animations: "disabled" });
  const rosterLoaded = page.waitForResponse(
    (r) => r.url().includes("/challenge-roster") && r.status() === 200,
  );
  await page.getByRole("button", { name: "Maç", exact: true }).click();
  await rosterLoaded;
  await page
    .getByLabel("Sınıf arkadaşın", { exact: true })
    .locator('option[value]:not([value=""])')
    .first()
    .waitFor({ state: "attached" });
  await page.getByRole("button", { name: /Klasik.*Sen şimdi oyna/ }).waitFor();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: path.join(out, "dopamin-matches.png"), animations: "disabled" });
  console.log(JSON.stringify({ errors, output: out }));
} finally {
  await browser.close();
}
