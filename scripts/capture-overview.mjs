import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
const base = "http://127.0.0.1:3000",
  output = path.resolve(".data/previews");
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
try {
  for (const role of ["student", "teacher"]) {
    const context = await browser.newContext({
      viewport: role === "student" ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    });
    const login = await context.request.post(`${base}/api/auth/login`, {
      headers: { origin: base },
      data: {
        email: role === "teacher" ? "akademisyen@pusula.local" : "ogrenci@pusula.local",
        password: "PusulaDemo2026!",
      },
    });
    if (!login.ok()) throw new Error(await login.text());
    const page = await context.newPage();
    await page.goto(`${base}/app`);
    await page.getByRole("heading", { level: 1, name: /Merhaba,/ }).waitFor();
    await page.screenshot({
      path: path.join(output, `${role}-overview-current.png`),
      animations: "disabled",
      fullPage: role === "student",
    });
    console.log(path.join(output, `${role}-overview-current.png`));
    await context.close();
  }
} finally {
  await browser.close();
}
