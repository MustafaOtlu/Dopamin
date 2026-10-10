import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { asUser, type RootDatabase, type Database } from "@/lib/db";
import { assert } from "@/lib/errors";
import { ownCourse } from "@/modules/courses/service";
import type { User } from "@/types/domain";
import { putFile, deleteStoredFile } from "./storage";
import { sourceAllowedSql } from "./web-sources";
export const MAX_FILE_SIZE = 20 * 1024 * 1024;
export interface Document {
  id: string;
  course_id: string;
  file_id: string;
  title: string;
  status: string;
  page_count: number | null;
  ocr_pages: number[];
  ocr_confidence: number | null;
  error_message: string | null;
  student_access: boolean;
  created_at: string;
  source_id: string;
  source_version: number;
  replaces_id: string | null;
  superseded_by: string | null;
  source_kind: "pdf" | "web";
  source_permission_id: string | null;
  source_url: string | null;
  fetched_at: string | null;
  allowed: boolean;
}
export interface FileRecord {
  id: string;
  course_id: string;
  uploaded_by: string;
  purpose: string;
  storage_key: string;
  original_name: string;
  mime_type: string;
  byte_size: number;
  sha256: string;
  student_access: boolean;
}
export function detectType(bytes: Uint8Array) {
  if (Buffer.from(bytes.slice(0, 5)).toString("ascii") === "%PDF-")
    return { extension: "pdf", mime: "application/pdf" };
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  )
    return { extension: "png", mime: "image/png" };
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return { extension: "jpg", mime: "image/jpeg" };
  return null;
}
export async function uploadSource(
  db: RootDatabase,
  user: User,
  courseId: string,
  file: File,
  purpose: "document" | "image" = "document",
  replaceId?: string,
) {
  assert(
    file.size > 0 && file.size <= MAX_FILE_SIZE,
    "Dosya boş olamaz ve en fazla 20 MB olabilir.",
    413,
  );
  await asUser(db, user.id, (tx) => ownCourse(tx, user, courseId));
  assert(!replaceId || purpose === "document", "Yalnız PDF kaynaklarının sürümü yenilenebilir.");
  const bytes = new Uint8Array(await file.arrayBuffer()),
    type = detectType(bytes);
  assert(type, "Desteklenen bir PDF, PNG veya JPEG dosyası seç.", 415);
  assert(
    purpose === "document" ? type.extension === "pdf" : type.extension !== "pdf",
    purpose === "document" ? "Geçerli bir PDF dosyası seç." : "PNG veya JPEG görseli seç.",
    415,
  );
  const hash = createHash("sha256").update(bytes).digest("hex");
  if (purpose === "document") {
    const [existing] = await asUser(db, user.id, (tx) =>
      tx.query<Document>(
        "select * from documents where course_id=$1 and sha256=$2 and status!='deleted'",
        [courseId, hash],
      ),
    );
    if (existing) {
      assert(
        !replaceId,
        "Bu PDF zaten bir kaynak sürümü olarak kayıtlı. Farklı içerikli bir PDF seç.",
        409,
      );
      return { ...existing, duplicate: true };
    }
  }
  const id = randomUUID(),
    key = `${courseId}/${id}.${type.extension}`,
    name =
      Array.from(file.name)
        .map((c) => (c.codePointAt(0)! < 32 || c === "/" || c === "\\" ? "_" : c))
        .join("")
        .slice(0, 200) || `Kaynak.${type.extension}`;
  await putFile(key, bytes, type.mime);
  try {
    const result = await asUser(db, user.id, async (tx) => {
      await ownCourse(tx, user, courseId);
      // Serialize duplicate uploads and source replacement for this course.
      await tx.query("select id from courses where id=$1 for update", [courseId]);
      const [previous] = replaceId
        ? await tx.query<Document>(
            "select * from documents where id=$1 and course_id=$2 and status!='deleted' for update",
            [replaceId, courseId],
          )
        : [];
      if (replaceId) {
        assert(previous, "Yenilenecek kaynak bulunamadı.", 404);
        assert(previous.source_kind === "pdf", "Web kaynağını izinli adresinden yeniden oku.", 409);
        assert(!previous.superseded_by, "Bu kaynak zaten yenilendi. Güncel sürümü seç.", 409);
      }
      if (purpose === "document") {
        const [existing] = await tx.query<Document>(
          "select * from documents where course_id=$1 and sha256=$2 and status!='deleted'",
          [courseId, hash],
        );
        if (existing) {
          assert(
            !replaceId,
            "Bu PDF zaten bir kaynak sürümü olarak kayıtlı. Farklı içerikli bir PDF seç.",
            409,
          );
          return { ...existing, duplicate: true };
        }
      }
      await tx.query(
        "insert into files(id,course_id,uploaded_by,purpose,storage_key,original_name,mime_type,byte_size,sha256,student_access) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
        [
          id,
          courseId,
          user.id,
          purpose,
          key,
          name,
          type.mime,
          file.size,
          hash,
          purpose === "image",
        ],
      );
      if (purpose === "image") return { id, url: `/api/files/${id}`, duplicate: false };
      const [doc] = await tx.query<Document>(
        "insert into documents(course_id,file_id,sha256,title,source_id,source_version,replaces_id) values($1,$2,$3,$4,$5,$6,$7) returning *",
        [
          courseId,
          id,
          hash,
          name,
          previous?.source_id || randomUUID(),
          (previous?.source_version || 0) + 1,
          previous?.id || null,
        ],
      );
      if (previous) {
        await tx.query("update documents set superseded_by=$2,student_access=false where id=$1", [
          previous.id,
          doc.id,
        ]);
        await tx.query("update files set student_access=false where id=$1", [previous.file_id]);
        await retireSourceWork(tx, previous.id, "Kaynak yeni sürümle değiştirildi.");
      }
      await tx.query(
        "insert into background_jobs(course_id,created_by,kind,payload) values($1,$2,'pdf_extract',$3)",
        [courseId, user.id, JSON.stringify({ document_id: doc.id })],
      );
      return { ...doc, duplicate: false };
    });
    if (result.duplicate) await deleteStoredFile(key);
    return result;
  } catch (err) {
    await deleteStoredFile(key);
    throw err;
  }
}
export async function listDocuments(tx: Database, user: User, courseId: string) {
  await ownCourse(tx, user, courseId);
  return tx.query<Document>(
    `select d.*,${sourceAllowedSql} allowed from documents d where course_id=$1 and status!='deleted' and superseded_by is null order by created_at desc`,
    [courseId],
  );
}
export async function documentDetail(tx: Database, user: User, courseId: string, id: string) {
  await ownCourse(tx, user, courseId);
  const [doc] = await tx.query<Document>(
    `select d.*,${sourceAllowedSql} allowed from documents d where id=$1 and course_id=$2 and status!='deleted'`,
    [id, courseId],
  );
  assert(doc, "Belge bulunamadı.", 404);
  const chunks = await tx.query(
    "select id,page,chunk_index,text,heading from document_chunks where document_id=$1 order by chunk_index",
    [id],
  );
  const versions = await tx.query<Document>(
    "select * from documents where course_id=$1 and source_id=$2 and status!='deleted' order by source_version desc",
    [courseId, doc.source_id],
  );
  return { ...doc, chunks, versions };
}
export async function reprocessDocument(tx: Database, user: User, courseId: string, id: string) {
  await ownCourse(tx, user, courseId);
  await tx.query("select id from courses where id=$1 for update", [courseId]);
  const doc = await documentDetail(tx, user, courseId, id);
  assert(doc.source_kind === "pdf", "Web kaynağını izinli adresinden yeniden oku.", 409);
  assert(!doc.superseded_by, "Eski sürümü yeniden işlemek yerine güncel kaynağı seç.", 409);
  const active = await tx.query(
    "select id from background_jobs where course_id=$1 and kind='pdf_extract' and payload->>'document_id'=$2 and status in ('queued','processing')",
    [courseId, id],
  );
  assert(!active.length, "Bu belge zaten işleniyor.", 409);
  await tx.query("update documents set status='queued',error_message=null where id=$1", [doc.id]);
  return (
    await tx.query(
      "insert into background_jobs(course_id,created_by,kind,payload) values($1,$2,'pdf_extract',$3) returning *",
      [courseId, user.id, JSON.stringify({ document_id: id })],
    )
  )[0];
}
export async function setDocumentAccess(
  tx: Database,
  user: User,
  courseId: string,
  id: string,
  input: unknown,
) {
  await ownCourse(tx, user, courseId);
  await tx.query("select id from courses where id=$1 for update", [courseId]);
  const doc = await documentDetail(tx, user, courseId, id),
    data = z.object({ student_access: z.boolean() }).parse(input);
  assert(!doc.superseded_by, "Öğrenci erişimi için güncel kaynak sürümünü seç.", 409);
  assert(
    !data.student_access || doc.allowed,
    "Web kaynağının güncel izniyle yeniden okunması gerekiyor.",
    409,
  );
  await tx.query("update documents set student_access=$2 where id=$1", [id, data.student_access]);
  await tx.query("update files set student_access=$2 where id=$1", [
    doc.file_id,
    data.student_access,
  ]);
  return { updated: true };
}

export async function deleteDocument(tx: Database, user: User, courseId: string, id: string) {
  await ownCourse(tx, user, courseId);
  await tx.query("select id from courses where id=$1 for update", [courseId]);
  const doc = await documentDetail(tx, user, courseId, id);
  assert(!doc.superseded_by, "Kaynağı kaldırmak için güncel sürümünü seç.", 409);
  if (doc.source_permission_id) {
    await tx.query(
      "update source_permissions set enabled=false,revision=revision+1,updated_at=now() where id=$1",
      [doc.source_permission_id],
    );
    const { retireWebSources } = await import("./web-sources");
    await retireWebSources(tx, courseId, doc.source_permission_id);
  }
  const removed = await tx.query<{ id: string; file_id: string; purge_after: string }>(
    "update documents set status='deleted',student_access=false,deleted_at=now(),purge_after=now()+interval '30 days' where source_id=$1 and course_id=$2 and status!='deleted' returning id,file_id,purge_after",
    [doc.source_id, courseId],
  );
  for (const version of removed) {
    await tx.query("update files set student_access=false where id=$1", [version.file_id]);
    await retireSourceWork(tx, version.id, "Kaynak kaldırıldı.");
    await tx.query(
      "insert into background_jobs(course_id,created_by,kind,payload,available_at) values($1,$2,'file_cleanup',$3,$4)",
      [courseId, user.id, JSON.stringify({ document_id: version.id }), version.purge_after],
    );
  }
  return { deleted: true, versions: removed.length, retention_days: 30 };
}

export async function retireSourceWork(tx: Database, id: string, message: string) {
  const ids = JSON.stringify([id]);
  await tx.query(
    "update curriculum_drafts d set status='rejected' where d.status!='approved' and exists(select 1 from background_jobs j where j.id=d.job_id and (j.payload->>'document_id'=$1 or j.payload->'document_ids' @> $2::jsonb))",
    [id, ids],
  );
  await tx.query(
    "update background_jobs set status='needs_input',error_message=$3 where status='queued' and kind!='file_cleanup' and (payload->>'document_id'=$1 or payload->'document_ids' @> $2::jsonb)",
    [id, ids, message],
  );
}
