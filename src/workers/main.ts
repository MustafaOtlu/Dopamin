import { createDatabase, migrate } from "../lib/db";
import { runNextJob } from "./runner";
import { closeExpiredLeagues } from "./maintenance";
if (!process.env.DATABASE_URL)
  throw new Error(
    "Bağımsız worker DATABASE_URL gerektirir. Yerel PGlite kuyruğu web sürecinde çalışır.",
  );
const db = await createDatabase();
await migrate(db);
let running = true;
let nextMaintenance = 0;
process.on("SIGINT", () => {
  running = false;
});
process.on("SIGTERM", () => {
  running = false;
});
while (running) {
  if (Date.now() >= nextMaintenance) {
    try {
      await closeExpiredLeagues(db);
    } catch {
      console.error(JSON.stringify({ event: "league_maintenance_failed" }));
    }
    nextMaintenance = Date.now() + 60000;
  }
  const processed = await runNextJob(db);
  if (!processed) await new Promise((resolve) => setTimeout(resolve, 2000));
}
await db.close();
