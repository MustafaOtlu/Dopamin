import { createDatabase, migrate } from "../src/lib/db";
const db = await createDatabase();
try {
  await migrate(db);
  console.log("Migration'lar tamamlandı.");
} finally {
  await db.close();
}
