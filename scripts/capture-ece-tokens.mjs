import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const base = "http://127.0.0.1:3000";
const output = path.resolve(".data/previews");
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const login = await context.request.post(`${base}/api/auth/login`, {
    headers: { origin: base },
    data: { email: "ogrenci@pusula.local", password: "PusulaDemo2026!" },
  });
  if (!login.ok()) throw new Error(`Demo login failed: ${login.status()}`);
  const response = await context.request.get(`${base}/api/rewards`);
  if (!response.ok()) throw new Error(`Rewards request failed: ${response.status()}`);
  const rewards = await response.json();
  const grant = rewards.transactions.find((item) => item.reason === "manual_test_credit" && item.amount === 200);
  console.log(JSON.stringify({tokens: rewards.wallet.tokens, grant: !!grant, tokenTransactions: rewards.transactions.filter((item) => item.kind === "token").map((item) => ({reason: item.reason, amount: item.amount}))}));
  if (!grant) throw new Error("The 200-token grant is not visible in the ledger.");
  const page = await context.newPage();
  await page.goto(`${base}/app?page=rewards`);
  await page.getByRole("heading", { level: 1, name: /Ödüller ve mağaza/ }).waitFor();
  await page.locator(".reward-transactions").getByText("Deneme için eklenen token").waitFor();
  await page.locator(".reward-wallet").screenshot({ path: path.join(output, "ece-200-token-wallet.png"), animations: "disabled" });
  await page.locator(".reward-transactions").screenshot({ path: path.join(output, "ece-200-token-history.png"), animations: "disabled" });
  console.log(JSON.stringify({ tokens: rewards.wallet.tokens, image: path.join(output, "ece-200-token-wallet.png") }));
} finally {
  await browser.close();
}
