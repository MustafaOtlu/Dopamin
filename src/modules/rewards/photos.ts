import { randomUUID } from "node:crypto";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { asUser, type RootDatabase } from "@/lib/db";
import { assert, AppError } from "@/lib/errors";
import { requireStudent } from "@/modules/auth/service";
import { detectType } from "@/modules/documents/service";
import { putFile, deleteStoredFile } from "@/modules/documents/storage";
import type { User } from "@/types/domain";
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
function dimensions(bytes: Buffer) {
  if (detectType(bytes)?.extension === "png" && bytes.length >= 24)
    return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 255) break;
    const marker = bytes[offset + 1];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    if (marker === 0xff) {
      offset++;
      continue;
    }
    const size = bytes.readUInt16BE(offset + 2);
    if (size < 2 || offset + size + 2 > bytes.length) break;
    if (
      [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(
        marker,
      )
    )
      return [bytes.readUInt16BE(offset + 7), bytes.readUInt16BE(offset + 5)];
    offset += 2 + size;
  }
  throw new AppError(415, "Geçerli bir PNG veya JPEG fotoğrafı seç.");
}
export async function saveProfilePhoto(db: RootDatabase, user: User, file: File) {
  requireStudent(user);
  assert(file.size > 0 && file.size <= MAX_PHOTO_BYTES, "Fotoğraf en fazla 5 MB olabilir.", 413);
  const bytes = Buffer.from(await file.arrayBuffer());
  assert(
    ["png", "jpg"].includes(detectType(bytes)?.extension || ""),
    "PNG veya JPEG fotoğrafı seç.",
    415,
  );
  const [w, h] = dimensions(bytes);
  assert(
    w > 0 && h > 0 && w * h <= 25_000_000 && w <= 10000 && h <= 10000,
    "Fotoğraf en fazla 25 megapiksel olabilir.",
    413,
  );
  let image;
  try {
    image = await loadImage(bytes);
  } catch {
    throw new AppError(415, "Fotoğraf okunamadı. Başka bir PNG veya JPEG seç.");
  }
  const canvas = createCanvas(512, 512),
    ctx = canvas.getContext("2d");
  const edge = Math.min(image.width, image.height);
  ctx.drawImage(
    image,
    (image.width - edge) / 2,
    (image.height - edge) / 2,
    edge,
    edge,
    0,
    0,
    512,
    512,
  );
  const version = randomUUID(),
    key = user.id + "/" + version + ".png";
  await putFile(key, canvas.toBuffer("image/png"), "image/png");
  let previous: string | undefined;
  try {
    previous = await asUser(db, user.id, async (tx) => {
      await tx.query("select pg_advisory_xact_lock(hashtext($1))", ["photo:" + user.id]);
      const [old] = await tx.query<{ storage_key: string }>(
        "select storage_key from profile_photos where user_id=$1",
        [user.id],
      );
      await tx.query(
        "insert into profile_photos(user_id,storage_key,version) values($1,$2,$3) on conflict(user_id) do update set storage_key=excluded.storage_key,version=excluded.version,updated_at=now()",
        [user.id, key, version],
      );
      return old?.storage_key;
    });
  } catch (error) {
    await deleteStoredFile(key).catch(() => {});
    throw error;
  }
  if (previous) await deleteStoredFile(previous).catch(() => {});
  return { photo_url: "/api/students/" + user.id + "/photo?v=" + version };
}
