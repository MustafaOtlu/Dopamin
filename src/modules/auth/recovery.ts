import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import { getDb, type RootDatabase } from "@/lib/db";
import { assert, AppError } from "@/lib/errors";
import { tokenHash } from "./password";
import { newPasswordSchema } from "./credentials";
import { isSupabase, supabaseServer } from "./supabase";
import { rateLimit, requireUser } from "./service";
const recoveryCookie = "pusula_recovery";

export async function requestPasswordReset(input: unknown) {
  const { email } = z
    .object({
      email: z
        .email()
        .max(254)
        .transform((s) => s.toLowerCase().trim()),
    })
    .parse(input);
  const db = await getDb();
  await rateLimit(db, `password-reset:${email}`, 5);
  await rateLimit(db, "password-reset-global", 50);
  if (!isSupabase())
    throw new AppError(
      503,
      "E-posta ile hesap kurtarma henüz yapılandırılmadı. Yerel örnek hesaplarda demo şifresini kullan.",
    );
  const origin = new URL(process.env.APP_ORIGIN || "http://127.0.0.1:3000").origin;
  const { error } = await (
    await supabaseServer()
  ).auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });
  assert(!error, "Kurtarma isteği tamamlanamadı. Biraz sonra tekrar dene.");
  // The provider deliberately does not disclose whether the email is registered.
  return { requested: true };
}
export async function createRecoveryGrant(db: RootDatabase, userId: string) {
  const token = randomBytes(32).toString("hex");
  await db.transaction(async (tx) => {
    await tx.query("select id from profiles where id=$1 for update", [userId]);
    await tx.query("delete from auth_recovery_grants where user_id=$1 or expires_at<now()", [
      userId,
    ]);
    await tx.query("insert into auth_recovery_grants(token_hash,user_id) values($1,$2)", [
      tokenHash(token),
      userId,
    ]);
  });
  return token;
}
export async function setRecoveryCookie(token: string) {
  (await cookies()).set(recoveryCookie, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && !process.env.ALLOW_LOCAL_PREVIEW,
    path: "/",
    maxAge: 1200,
  });
}
export async function consumeRecoveryGrant(
  db: RootDatabase,
  userId: string,
  token: string,
  change: () => Promise<void>,
) {
  return db.transaction(async (tx) => {
    const [grant] = await tx.query(
      "select token_hash from auth_recovery_grants where token_hash=$1 and user_id=$2 and expires_at>now() and consumed_at is null for update",
      [tokenHash(token), userId],
    );
    assert(grant, "Kurtarma bağlantısı geçersiz veya süresi dolmuş. Yeni bağlantı iste.", 403);
    await change();
    await tx.query("update auth_recovery_grants set consumed_at=now() where token_hash=$1", [
      tokenHash(token),
    ]);
  });
}
export async function resetPassword(input: unknown) {
  const { password } = z.object({ password: newPasswordSchema }).parse(input);
  assert(isSupabase(), "E-posta ile hesap kurtarma henüz yapılandırılmadı.", 503);
  const user = await requireUser(),
    db = await getDb(),
    jar = await cookies(),
    token = jar.get(recoveryCookie)?.value;
  assert(token, "Önce e-postadaki kurtarma bağlantısını aç.", 403);
  await rateLimit(db, `password-recovery:${user.id}`, 5);
  const supabase = await supabaseServer();
  await consumeRecoveryGrant(db, user.id, token, async () => {
    const { error } = await supabase.auth.updateUser({ password });
    assert(!error, "Şifre güncellenemedi. Yeni bir kurtarma bağlantısı iste.");
  });
  jar.delete(recoveryCookie);
  const { error } = await supabase.auth.signOut({ scope: "others" });
  return { changed: true, others_revoked: !error };
}
