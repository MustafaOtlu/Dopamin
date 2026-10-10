import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
const base = "http://127.0.0.1:3000",
  output = path.resolve(".data/previews");
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const login = await context.request.post(`${base}/api/auth/login`, {
    headers: { origin: base },
    data: { email: "ogrenci@pusula.local", password: "PusulaDemo2026!" },
  });
  if (!login.ok()) throw new Error(await login.text());
  const page = await context.newPage();
  await page.goto(`${base}/app?page=profile`);
  await page.getByRole("heading", { name: "Şifre ve oturumlar", exact: true }).waitFor();
  await page.screenshot({
    path: path.join(output, "student-account-security-m6.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.locator(".account-security-panel .course-settings-section").last().screenshot({ path: path.join(output, "student-data-export-m6.png"), animations: "disabled" });
  console.log(path.join(output, "student-account-security-m6.png"));
} finally {
  await browser.close();
}
