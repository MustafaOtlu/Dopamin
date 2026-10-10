import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { writeFile } from "node:fs/promises";
const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    storageState: ".data/previews/dopamin-session.json",
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage(),
    findings = [];
  await page.goto("http://127.0.0.1:3000/app?page=shop");
  const response = await context.request.get("http://127.0.0.1:3000/api/rewards");
  if (!response.ok()) throw new Error(`Session ${response.status()}`);
  const data = await response.json();
  for (const product of data.products) {
    await page.getByRole("button", { name: `${product.title} önizle`, exact: true }).click();
    const result = await new AxeBuilder({ page }).include("dialog[open]").analyze();
    const overflow = await page
      .getByRole("dialog")
      .evaluate((el) => el.scrollWidth > el.clientWidth);
    findings.push({
      id: product.id,
      overflow,
      violations: result.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
      })),
    });
    await page.getByRole("button", { name: "Mağazaya dön", exact: true }).click();
  }
  await writeFile(".data/previews/dopamin-preview-audit.json", JSON.stringify(findings, null, 2));
  console.log(
    JSON.stringify(
      {
        checked: findings.length,
        issues: findings.filter((f) => f.overflow || f.violations.length),
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
