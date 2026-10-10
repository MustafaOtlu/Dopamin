import { requireUser, requireStudent, rateLimit } from "@/modules/auth/service";
import { getDb } from "@/lib/db";
import { apiError, checkOrigin, json } from "@/lib/http";
import { assert } from "@/lib/errors";
import { MAX_PHOTO_BYTES, saveProfilePhoto } from "@/modules/rewards/photos";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    requireStudent(user);
    const db = await getDb();
    await rateLimit(db, "profile-photo:" + user.id, 20, 3600);
    const reader = request.body?.getReader();
    assert(reader, "Fotoğraf eksik.");
    let size = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_PHOTO_BYTES + 65536) {
        await reader.cancel();
        assert(false, "Fotoğraf en fazla 5 MB olabilir.", 413);
      }
      chunks.push(value);
    }
    const form = await new Response(new Uint8Array(Buffer.concat(chunks)), {
      headers: { "Content-Type": request.headers.get("content-type") || "" },
    }).formData();
    const file = form.get("file");
    assert(file instanceof File, "Bir fotoğraf seç.");
    return json(await saveProfilePhoto(db, user, file));
  } catch (error) {
    return apiError(error);
  }
}
