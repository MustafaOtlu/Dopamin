import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { writeFile } from "node:fs/promises";
const browser = await chromium.launch(),
  base = "http://127.0.0.1:3000",
  findings = [];
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const response = await context.request.post(`${base}/api/auth/login`, {
    headers: { origin: base },
    data: { email: "ogrenci@pusula.local", password: "PusulaDemo2026!" },
  });
  if (!response.ok()) throw new Error(`Login ${response.status()}`);
  const page = await context.newPage();
  async function audit(name) {
    await page.waitForFunction(
      () =>
        !Array.from(document.querySelectorAll('[role="status"]')).some((e) =>
          e.textContent?.includes("Yükleniyor"),
        ),
    );
    const result = await new AxeBuilder({ page }).analyze();
    findings.push({
      name,
      overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      violations: result.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
      })),
    });
  }
  await page.goto(`${base}/app?page=tasks`);
  await page.getByRole("button", { name: "Haftalık", exact: true }).click();
  await page.getByRole("heading", { name: "Günlük serin", exact: true }).waitFor();
  await audit("tasks-weekly");
  await page.getByRole("button", { name: "Ödevler", exact: true }).click();
  await audit("tasks-assignments");
  await page.getByRole("button", { name: "Hatalarım", exact: true }).click();
  await audit("tasks-mistakes");
  await page.getByRole("button", { name: "Maç", exact: true }).click();
  await page.getByRole("button", { name: "Haftalık lig", exact: true }).click();
  await audit("league");
  await page.getByRole("button", { name: "Sınıf sıralaması", exact: true }).click();
  await audit("class-ranking");
  await page.getByRole("button", { name: "Profil", exact: true }).click();
  await page.getByRole("button", { name: "Sahip olduklarım", exact: true }).click();
  await page.getByRole("heading", { name: "Sahip olduklarım", exact: true }).waitFor();
  await audit("inventory");
  await page.getByRole("button", { name: "Geçmişim", exact: true }).click();
  await audit("history");
  await page.getByRole("button", { name: "Mağaza", exact: true }).click();
  await page.locator(".shop-card").first().waitFor();
  await page.getByRole("button", { name: "Temalar", exact: true }).click();
  await page
    .locator(".shop-card")
    .first()
    .getByRole("button", { name: /önizle/ })
    .click();
  await audit("shop-preview");
  await page.keyboard.press("Escape");
  console.log(
    JSON.stringify(
      findings.filter((f) => f.overflow || f.violations.length),
      null,
      2,
    ),
  );
  await writeFile(
    ".data/previews/dopamin-detail-accessibility.json",
    JSON.stringify(findings, null, 2),
  );
  console.log(
    await page
      .locator(".shop-card p")
      .first()
      .evaluate((e) => ({ font: getComputedStyle(e).fontFamily })),
  );
  const cdp = await context.newCDPSession(page);
  await cdp.send("DOM.enable");
  await cdp.send("CSS.enable");
  const { root } = await cdp.send("DOM.getDocument");
  const { nodeId } = await cdp.send("DOM.querySelector", {
    nodeId: root.nodeId,
    selector: ".shop-card p",
  });
  console.log(await cdp.send("CSS.getPlatformFontsForNode", { nodeId }));
} finally {
  await browser.close();
}
