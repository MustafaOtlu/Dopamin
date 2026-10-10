import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
const output = path.resolve(".data/previews");
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
  });
  await page.goto("http://127.0.0.1:3000/login");
  await page.getByLabel("E-posta adresi").fill("ogrenci@pusula.local");
  await page.getByLabel("Şifre", { exact: true }).fill("PusulaDemo2026!");
  await page.getByRole("button", { name: "Giriş yap", exact: true }).click();
  await page.getByRole("heading", { name: "Merhaba, Ece." }).waitFor();
  await page.screenshot({
    path: path.join(output, "student-dashboard.png"),
    fullPage: true,
    animations: "disabled",
  });
  console.log(path.join(output, "student-dashboard.png"));
} finally {
  await browser.close();
}
