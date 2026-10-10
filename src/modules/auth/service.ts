import { cookies } from "next/headers";
import { z } from "zod";
import { getDb, type RootDatabase } from "@/lib/db";
import { AppError, assert } from "@/lib/errors";
import type { User } from "@/types/domain";
import { hashPassword, tokenHash } from "./password";
import { isSupabase, supabaseServer } from "./supabase";
import {
  authenticateLocal,
  changeLocalPassword,
  createSessionToken,
  passwordChangeSchema,
  revokeOtherLocalSessions,
} from "./credentials";

export const loginSchema = z.object({
  email: z
    .email()
    .max(254)
    .transform((s) => s.toLowerCase().trim()),
  password: z.string().min(8).max(128),
});
export const signupSchema = loginSchema.extend({
  display_name: z.string().trim().min(2).max(80),
  role: z.enum(["student", "teacher"]),
  invite_code: z.string().max(100).optional(),
});
const COOKIE = "pusula_session";

export async function rateLimit(db: RootDatabase, key: string, limit = 10, windowSeconds = 900) {
  const [row] = await db.query<{ count: number }>(
    `insert into auth_rate_limits(key,count,reset_at) values($1,1,now()+$2*interval '1 second')
    on conflict(key) do update set count=case when auth_rate_limits.reset_at<now() then 1 else auth_rate_limits.count+1 end,
    reset_at=case when auth_rate_limits.reset_at<now() then excluded.reset_at else auth_rate_limits.reset_at end returning count`,
    [key, windowSeconds],
  );
  if (row.count > limit)
    throw new AppError(429, "Çok fazla deneme yaptın. Biraz sonra tekrar dene.");
}

export async function createLocalUser(
  db: RootDatabase,
  input: z.infer<typeof signupSchema>,
  verified = false,
) {
  const existing = await db.query("select id from profiles where email=$1", [input.email]);
  assert(!existing.length, "Bu e-posta ile kayıt oluşturulamıyor.", 409);
  const passwordHash = await hashPassword(input.password);
  return db.transaction(async (tx) => {
    const [user] = await tx.query<User>(
      `insert into profiles(email,display_name,role,teacher_verified) values($1,$2,$3,$4) returning *`,
      [input.email, input.display_name, input.role, input.role === "teacher" && verified],
    );
    await tx.query("insert into local_credentials(user_id,password_hash) values($1,$2)", [
      user.id,
      passwordHash,
    ]);
    return user;
  });
}
async function setLocalSession(db: RootDatabase, userId: string) {
  const token = await createSessionToken(db, userId);
  await setLocalCookie(token);
}
async function setLocalCookie(token: string) {
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && !process.env.ALLOW_LOCAL_PREVIEW,
    path: "/",
    maxAge: 7 * 86400,
  });
}
function ensureLocalAllowed() {
  if (process.env.NODE_ENV === "production" && !process.env.ALLOW_LOCAL_PREVIEW)
    throw new AppError(503, "Canlı ortamda Supabase kimlik doğrulaması gerekiyor.");
}
export async function signup(input: unknown) {
  const data = signupSchema.parse(input),
    db = await getDb();
  await rateLimit(db, `signup:${data.email}`, 5);
  if (isSupabase()) {
    const supabase = await supabaseServer();
    const { data: result, error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: { display_name: data.display_name, role: data.role },
        emailRedirectTo: `${process.env.APP_ORIGIN}/auth/callback`,
      },
    });
    if (error) throw new AppError(400, "Hesap oluşturulamadı. E-posta ve şifreni kontrol et.");
    if (result.user && result.session) return { user: await currentUser() };
    return { confirmation_required: true };
  }
  ensureLocalAllowed();
  const verified =
    !!process.env.TEACHER_INVITE_CODE && data.invite_code === process.env.TEACHER_INVITE_CODE;
  const user = await createLocalUser(db, data, verified);
  await setLocalSession(db, user.id);
  return { user };
}
export async function login(input: unknown) {
  const data = loginSchema.parse(input),
    db = await getDb();
  await rateLimit(db, `login:${data.email}`);
  if (isSupabase()) {
    const { error } = await (await supabaseServer()).auth.signInWithPassword(data);
    if (error) throw new AppError(401, "E-posta veya şifre hatalı.");
    return { user: await currentUser() };
  }
  ensureLocalAllowed();
  const { user, token } = await authenticateLocal(db, data.email, data.password);
  await setLocalCookie(token);
  return { user };
}
export async function currentUser(): Promise<User | null> {
  const db = await getDb();
  if (isSupabase()) {
    const { data, error } = await (await supabaseServer()).auth.getUser();
    if (error || !data.user) return null;
    const account = data.user;
    let [profile] = await db.query<User>("select * from profiles where id=$1", [account.id]);
    if (!profile) {
      const name = String(account.user_metadata.display_name || "Öğrenci").slice(0, 80);
      const role = account.user_metadata.role === "teacher" ? "teacher" : "student";
      [profile] = await db.query<User>(
        `insert into profiles(id,email,display_name,role,teacher_verified) values($1,$2,$3,$4,false)
        on conflict(id) do update set email=excluded.email returning *`,
        [account.id, account.email, name, role],
      );
    }
    return profile;
  }
  ensureLocalAllowed();
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const [user] = await db.query<User>(
    "select p.* from auth_sessions s join profiles p on p.id=s.user_id where s.token_hash=$1 and s.expires_at>now()",
    [tokenHash(token)],
  );
  return user || null;
}
export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new AppError(401, "Devam etmek için giriş yap.");
  return user;
}
export function requireTeacher(user: User) {
  assert(user.role === "teacher", "Bu işlem akademisyen hesabı gerektiriyor.", 403);
  assert(user.teacher_verified, "Akademisyen hesabının doğrulanması bekleniyor.", 403);
}
export function requireStudent(user: User) {
  assert(user.role === "student", "Bu işlem öğrenci hesabı gerektiriyor.", 403);
}
export async function logout() {
  if (isSupabase()) await (await supabaseServer()).auth.signOut();
  else {
    const jar = await cookies(),
      token = jar.get(COOKIE)?.value;
    if (token)
      await (
        await getDb()
      ).query("delete from auth_sessions where token_hash=$1", [tokenHash(token)]);
    jar.delete(COOKIE);
  }
}

export async function changePassword(input: unknown) {
  const user = await requireUser(),
    db = await getDb(),
    data = passwordChangeSchema.parse(input);
  await rateLimit(db, `password-change:${user.id}`, 5);
  assert(data.current_password !== data.password, "Yeni şifre mevcut şifreden farklı olmalı.");
  if (isSupabase()) {
    const supabase = await supabaseServer();
    // Explicit verification also works when the provider's current-password setting is disabled.
    const verified = await supabase.auth.signInWithPassword({
      email: user.email,
      password: data.current_password,
    });
    assert(!verified.error && verified.data.user?.id === user.id, "Mevcut şifre hatalı.", 401);
    const changed = await supabase.auth.updateUser({
      password: data.password,
      current_password: data.current_password,
    });
    assert(!changed.error, "Şifre değiştirilemedi. Yeniden giriş yapıp tekrar dene.");
    const { error } = await supabase.auth.signOut({ scope: "others" });
    return { changed: true, others_revoked: !error };
  }
  ensureLocalAllowed();
  await setLocalCookie(await changeLocalPassword(db, user.id, data));
  return { changed: true, others_revoked: true };
}
export async function logoutOthers() {
  const user = await requireUser();
  if (isSupabase()) {
    const { error } = await (await supabaseServer()).auth.signOut({ scope: "others" });
    assert(!error, "Diğer oturumlar kapatılamadı. Yeniden dene.");
  } else {
    ensureLocalAllowed();
    const token = (await cookies()).get(COOKIE)?.value;
    assert(token, "Yeniden giriş yap.", 401);
    await revokeOtherLocalSessions(await getDb(), user.id, token);
  }
  return { revoked: true };
}
