import { beforeAll, afterAll, it, expect } from "vitest";
import { createDatabase, migrate, asUser, type RootDatabase } from "@/lib/db";
import { createLocalUser } from "@/modules/auth/service";
import {
  authenticateLocal,
  changeLocalPassword,
  revokeOtherLocalSessions,
} from "@/modules/auth/credentials";
import { createRecoveryGrant, consumeRecoveryGrant } from "@/modules/auth/recovery";
import { tokenHash, verifyPassword } from "@/modules/auth/password";
import type { User } from "@/types/domain";
let db: RootDatabase, user: User, other: User;
const oldPassword = "InitialPass2026!",
  newPassword = "NewStudyPass2026!";
beforeAll(async () => {
  db = await createDatabase("memory://");
  await migrate(db);
  user = await createLocalUser(db, {
    email: "security@test.edu",
    display_name: "Güvenlik Öğrencisi",
    role: "student",
    password: oldPassword,
  });
  other = await createLocalUser(db, {
    email: "security-other@test.edu",
    display_name: "Diğer Öğrenci",
    role: "student",
    password: oldPassword,
  });
});
afterAll(async () => {
  await db.close();
});
it("hatalı mevcut şifre veya kısa yeni şifre kimlik bilgilerini ve oturumları değiştirmez", async () => {
  const initial = await authenticateLocal(db, user.email, oldPassword);
  await expect(
    changeLocalPassword(db, user.id, { current_password: "WrongPassword", password: newPassword }),
  ).rejects.toThrow("Mevcut şifre");
  await expect(
    changeLocalPassword(db, user.id, { current_password: oldPassword, password: "short" }),
  ).rejects.toThrow();
  expect(
    await db.query("select token_hash from auth_sessions where token_hash=$1", [
      tokenHash(initial.token),
    ]),
  ).toHaveLength(1);
});
it("şifre değişimi eski oturumları iptal eder; yeni şifre geçerlidir ve başka kullanıcı etkilenmez", async () => {
  const second = await authenticateLocal(db, user.email, oldPassword),
    untouched = await authenticateLocal(db, other.email, oldPassword);
  const current = await changeLocalPassword(db, user.id, {
    current_password: oldPassword,
    password: newPassword,
  });
  expect(
    await db.query("select token_hash from auth_sessions where token_hash=$1", [
      tokenHash(second.token),
    ]),
  ).toHaveLength(0);
  expect(
    await db.query("select token_hash from auth_sessions where token_hash=$1", [
      tokenHash(untouched.token),
    ]),
  ).toHaveLength(1);
  expect(
    await db.query("select token_hash from auth_sessions where user_id=$1", [user.id]),
  ).toHaveLength(1);
  await expect(authenticateLocal(db, user.email, oldPassword)).rejects.toThrow("hatalı");
  const signedIn = await authenticateLocal(db, user.email, newPassword);
  expect(signedIn.user.id).toBe(user.id);
  expect("password_hash" in signedIn.user).toBe(false);
  const [credential] = await db.query<{ password_hash: string }>(
    "select password_hash from local_credentials where user_id=$1",
    [user.id],
  );
  expect(credential.password_hash).not.toContain(newPassword);
  expect(await verifyPassword(newPassword, credential.password_hash)).toBe(true);
  await expect(revokeOtherLocalSessions(db, user.id, untouched.token)).rejects.toThrow(
    "yeniden giriş",
  );
  expect(await revokeOtherLocalSessions(db, user.id, current)).toBe(1);
  expect(
    await db.query("select token_hash from auth_sessions where user_id=$1", [user.id]),
  ).toEqual([{ token_hash: tokenHash(current) }]);
});
it("eşzamanlı aynı mevcut şifreyle iki değişimden yalnız biri geçer; eski şifre tekrar kullanılmaz", async () => {
  const results = await Promise.allSettled([
    changeLocalPassword(db, user.id, {
      current_password: newPassword,
      password: "NextPasswordOne2026!",
    }),
    changeLocalPassword(db, user.id, {
      current_password: newPassword,
      password: "NextPasswordTwo2026!",
    }),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const index = results[0].status === "fulfilled" ? 0 : 1;
  const final = ["NextPasswordOne2026!", "NextPasswordTwo2026!"][index];
  expect((await authenticateLocal(db, user.email, final)).user.id).toBe(user.id);
  await expect(authenticateLocal(db, user.email, newPassword)).rejects.toThrow("hatalı");
});
it("kurtarma yetkisi süreli, kullanıcıya özel, tek kullanımlık ve uygulama rolünden gizlidir", async () => {
  const token = await createRecoveryGrant(db, user.id);
  await expect(
    asUser(db, user.id, (tx) => tx.query("select * from auth_recovery_grants")),
  ).rejects.toThrow();
  let called = 0;
  await expect(
    consumeRecoveryGrant(db, other.id, token, async () => {
      called++;
    }),
  ).rejects.toThrow("geçersiz");
  await expect(
    consumeRecoveryGrant(db, user.id, "forged", async () => {
      called++;
    }),
  ).rejects.toThrow("geçersiz");
  expect(called).toBe(0);
  await consumeRecoveryGrant(db, user.id, token, async () => {
    called++;
  });
  await expect(
    consumeRecoveryGrant(db, user.id, token, async () => {
      called++;
    }),
  ).rejects.toThrow("geçersiz");
  expect(called).toBe(1);
  const expired = await createRecoveryGrant(db, user.id);
  await db.query(
    "update auth_recovery_grants set expires_at=now()-interval '1 second' where user_id=$1",
    [user.id],
  );
  await expect(
    consumeRecoveryGrant(db, user.id, expired, async () => {
      called++;
    }),
  ).rejects.toThrow("geçersiz");
  const first = await createRecoveryGrant(db, user.id),
    replacement = await createRecoveryGrant(db, user.id);
  await expect(
    consumeRecoveryGrant(db, user.id, first, async () => {
      called++;
    }),
  ).rejects.toThrow("geçersiz");
  await consumeRecoveryGrant(db, user.id, replacement, async () => {
    called++;
  });
  expect(called).toBe(2);
});
