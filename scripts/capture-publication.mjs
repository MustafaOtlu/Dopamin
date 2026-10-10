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
    data: { email: "akademisyen@pusula.local", password: "PusulaDemo2026!" },
  });
  if (!login.ok()) throw new Error(await login.text());
  const course = (await (await context.request.get(`${base}/api/courses`)).json()).find(
    (c) => c.code === "BIL101",
  );
  const page = await context.newPage();
  await page.goto(`${base}/app?page=courses`);
  await page.getByRole("button", { name: course.title, exact: true }).click();
  await page.getByRole("button", { name: "Ders ayarları", exact: true }).click();
  const policy = page.locator(".publication-policy");
  await policy.getByRole("heading", { name: "AI içeriklerinin yayını" }).waitFor();
  await policy.getByLabel("Yayın biçimi", { exact: true }).selectOption("automatic");
  await policy.screenshot({
    path: path.join(output, "teacher-publication-m2.png"),
    animations: "disabled",
  });
  console.log(path.join(output, "teacher-publication-m2.png"));
} finally {
  await browser.close();
}
