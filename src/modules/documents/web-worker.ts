import { createHash, randomUUID } from "node:crypto";
import { asUser, type RootDatabase } from "@/lib/db";
import type { User } from "@/types/domain";
import { assertWritableJob } from "@/workers/lease";
import { assertWebPermission } from "./web-sources";
import { fetchWebPage, type WebPage } from "./web-reader";
import { putFile, deleteStoredFile } from "./storage";
import { retireSourceWork } from "./service";

export interface WebJob {
  id: string;
  course_id: string;
  lease_token: string;
  payload: {
    permission_id?: string;
    permission_revision?: number;
    source_policy_revision?: number;
  };
}
export async function processWebSource(
  db: RootDatabase,
  user: User,
  job: WebJob,
  fetchPage: (url: string) => Promise<WebPage> = fetchWebPage,
) {
  const permission = await asUser(db, user.id, async (tx) => {
    await assertWritableJob(tx, job.id, job.lease_token, job.course_id, user.id);
    return assertWebPermission(tx, job.course_id, job.payload);
  });
  const page = await fetchPage(permission.url);
  const bytes = Buffer.from(page.text, "utf8"),
    hash = createHash("sha256").update(bytes).digest("hex");
  const fileId = randomUUID(),
    key = `${job.course_id}/${fileId}.txt`;
  await putFile(key, bytes, "text/plain; charset=utf-8");
  try {
    const result = await asUser(db, user.id, async (tx) => {
      await assertWritableJob(tx, job.id, job.lease_token, job.course_id, user.id);
      await assertWebPermission(tx, job.course_id, job.payload);
      const [previous] = await tx.query<{
        id: string;
        file_id: string;
        sha256: string;
        source_permission_revision: number;
        source_policy_revision: number;
      }>(
        `select d.id,d.file_id,f.sha256,d.source_permission_revision,d.source_policy_revision
        from documents d join files f on f.id=d.file_id where d.source_permission_id=$1 and d.status!='deleted' and d.superseded_by is null for update of d`,
        [permission.id],
      );
      if (
        previous?.sha256 === hash &&
        previous.source_permission_revision === job.payload.permission_revision &&
        previous.source_policy_revision === job.payload.source_policy_revision
      )
        return { document_id: previous.id, unchanged: true, chunks: page.chunks.length };
      const [{ version }] = await tx.query<{ version: number }>(
        "select coalesce(max(source_version),0)+1 version from documents where source_permission_id=$1",
        [permission.id],
      );
      await tx.query(
        "insert into files(id,course_id,uploaded_by,purpose,storage_key,original_name,mime_type,byte_size,sha256) values($1,$2,$3,'document',$4,$5,'text/plain; charset=utf-8',$6,$7)",
        [fileId, job.course_id, user.id, key, `web-kaynagi-v${version}.txt`, bytes.length, hash],
      );
      const [doc] = await tx.query<{ id: string }>(
        `insert into documents(course_id,file_id,sha256,title,status,page_count,source_id,source_version,replaces_id,
        source_kind,source_permission_id,source_permission_revision,source_policy_revision,source_url,fetched_at)
        values($1,$2,$3,$4,'ready',$5,$6,$7,$8,'web',$6,$9,$10,$11,now()) returning id`,
        [
          job.course_id,
          fileId,
          createHash("sha256").update(`web:${permission.id}:${version}:${hash}`).digest("hex"),
          permission.title || page.title,
          page.chunks.length,
          permission.id,
          version,
          previous?.id || null,
          job.payload.permission_revision,
          job.payload.source_policy_revision,
          permission.url,
        ],
      );
      for (const chunk of page.chunks)
        await tx.query(
          "insert into document_chunks(document_id,course_id,page,chunk_index,text,heading) values($1,$2,$3,$4,$5,$6)",
          [doc.id, job.course_id, chunk.page, chunk.chunk_index, chunk.text, chunk.heading],
        );
      if (previous) {
        await tx.query("update documents set superseded_by=$2,student_access=false where id=$1", [
          previous.id,
          doc.id,
        ]);
        await tx.query("update files set student_access=false where id=$1", [previous.file_id]);
        await retireSourceWork(tx, previous.id, "Web kaynağı yeni sürümle değiştirildi.");
      }
      return { document_id: doc.id, unchanged: false, chunks: page.chunks.length };
    });
    if (result.unchanged) await deleteStoredFile(key);
    return result;
  } catch (err) {
    await deleteStoredFile(key);
    throw err;
  }
}
