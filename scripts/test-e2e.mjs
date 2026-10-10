import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { realpath, rm } from "node:fs/promises";
import path from "node:path";

const root = await realpath(process.cwd());
const runId = randomUUID();
const testData = path.resolve(root, ".data", `e2e-${runId}`);
const child = spawn(
  process.execPath,
  [path.resolve("node_modules/@playwright/test/cli.js"), "test", ...process.argv.slice(2)],
  {
    stdio: "inherit",
    windowsHide: true,
    env: { ...process.env, PUSULA_E2E_RUN_ID: runId },
  },
);
const code = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("exit", (code) => resolve(code ?? 1));
});
// Playwright has stopped its web server before its CLI exits. Failed runs remain inspectable.
if (code === 0) {
  const resolved = await realpath(testData).catch(() => null);
  const expected = path.join(root, ".data") + path.sep;
  if (resolved && resolved.startsWith(expected) && path.basename(resolved) === `e2e-${runId}`) {
    await rm(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    console.log("Test verileri temizlendi; raporlar korundu.");
  } else if (resolved) throw new Error("Test data resolved outside its expected workspace path.");
}
process.exitCode = code;
