import { spawn } from "node:child_process";
import path from "node:path";
try {
  process.loadEnvFile(path.resolve(".env.local"));
} catch (err) {
  if (err.code !== "ENOENT") throw err;
}
const file = process.argv[2];
if (!file) throw new Error("Script path required");
const child = spawn(process.execPath, ["--import", "tsx", file, ...process.argv.slice(3)], {
  env: process.env,
  stdio: "inherit",
  windowsHide: true,
});
child.on("error", (err) => {
  console.error(err.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
