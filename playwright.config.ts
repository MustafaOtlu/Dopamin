import { defineConfig, devices } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
const localBrowsers = path.resolve(".data/playwright-browsers");
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync(localBrowsers))
  process.env.PLAYWRIGHT_BROWSERS_PATH = localBrowsers;
process.env.PUSULA_E2E_RUN_ID ||= randomUUID();
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:3001",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node scripts/e2e-server.mjs",
    url: "http://127.0.0.1:3001/login",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
