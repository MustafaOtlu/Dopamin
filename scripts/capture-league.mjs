import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
const base = "http://127.0.0.1:3000",
  headers = { origin: base },
  browser = await chromium.launch();
try {
  const ctx = await browser.newContext(),
    friend = await browser.newContext();
  for (const [context, email] of [
    [ctx, "ogrenci@pusula.local"],
    [friend, "arda@pusula.local"],
  ]) {
    const r = await context.request.post(`${base}/api/auth/login`, {
      headers,
      data: { email, password: "PusulaDemo2026!" },
    });
    if (!r.ok()) throw new Error(await r.text());
  }
  const other = await friend.request.post(`${base}/api/league/join`, {
    headers,
    data: { consent: true },
  });
  if (!other.ok()) throw new Error(await other.text());
  const page = await ctx.newPage();
  await page.goto(`${base}/app?page=league`);
  await page.getByRole("heading", { name: "Haftalık lig." }).waitFor();
  const data = await (await ctx.request.get(`${base}/api/league`)).json();
  if (!data.membership) {
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Bu haftanın ligine katıl", exact: true }).click();
  }
  await page.locator(".your-rank").waitFor();
  const out = path.resolve(".data/previews");
  await mkdir(out, { recursive: true });
  await page.screenshot({
    path: path.join(out, "student-league-m5.png"),
    fullPage: true,
    animations: "disabled",
  });
  console.log(out);
} finally {
  await browser.close();
}
