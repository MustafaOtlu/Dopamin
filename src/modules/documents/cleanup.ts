import type { RootDatabase } from "@/lib/db";
import { assert } from "@/lib/errors";
import { deleteStoredFile } from "./storage";

// Only the root worker calls this function. No user-facing purge endpoint.
export async function purgeRemovedDocument(db: RootDatabase, courseId: string, documentId: string) {
  return db.transaction(async (tx) => {
    const [doc] = await tx.query<{
      status: string;
      file_id: string;
      storage_key: string;
      eligible: boolean;
      purged_at: string | null;
    }>(
      "select d.status,d.file_id,f.storage_key,f.purged_at,(d.purge_after<=now()) eligible from documents d join files f on f.id=d.file_id where d.id=$1 and d.course_id=$2 for update of d,f",
      [documentId, courseId],
    );
    assert(
      doc && doc.status === "deleted" && doc.eligible,
      "Belge silme süresi veya durumu geçerli değil.",
    );
    if (!doc.purged_at) {
      await deleteStoredFile(doc.storage_key);
      await tx.query("delete from document_chunks where document_id=$1", [documentId]);
      await tx.query("update files set purged_at=now() where id=$1", [doc.file_id]);
    }
    return { purged: true, document_id: documentId };
  });
}
