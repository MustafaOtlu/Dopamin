import { z } from "zod";
import type { Database } from "@/lib/db";
import { assert } from "@/lib/errors";
import { ownCourse } from "@/modules/courses/service";
import type { User } from "@/types/domain";
import { canonicalWebUrl } from "./web-reader";
import { retireSourceWork } from "./service";

export const sourceAllowedSql = `(d.source_kind='pdf' or web_source_allowed(d.course_id,d.source_permission_id,d.source_permission_revision,d.source_policy_revision))`;
export interface WebPermission {
  id: string;
  course_id: string;
  url: string;
  title: string;
  enabled: boolean;
  revision: number;
  updated_at: string;
  document_id?: string | null;
  allowed?: boolean | null;
}
export interface SourcePolicy {
  source_mode: "documents_only" | "approved_web";
  source_policy_revision: number;
}
export async function webSources(tx: Database, user: User, courseId: string) {
  await ownCourse(tx, user, courseId);
  const [policy] = await tx.query<SourcePolicy>(
    "select source_mode,source_policy_revision from courses where id=$1",
    [courseId],
  );
  const permissions = await tx.query<WebPermission>(
    `select p.*,d.id document_id,${sourceAllowedSql} allowed
    from source_permissions p left join documents d on d.source_permission_id=p.id and d.superseded_by is null and d.status!='deleted'
    where p.course_id=$1 order by p.created_at desc`,
    [courseId],
  );
  return { ...policy, permissions };
}
async function lockCourse(tx: Database, user: User, courseId: string) {
  await ownCourse(tx, user, courseId);
  const [course] = await tx.query<SourcePolicy>(
    "select source_mode,source_policy_revision from courses where id=$1 and not archived for update",
    [courseId],
  );
  assert(course, "Arşivdeki dersin kaynak izinleri değiştirilemez.", 409);
  return course;
}
export async function retireWebSources(tx: Database, courseId: string, permissionId?: string) {
  const docs = await tx.query<{ id: string; file_id: string }>(
    "select id,file_id from documents where course_id=$1 and source_kind='web' and ($2::uuid is null or source_permission_id=$2)",
    [courseId, permissionId || null],
  );
  for (const doc of docs) {
    await tx.query("update documents set student_access=false where id=$1", [doc.id]);
    await tx.query("update files set student_access=false where id=$1", [doc.file_id]);
    await retireSourceWork(
      tx,
      doc.id,
      "Web kaynağının izni değişti. Güncel izinle kaynağı yeniden oku.",
    );
  }
  await tx.query(
    `update background_jobs set status='needs_input',error_message='Web kaynağının izni değişti. Güncel izinle yeniden oku.'
    where course_id=$1 and kind='web_fetch' and status='queued' and ($2::text is null or payload->>'permission_id'=$2)`,
    [courseId, permissionId || null],
  );
}
export async function setSourcePolicy(tx: Database, user: User, courseId: string, input: unknown) {
  const data = z
    .object({
      mode: z.enum(["documents_only", "approved_web"]),
      expected_revision: z.number().int().nonnegative(),
    })
    .parse(input);
  const course = await lockCourse(tx, user, courseId);
  assert(
    course.source_policy_revision === data.expected_revision,
    "Kaynak tercihi başka bir yerde değişti. Ekranı yenile.",
    409,
  );
  if (course.source_mode === data.mode) return course;
  const [policy] = await tx.query<SourcePolicy>(
    "update courses set source_mode=$2,source_policy_revision=source_policy_revision+1 where id=$1 returning source_mode,source_policy_revision",
    [courseId, data.mode],
  );
  await retireWebSources(tx, courseId);
  return policy;
}
export async function addWebSource(tx: Database, user: User, courseId: string, input: unknown) {
  const data = z
    .object({ url: z.string().trim().min(1).max(2000), title: z.string().trim().min(2).max(200) })
    .parse(input);
  const url = canonicalWebUrl(data.url);
  const course = await lockCourse(tx, user, courseId);
  assert(course.source_mode === "approved_web", "Önce izinli web kaynaklarını etkinleştir.", 409);
  const permissions = await tx.query<WebPermission>(
    "select * from source_permissions where course_id=$1",
    [courseId],
  );
  assert(
    !permissions.some((p) => p.url === url),
    "Bu adres zaten kayıtlı. İznini açıp yeniden okuyabilirsin.",
    409,
  );
  assert(
    permissions.filter((p) => p.enabled).length < 20,
    "Bir derste en fazla 20 web kaynağına aynı anda izin verilebilir.",
    409,
  );
  const [permission] = await tx.query<WebPermission>(
    "insert into source_permissions(course_id,url,title) values($1,$2,$3) returning *",
    [courseId, url, data.title],
  );
  await enqueueWebFetch(tx, user, courseId, permission, course);
  return permission;
}
export async function setWebPermission(
  tx: Database,
  user: User,
  courseId: string,
  id: string,
  input: unknown,
) {
  const data = z
    .object({ enabled: z.boolean(), expected_revision: z.number().int().positive() })
    .parse(input);
  const course = await lockCourse(tx, user, courseId);
  const [permission] = await tx.query<WebPermission>(
    "select * from source_permissions where id=$1 and course_id=$2 for update",
    [id, courseId],
  );
  assert(permission, "Kaynak izni bulunamadı.", 404);
  assert(
    permission.revision === data.expected_revision,
    "Kaynak izni başka bir yerde değişti. Ekranı yenile.",
    409,
  );
  if (permission.enabled === data.enabled) return permission;
  if (data.enabled) {
    assert(course.source_mode === "approved_web", "Önce izinli web kaynaklarını etkinleştir.", 409);
    const [{ total }] = await tx.query<{ total: number }>(
      "select count(*)::int total from source_permissions where course_id=$1 and enabled",
      [courseId],
    );
    assert(total < 20, "Bir derste en fazla 20 web kaynağına aynı anda izin verilebilir.", 409);
  }
  const [updated] = await tx.query<WebPermission>(
    "update source_permissions set enabled=$2,revision=revision+1,updated_at=now() where id=$1 returning *",
    [id, data.enabled],
  );
  await retireWebSources(tx, courseId, id);
  return updated;
}
async function enqueueWebFetch(
  tx: Database,
  user: User,
  courseId: string,
  permission: WebPermission,
  course: SourcePolicy,
) {
  const active = await tx.query(
    "select id from background_jobs where course_id=$1 and kind='web_fetch' and payload->>'permission_id'=$2 and status in ('queued','processing')",
    [courseId, permission.id],
  );
  assert(!active.length, "Bu web kaynağı zaten okunuyor.", 409);
  const [job] = await tx.query(
    "insert into background_jobs(course_id,created_by,kind,payload) values($1,$2,'web_fetch',$3) returning *",
    [
      courseId,
      user.id,
      JSON.stringify({
        permission_id: permission.id,
        permission_revision: permission.revision,
        source_policy_revision: course.source_policy_revision,
      }),
    ],
  );
  return job;
}
export async function queueWebFetch(tx: Database, user: User, courseId: string, id: string) {
  const course = await lockCourse(tx, user, courseId);
  const [permission] = await tx.query<WebPermission>(
    "select * from source_permissions where id=$1 and course_id=$2",
    [id, courseId],
  );
  assert(permission, "Kaynak izni bulunamadı.", 404);
  assert(
    course.source_mode === "approved_web" && permission.enabled,
    "Web kaynağının izni açık olmalı.",
    409,
  );
  return enqueueWebFetch(tx, user, courseId, permission, course);
}
export async function assertWebPermission(
  tx: Database,
  courseId: string,
  payload: {
    permission_id?: string;
    permission_revision?: number;
    source_policy_revision?: number;
  },
) {
  const [permission] = await tx.query<WebPermission>(
    `select p.* from source_permissions p where p.id=$1 and p.course_id=$2
    and web_source_allowed($2,p.id,$3,$4)`,
    [payload.permission_id, courseId, payload.permission_revision, payload.source_policy_revision],
  );
  assert(permission, "Web kaynağının izni artık geçerli değil. Güncel izinle yeniden oku.", 409);
  return permission;
}
