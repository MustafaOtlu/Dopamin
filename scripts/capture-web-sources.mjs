import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
const base = "http://127.0.0.1:3000",
  output = path.resolve(".data/previews");
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const login = await context.request.post(`${base}/api/auth/login`, {
    headers: { origin: base },
    data: { email: "akademisyen@pusula.local", password: "PusulaDemo2026!" },
  });
  if (!login.ok()) throw new Error(await login.text());
  const page = await context.newPage();
  await page.goto(`${base}/app?page=courses`);
  await page.getByRole("button", { name: "Programlamaya Giriş", exact: true }).click();
  console.log(await page.getByRole("tab").allTextContents());
  await page.getByRole("tab", { name: /Kaynak/ }).click();
  await page.getByRole("region", { name: "Kaynak izinleri" }).waitFor();
  if (process.argv.includes("--add-demo-source")) {
    const title = "MDN — Algoritma";
    if (
      (await page.getByLabel("Kaynak kapsamı", { exact: true }).inputValue()) !== "approved_web"
    ) {
      await page.getByLabel("Kaynak kapsamı", { exact: true }).selectOption("approved_web");
    }
    if (!(await page.getByRole("heading", { name: title, exact: true }).count())) {
      await page.getByRole("button", { name: "Web adresi ekle", exact: true }).click();
      await page.getByLabel("Kaynak adı", { exact: true }).fill(title);
      await page
        .getByLabel("Tam web adresi", { exact: true })
        .fill("https://developer.mozilla.org/en-US/docs/Glossary/Algorithm");
      await page
        .getByRole("dialog")
        .screenshot({ path: path.join(output, "teacher-web-add.png"), animations: "disabled" });
      await page.getByRole("button", { name: "İzin ver ve metni al", exact: true }).click();
    }
    await page
      .getByRole("button", { name: `${title} metnini incele`, exact: true })
      .waitFor({ timeout: 70000 });
    await page.getByRole("region", { name: "Kaynak izinleri" }).scrollIntoViewIfNeeded();
    await page.screenshot({
      path: path.join(output, "teacher-web-ready.png"),
      animations: "disabled",
    });
    await page.getByRole("button", { name: `${title} metnini incele`, exact: true }).click();
    await page.getByRole("link", { name: "Kaydedilmiş metni indir" }).waitFor();
    await page
      .getByRole("dialog")
      .screenshot({ path: path.join(output, "teacher-web-text.png"), animations: "disabled" });
    await page.getByRole("dialog").getByRole("button", { name: "Kapat", exact: true }).click();
  }
  await page.getByRole("region", { name: "Kaynak izinleri" }).scrollIntoViewIfNeeded();
  await page.screenshot({
    path: path.join(output, "teacher-web-sources.png"),
    animations: "disabled",
  });
  console.log(path.join(output, "teacher-web-sources.png"));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("region", { name: "Kaynak izinleri" }).scrollIntoViewIfNeeded();
  await page
    .getByRole("region", { name: "Kaynak izinleri" })
    .screenshot({ path: path.join(output, "teacher-web-mobile.png"), animations: "disabled" });
} finally {
  await browser.close();
}
