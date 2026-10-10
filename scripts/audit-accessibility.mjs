import { chromium } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const base = process.env.AUDIT_ORIGIN || "http://127.0.0.1:3000";
const output = path.resolve(".data/accessibility");
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const reports = [];
async function scan(page, name) {
  const result = await new AxeBuilder({ page }).analyze();
  const report = { name, violations: result.violations, incomplete: result.incomplete };
  reports.push(report);
  console.log(
    name,
    JSON.stringify(
      result.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
      })),
    ),
  );
}
try {
  const guest = await browser.newContext();
  const login = await guest.newPage();
  for (const route of ["login", "register", "forgot-password"]) {
    await login.goto(`${base}/${route}`);
    await login.locator("form").waitFor();
    await scan(login, route);
  }
  await guest.close();
  for (const role of ["teacher", "student"]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const response = await context.request.post(`${base}/api/auth/login`, {
      headers: { origin: base },
      data: {
        email: role === "teacher" ? "akademisyen@pusula.local" : "ogrenci@pusula.local",
        password: "PusulaDemo2026!",
      },
    });
    if (!response.ok()) throw new Error(await response.text());
    const page = await context.newPage();
    for (const route of role === "teacher"
      ? ["home", "profile", "courses"]
      : ["home", "profile", "rewards", "league", "challenges", "history", "mistakes", "courses"]) {
      await page.goto(`${base}/app?page=${route}`);
      await page.locator(".page-content").waitFor();
      await page.getByRole("heading", { level: 1 }).waitFor();
      await scan(page, `${role}-${route}`);
      if (route === "home") {
        await page
          .getByRole("button", {
            name: role === "teacher" ? "Yeni ders" : "Sınıfa katıl",
            exact: true,
          })
          .click();
        await scan(page, `${role}-modal`);
        await page.getByRole("button", { name: "Kapat", exact: true }).click();
      }
    }
    await page.getByRole("button", { name: "Programlamaya Giriş", exact: true }).click();
    const tabs = await page.getByRole("tab").allTextContents();
    for (const name of tabs) {
      await page.getByRole("tab", { name, exact: true }).click();
      await scan(page, `${role}-course-${name}`);
    }
    if (role === "student") {
      await page.getByRole("tab", { name: "Öğrenme yolu", exact: true }).click();
      await page
        .getByRole("button", { name: "Bu konuda eksiğim var", exact: true })
        .first()
        .click();
      await page.locator(".support-objective").waitFor();
      await scan(page, "student-support");
    }
    await context.close();
  }
} finally {
  await writeFile(path.join(output, "audit.json"), JSON.stringify(reports, null, 2));
  await browser.close();
}
