import { z } from "zod";
import { asUser, getDb } from "@/lib/db";
import { requireUser } from "@/modules/auth/service";
import { apiError } from "@/lib/http";
import { assert } from "@/lib/errors";
import { readStoredFile } from "@/modules/documents/storage";
import type { FileRecord } from "@/modules/documents/service";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(),
      id = z.uuid().parse((await params).id),
      db = await getDb();
    const file = await asUser(db, user.id, async (tx) => {
      const [row] = await tx.query<FileRecord>("select * from files where id=$1", [id]);
      assert(row, "Dosya bulunamadı veya erişim iznin yok.", 404);
      if (row.purpose === "document") {
        const [doc] = await tx.query<{ status: string }>(
          "select status from documents where file_id=$1 and status!='deleted'",
          [id],
        );
        assert(doc, "Dosya artık kullanılamıyor.", 404);
        if (user.role === "student")
          assert(doc.status === "ready", "Belge henüz hazır değil.", 403);
      }
      return row;
    });
    const bytes = await readStoredFile(file.storage_key);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": file.mime_type,
        "Content-Disposition": `${file.purpose === "image" ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.original_name).replace(/'/g, "%27")}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    return apiError(err);
  }
}
