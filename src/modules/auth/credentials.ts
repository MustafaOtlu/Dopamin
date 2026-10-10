import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { Database, RootDatabase } from "@/lib/db";
import { assert, AppError } from "@/lib/errors";
import type { User } from "@/types/domain";
import { hashPassword, tokenHash, verifyPassword } from "./password";

export const newPasswordSchema = z
  .string()
  .min(12, "Yeni şifre en az 12 karakter olmalı.")
  .max(128);
export const passwordChangeSchema = z.object({
  current_password: z.string().min(1).max(128),
  password: newPasswordSchema,
});
export async function createSessionToken(tx: Database, userId: string) {
  const token = randomBytes(32).toString("hex");
  await tx.query(
    "insert into auth_sessions(token_hash,user_id,expires_at) values($1,$2,now()+interval '7 days')",
    [tokenHash(token), userId],
  );
  return token;
}
export async function authenticateLocal(db: RootDatabase, email: string, password: string) {
  return db.transaction(async (tx) => {
    const [row] = await tx.query<User & { password_hash: string }>(
      "select p.*,c.password_hash from profiles p join local_credentials c on c.user_id=p.id where p.email=$1 for update of c",
      [email],
    );
    const dummy = "00000000000000000000000000000000:" + "00".repeat(64);
    const valid = await verifyPassword(password, row?.password_hash || dummy);
    if (!row || !valid) throw new AppError(401, "E-posta veya şifre hatalı.");
    const { password_hash: _, ...user } = row;
    void _;
    const token = await createSessionToken(tx, user.id);
    return { user, token };
  });
}
export async function changeLocalPassword(db: RootDatabase, userId: string, input: unknown) {
  const data = passwordChangeSchema.parse(input);
  assert(data.current_password !== data.password, "Yeni şifre mevcut şifreden farklı olmalı.");
  return db.transaction(async (tx) => {
    const [credential] = await tx.query<{ password_hash: string }>(
      "select password_hash from local_credentials where user_id=$1 for update",
      [userId],
    );
    assert(
      credential && (await verifyPassword(data.current_password, credential.password_hash)),
      "Mevcut şifre hatalı.",
      401,
    );
    await tx.query("update local_credentials set password_hash=$2 where user_id=$1", [
      userId,
      await hashPassword(data.password),
    ]);
    await tx.query("delete from auth_sessions where user_id=$1", [userId]);
    return createSessionToken(tx, userId);
  });
}
export async function revokeOtherLocalSessions(db: RootDatabase, userId: string, token: string) {
  return db.transaction(async (tx) => {
    // Same credential lock as sign-in/password change closes concurrent session races.
    await tx.query("select user_id from local_credentials where user_id=$1 for update", [userId]);
    const current = await tx.query(
      "select token_hash from auth_sessions where user_id=$1 and token_hash=$2 and expires_at>now()",
      [userId, tokenHash(token)],
    );
    assert(current.length, "Devam etmek için yeniden giriş yap.", 401);
    const removed = await tx.query(
      "delete from auth_sessions where user_id=$1 and token_hash!=$2 returning token_hash",
      [userId, tokenHash(token)],
    );
    return removed.length;
  });
}
