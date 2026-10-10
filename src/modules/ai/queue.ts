import type { Database } from "@/lib/db";
import { assert } from "@/lib/errors";
import type { User } from "@/types/domain";
import { ownCourse } from "@/modules/courses/service";
import { ensureAI } from "./provider";
import { loadSources } from "./service";
import { assertWebPermission } from "@/modules/documents/web-sources";

export async function retryContentJob(tx: Database, user: User, courseId: string, jobId: string) {
  await ownCourse(tx, user, courseId);
  const [course] = await tx.query<{ archived: boolean }>(
    "select archived from courses where id=$1 for update",
    [courseId],
  );
  assert(course && !course.archived, "Arşivdeki dersin işlemi yeniden başlatılamaz.", 409);
  const [job] = await tx.query<{
    kind: string;
    status: string;
    manual_retries: number;
    payload: {
      document_id?: string;
      document_ids?: string[];
      objective_id?: string;
      permission_id?: string;
      permission_revision?: number;
      source_policy_revision?: number;
    };
  }>("select * from background_jobs where id=$1 and course_id=$2 for update", [jobId, courseId]);
  assert(job, "İşlem bulunamadı.", 404);
  assert(
    ["failed", "needs_input"].includes(job.status),
    "Yalnız tamamlanamayan işlemler yeniden denenebilir.",
    409,
  );
  assert(job.kind !== "file_cleanup", "Dosya saklama süresi bu işlemle değiştirilemez.", 409);
  assert(
    job.manual_retries < 5,
    "Bu işlem için beş yeniden deneme kullanıldı. Kaynağı veya üretim isteğini yeniden oluştur.",
    409,
  );
  if (job.kind === "pdf_extract") {
    const [doc] = await tx.query(
      "select id from documents where id=$1 and course_id=$2 and status!='deleted' and superseded_by is null",
      [job.payload.document_id, courseId],
    );
    assert(doc, "Güncel kaynak bulunamadı. Yeni bir kaynak seç.", 409);
    const active = await tx.query(
      `select id from background_jobs where course_id=$1 and kind='pdf_extract'
      and payload->>'document_id'=$2 and status in ('queued','processing')`,
      [courseId, job.payload.document_id],
    );
    assert(!active.length, "Bu kaynağın çözümlemesi zaten sürüyor.", 409);
    await tx.query("update documents set status='queued',error_message=null where id=$1", [
      job.payload.document_id,
    ]);
  } else if (job.kind === "web_fetch") {
    await assertWebPermission(tx, courseId, job.payload);
    const active = await tx.query(
      "select id from background_jobs where course_id=$1 and kind='web_fetch' and payload->>'permission_id'=$2 and status in ('queued','processing')",
      [courseId, job.payload.permission_id],
    );
    assert(!active.length, "Bu web kaynağı zaten okunuyor.", 409);
  } else {
    ensureAI();
    await loadSources(tx, courseId, job.payload.document_ids || []);
    if (job.kind === "ai_generate")
      assert(
        (
          await tx.query("select id from objectives where id=$1 and course_id=$2", [
            job.payload.objective_id,
            courseId,
          ])
        ).length,
        "Kazanım bulunamadı.",
      );
    const active = await tx.query(
      "select id from background_jobs where course_id=$1 and kind=$2 and status in ('queued','processing')",
      [courseId, job.kind],
    );
    assert(!active.length, "Bu dersteki aynı işlem zaten sürüyor.", 409);
  }
  const [retried] = await tx.query(
    `update background_jobs set status='queued',attempts=0,
    manual_retries=manual_retries+1,available_at=now(),leased_until=null,lease_token=null,
    heartbeat_at=null,error_message=null,completed_at=null where id=$1 returning id,status,manual_retries`,
    [jobId],
  );
  return retried;
}
