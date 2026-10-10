import path from "node:path";
import { createDatabase } from "../src/lib/db";

// Explicitly scoped one-time local demo grant. Never run against a remote database.
const localDb = path.resolve(".data/postgres");
const configuredDb = path.resolve(process.env.PGLITE_PATH || ".data/postgres");
if (
  process.env.NODE_ENV === "production" ||
  process.env.AUTH_PROVIDER === "supabase" ||
  process.env.DATABASE_URL ||
  configuredDb !== localDb
)
  throw new Error("Bu işlem yalnız yerel örnek veritabanında çalışır.");

const db = await createDatabase(localDb);
try {
  const result = await db.transaction(async (tx) => {
    const [ece] = await tx.query<{ id: string; display_name: string; role: string }>(
      "select id,display_name,role from profiles where email=$1 for update",
      ["ogrenci@pusula.local"],
    );
    if (!ece || ece.display_name !== "Ece Yılmaz" || ece.role !== "student")
      throw new Error("Yerel örnek Ece Yılmaz hesabı bulunamadı.");
    const [before] = await tx.query<{ tokens: number }>(
      "select tokens from reward_accounts where user_id=$1",
      [ece.id],
    );
    const event = "demo-ece-token-test-200-2026-10-09";
    const existing = await tx.query(
      "select id from token_transactions where user_id=$1 and event_key=$2",
      [ece.id, event],
    );
    await tx.query(
      "select issue_reward($1::uuid,$2::text,'manual_test_credit',null::uuid,0,0,0,200)",
      [ece.id, event],
    );
    const [after] = await tx.query<{ tokens: number }>(
      "select tokens from reward_accounts where user_id=$1",
      [ece.id],
    );
    if (!after || after.tokens !== (before?.tokens || 0) + (existing.length ? 0 : 200))
      throw new Error("Token bakiyesi işlem geçmişiyle uyuşmuyor.");
    return {
      student: ece.display_name,
      added: existing.length ? 0 : 200,
      before: before?.tokens || 0,
      after: after.tokens,
    };
  });
  console.log(JSON.stringify(result));
} finally {
  await db.close();
}
