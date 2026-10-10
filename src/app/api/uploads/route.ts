import { z } from "zod";
import { after } from "next/server";
import { requireUser } from "@/modules/auth/service";
import { getDb } from "@/lib/db";
import { apiError, checkOrigin, json } from "@/lib/http";
import { assert } from "@/lib/errors";
import { uploadSource } from "@/modules/documents/service";
import { drainJobs } from "@/workers/runner";
import { uploadSubmissionFile } from "@/modules/assignments/service";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    const reader = request.body?.getReader();
    assert(reader, "Dosya isteği eksik.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 22 * 1024 * 1024) {
        await reader.cancel();
        assert(false, "Yükleme en fazla 20 MB olabilir.", 413);
      }
      chunks.push(value);
    }
    const body = new Uint8Array(Buffer.concat(chunks));
    const form = await new Response(body, {
      headers: { "Content-Type": request.headers.get("content-type") || "" },
    }).formData();
    const courseId = z.uuid().parse(form.get("course_id")),
      purpose = z
        .enum(["document", "image", "submission"])
        .parse(form.get("purpose") || "document"),
      file = form.get("file");
    assert(file instanceof File, "Bir dosya seç.");
    const db = await getDb();
    const result =
      purpose === "submission"
        ? await uploadSubmissionFile(
            db,
            user,
            courseId,
            z.uuid().parse(form.get("assignment_id")),
            file,
          )
        : await uploadSource(
            db,
            user,
            courseId,
            file,
            purpose,
            form.has("replace_id") ? z.uuid().parse(form.get("replace_id")) : undefined,
          );
    if (!process.env.DATABASE_URL) after(() => drainJobs(db));
    return json(result);
  } catch (err) {
    return apiError(err);
  }
}
