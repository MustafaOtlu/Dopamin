import { spawn } from "node:child_process";
import path from "node:path";
const env = {
  ...process.env,
  AUTH_PROVIDER: "local",
  AI_API_KEY: "",
  AI_MODEL: "",
  AI_PROVIDER: "",
  TEACHER_INVITE_CODE: `e2e-${process.env.PUSULA_E2E_RUN_ID || "manual"}`,
  DATABASE_URL: "",
  PGLITE_PATH: path.resolve(`.data/e2e-${process.env.PUSULA_E2E_RUN_ID || "manual"}/postgres`),
  STORAGE_PATH: path.resolve(`.data/e2e-${process.env.PUSULA_E2E_RUN_ID || "manual"}/files`),
  APP_ORIGIN: "http://127.0.0.1:3001",
  NEXT_DIST_DIR: ".next-e2e",
};
async function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { env, stdio: "inherit", windowsHide: true });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`Child exited: ${code}`)),
    );
  });
}
await run(["--import", "tsx", "scripts/seed.ts"]);
await run(["--import", "tsx", "scripts/e2e-queue-fixture.ts"]);
await run(["--import", "tsx", "scripts/e2e-web-fixture.ts"]);
await run(["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", "3001"]);
