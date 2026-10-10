import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { assert, AppError } from "@/lib/errors";

function safePath(key: string) {
  assert(/^[a-f0-9-]+\/[a-f0-9-]+\.(pdf|png|jpg|txt)$/.test(key), "Depolama anahtarı geçersiz.");
  const root = path.resolve(/* turbopackIgnore: true */ process.env.STORAGE_PATH || ".data/files"),
    target = path.resolve(root, key);
  assert(target.startsWith(root + path.sep), "Dosya yolu geçersiz.");
  return target;
}
function storageClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new AppError(503, "Özel dosya depolama bağlantısı yapılandırılmadı.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).storage.from(process.env.STORAGE_BUCKET || "course-documents");
}
export async function putFile(key: string, bytes: Uint8Array, mime: string) {
  safePath(key);
  if (process.env.AUTH_PROVIDER === "supabase") {
    const { error } = await storageClient().upload(key, bytes, {
      contentType: mime,
      upsert: false,
    });
    if (error) throw new AppError(503, "Dosya yüklenemedi. Tekrar dene.");
  } else {
    const target = safePath(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes, { flag: "wx" });
  }
}
export async function readStoredFile(key: string) {
  safePath(key);
  if (process.env.AUTH_PROVIDER === "supabase") {
    const { data, error } = await storageClient().download(key);
    if (error || !data) throw new AppError(404, "Dosya bulunamadı.");
    return new Uint8Array(await data.arrayBuffer());
  }
  return new Uint8Array(await readFile(/* turbopackIgnore: true */ safePath(key)));
}
export async function deleteStoredFile(key: string) {
  safePath(key);
  if (process.env.AUTH_PROVIDER === "supabase") {
    const { error } = await storageClient().remove([key]);
    if (error) throw new AppError(503, "Dosya silinemedi.");
  } else {
    try {
      await unlink(safePath(key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }
}
