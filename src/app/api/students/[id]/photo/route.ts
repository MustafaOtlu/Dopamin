import { z } from "zod";
import { requireUser, requireStudent } from "@/modules/auth/service";
import { getDb, asUser } from "@/lib/db";
import { apiError } from "@/lib/http";
import { assert } from "@/lib/errors";
import { publicStudentProfile } from "@/modules/rewards/profiles";
import { readStoredFile } from "@/modules/documents/storage";
export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    requireStudent(user);
    const id = z.uuid().parse((await context.params).id),
      db = await getDb();
    // Authorize every read against current visibility, even with an old photo URL.
    await asUser(db, user.id, (tx) => publicStudentProfile(tx, user, id));
    const [photo] = await db.query<{ storage_key: string }>(
      "select storage_key from profile_photos where user_id=$1",
      [id],
    );
    assert(photo, "Fotoğraf bulunamadı.", 404);
    return new Response(new Uint8Array(await readStoredFile(photo.storage_key)), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
