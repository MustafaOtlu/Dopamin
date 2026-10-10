import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { Database, RootDatabase } from "@/lib/db";
import { asUser } from "@/lib/db";
import { assert } from "@/lib/errors";
import { ownCourse, studentCourse } from "@/modules/courses/service";
import { requireStudent } from "@/modules/auth/service";
import { newSession } from "@/modules/learning/service";
import { putFile, deleteStoredFile } from "@/modules/documents/storage";
import { detectType, MAX_FILE_SIZE } from "@/modules/documents/service";
import { createHash } from "node:crypto";
import type { User, LearningSession } from "@/types/domain";
export interface Assignment {
  id: string;
  course_id: string;
  title: string;
  description: string;
  kind: "interactive" | "traditional";
  status: "draft" | "published" | "closed";
  due_at: string;
  allow_late: boolean;
  activity_version_ids: string[];
  target_ids: string[];
  submission_status?: Submission["status"] | null;
  submission_count?: number;
  target_count?: number;
}
export interface Submission {
  id: string;
  assignment_id: string;
  course_id: string;
  user_id: string;
  status: "in_progress" | "submitted" | "reviewed" | "returned" | "withdrawn";
  current_revision: number;
  session_id: string | null;
  submitted_at: string | null;
  display_name?: string;
}
const schema = z.object({
  title: z.string().trim().min(2).max(180),
  description: z.string().max(10000).default(""),
  kind: z.enum(["interactive", "traditional"]),
  due_at: z.iso.datetime({ offset: true }),
  allow_late: z.boolean().default(false),
  activity_version_ids: z.array(z.uuid()).max(500).default([]),
  target_ids: z.array(z.uuid()).max(2000).default([]),
  file_ids: z.array(z.uuid()).max(20).default([]),
});
export async function listAssignments(tx: Database, user: User, courseId: string) {
  if (user.role === "teacher") await ownCourse(tx, user, courseId);
  else await studentCourse(tx, user, courseId);
  return tx.query<Assignment>(
    `select a.*,(select s.status from submissions s where s.assignment_id=a.id and s.user_id=$2) submission_status,
    (select count(*)::int from submissions s where s.assignment_id=a.id and s.status in ('submitted','reviewed','returned')) submission_count,
    (select count(*)::int from assignment_targets t where t.assignment_id=a.id) target_count
    from assignments a where a.course_id=$1 order by a.created_at desc`,
    [courseId, user.id],
  );
}
export async function saveAssignment(
  tx: Database,
  user: User,
  courseId: string,
  input: unknown,
  id?: string,
) {
  await ownCourse(tx, user, courseId);
  const data = schema.parse(input);
  assert(
    new Set(data.activity_version_ids).size === data.activity_version_ids.length,
    "Etkinlikleri bir kez seç.",
  );
  if (data.kind === "interactive") {
    assert(data.activity_version_ids.length > 0, "En az bir yayımlanmış etkinlik seç.");
    const versions = await tx.query<{ id: string }>(
      "select v.id from activity_versions v join activities a on a.id=v.activity_id where v.id=any($1::uuid[]) and v.course_id=$2 and v.published_at is not null and a.status!='archived'",
      [data.activity_version_ids, courseId],
    );
    assert(
      versions.length === data.activity_version_ids.length,
      "Yalnız bu dersin yayımlanmış etkinliklerini seç.",
    );
  } else assert(!data.activity_version_ids.length, "Geleneksel ödevde etkinlik seçilmez.");
  const targetIds = [...new Set(data.target_ids)];
  if (targetIds.length) {
    const targets = await tx.query(
      "select user_id from enrollments where course_id=$1 and user_id=any($2::uuid[])",
      [courseId, targetIds],
    );
    assert(targets.length === targetIds.length, "Hedef öğrenciler bu sınıfta olmalı.");
  }
  if (data.file_ids.length) {
    const files = await tx.query(
      "select f.id from files f join documents d on d.file_id=f.id where f.id=any($1::uuid[]) and f.course_id=$2 and d.status='ready' and d.source_kind='pdf' and d.superseded_by is null",
      [data.file_ids, courseId],
    );
    assert(
      files.length === new Set(data.file_ids).size,
      "Ek kaynaklar bu derste hazır PDF olmalı.",
    );
  }
  let assignment: Assignment;
  const params = [
    courseId,
    user.id,
    data.title,
    data.description,
    data.kind,
    data.due_at,
    data.allow_late,
    JSON.stringify(data.activity_version_ids),
    JSON.stringify(targetIds),
  ];
  if (id) {
    const [old] = await tx.query<Assignment>(
      "select * from assignments where id=$1 and course_id=$2 for update",
      [id, courseId],
    );
    assert(old && old.status === "draft", "Yalnız taslak ödev düzenlenebilir.", 409);
    [assignment] = await tx.query<Assignment>(
      "update assignments set title=$3,description=$4,kind=$5,due_at=$6,allow_late=$7,activity_version_ids=$8,target_ids=$9 where id=$10 and course_id=$1 and created_by=$2 returning *",
      [...params, id],
    );
    await tx.query("delete from assignment_resources where assignment_id=$1", [id]);
  } else
    [assignment] = await tx.query<Assignment>(
      "insert into assignments(course_id,created_by,title,description,kind,due_at,allow_late,activity_version_ids,target_ids) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *",
      params,
    );
  for (const fileId of [...new Set(data.file_ids)])
    await tx.query(
      "insert into assignment_resources(assignment_id,course_id,file_id) values($1,$2,$3)",
      [assignment.id, courseId, fileId],
    );
  return assignment;
}
export async function publishAssignment(tx: Database, user: User, courseId: string, id: string) {
  await ownCourse(tx, user, courseId);
  const [a] = await tx.query<Assignment>(
    "select * from assignments where id=$1 and course_id=$2 for update",
    [id, courseId],
  );
  assert(a, "Ödev bulunamadı.", 404);
  if (a.status === "published") return a;
  assert(a.status === "draft", "Kapalı ödev yayımlanamaz.", 409);
  const targets = await tx.query<{ user_id: string }>(
    `select user_id from enrollments where course_id=$1 ${a.target_ids.length ? "and user_id=any($2::uuid[])" : ""}`,
    a.target_ids.length ? [courseId, a.target_ids] : [courseId],
  );
  assert(targets.length, "Bu ödev için kayıtlı öğrenci yok.");
  for (const target of targets)
    await tx.query(
      "insert into assignment_targets(assignment_id,user_id) values($1,$2) on conflict do nothing",
      [id, target.user_id],
    );
  return (
    await tx.query<Assignment>(
      "update assignments set status='published',published_at=now() where id=$1 returning *",
      [id],
    )
  )[0];
}
export async function assignmentDetail(tx: Database, user: User, courseId: string, id: string) {
  if (user.role === "teacher") await ownCourse(tx, user, courseId);
  else await studentCourse(tx, user, courseId);
  const [assignment] = await tx.query<Assignment>(
    "select * from assignments where id=$1 and course_id=$2",
    [id, courseId],
  );
  assert(assignment, "Ödev bulunamadı.", 404);
  const submissions = await tx.query<Submission>(
    "select s.*,p.display_name from submissions s join profiles p on p.id=s.user_id where s.assignment_id=$1 order by s.submitted_at desc nulls last",
    [id],
  );
  const versions = await tx.query(
    "select v.*,f.original_name from submission_versions v join submissions s on s.id=v.submission_id left join files f on f.id=v.file_id where s.assignment_id=$1 order by v.revision desc",
    [id],
  );
  const feedback = await tx.query(
    "select f.* from assignment_feedback f join submissions s on s.id=f.submission_id where s.assignment_id=$1 order by f.created_at desc",
    [id],
  );
  const resources = await tx.query(
    "select f.id,f.original_name from assignment_resources r join files f on f.id=r.file_id where r.assignment_id=$1",
    [id],
  );
  return { assignment, submissions, versions, feedback, resources };
}
export async function writableAssignment(tx: Database, user: User, id: string, lock = false) {
  requireStudent(user);
  let [a] = await tx.query<Assignment>("select * from assignments where id=$1", [id]);
  assert(a, "Ödev bulunamadı.", 404);
  if (lock) {
    await tx.query("select lock_assignment($1)", [id]);
    [a] = await tx.query<Assignment>("select * from assignments where id=$1", [id]);
    assert(a, "Ödev bulunamadı.", 404);
  }
  await studentCourse(tx, user, a.course_id);
  assert(a.status === "published", "Bu ödev teslimlere kapalı.", 409);
  assert(
    a.allow_late || new Date(a.due_at).getTime() >= Date.now(),
    "Teslim tarihi geçti. Akademisyenin geç teslimi açabilir.",
    409,
  );
  return a;
}
async function lockSubmission(tx: Database, user: User, a: Assignment) {
  await tx.query("select pg_advisory_xact_lock(hashtext($1))", [`assignment:${a.id}:${user.id}`]);
  return (
    await tx.query<Submission>(
      "select * from submissions where assignment_id=$1 and user_id=$2 for update",
      [a.id, user.id],
    )
  )[0];
}
export async function startAssignment(tx: Database, user: User, id: string) {
  const a = await writableAssignment(tx, user, id, true);
  assert(a.kind === "interactive", "Bu ödev dosya, metin veya bağlantı ile teslim edilir.");
  const old = await lockSubmission(tx, user, a);
  if (old?.status === "in_progress" && old.session_id)
    return (
      await tx.query<LearningSession>("select * from learning_sessions where id=$1", [
        old.session_id,
      ])
    )[0];
  assert(
    !old || ["returned", "withdrawn"].includes(old.status),
    "Teslimin inceleme bekliyor veya değerlendirildi.",
    409,
  );
  const session = await newSession(tx, user, a.activity_version_ids, "assignment", a.course_id);
  await tx.query(
    "insert into submissions(assignment_id,course_id,user_id,status,session_id) values($1,$2,$3,'in_progress',$4) on conflict(assignment_id,user_id) do update set status='in_progress',session_id=excluded.session_id",
    [a.id, a.course_id, user.id, session.id],
  );
  return session;
}
export async function assertAssignmentSession(tx: Database, user: User, sessionId: string) {
  const [s] = await tx.query<Submission>(
    "select * from submissions where session_id=$1 and user_id=$2",
    [sessionId, user.id],
  );
  assert(s && s.status === "in_progress", "Bu ödev oturumu teslim edilmiş veya kapatılmış.", 409);
  return writableAssignment(tx, user, s.assignment_id, true);
}
export async function completeAssignment(tx: Database, user: User, session: LearningSession) {
  const a = await assertAssignmentSession(tx, user, session.id),
    s = await lockSubmission(tx, user, a);
  assert(s.session_id === session.id, "Ödev oturumu değişti.", 409);
  const revision = s.current_revision + 1;
  await tx.query(
    "insert into submission_versions(submission_id,revision,user_id,course_id,request_key,session_id,first_score,late) values($1,$2,$3,$4,$5,$6,$7,$8)",
    [
      s.id,
      revision,
      user.id,
      a.course_id,
      randomUUID(),
      session.id,
      Math.round((session.first_correct / session.items.length) * 100),
      new Date(a.due_at).getTime() < Date.now(),
    ],
  );
  await tx.query(
    "update submissions set status='submitted',current_revision=$2,submitted_at=now() where id=$1",
    [s.id, revision],
  );
}
export async function submitTraditional(tx: Database, user: User, id: string, input: unknown) {
  const data = z
    .object({
      request_key: z.uuid(),
      text: z.string().trim().max(20000).default(""),
      link: z
        .union([
          z.literal(""),
          z.url().refine((s) => /^https?:\/\//i.test(s), "http veya https bağlantısı kullan."),
        ])
        .default(""),
      file_id: z.uuid().optional(),
    })
    .parse(input);
  const [existing] = await tx.query<{ submission_id: string }>(
    "select submission_id from submission_versions where request_key=$1 and user_id=$2",
    [data.request_key, user.id],
  );
  if (existing) {
    const [s] = await tx.query<Submission>(
      "select * from submissions where id=$1 and assignment_id=$2",
      [existing.submission_id, id],
    );
    assert(s, "İşlem anahtarı başka bir teslimde kullanılmış.", 409);
    return s;
  }
  const a = await writableAssignment(tx, user, id, true);
  assert(a.kind === "traditional", "Bu ödev platform içindeki etkinliklerle tamamlanır.");
  assert(data.text || data.link || data.file_id, "Metin, bağlantı veya dosya ekle.");
  let s = await lockSubmission(tx, user, a);
  assert(
    !s || ["returned", "withdrawn"].includes(s.status),
    "Teslimin inceleme bekliyor veya değerlendirildi.",
    409,
  );
  if (data.file_id) {
    const [file] = await tx.query(
      "select id from files where id=$1 and uploaded_by=$2 and assignment_id=$3 and purpose='submission'",
      [data.file_id, user.id, id],
    );
    assert(file, "Bu teslim dosyası sana ve bu ödeve ait olmalı.", 403);
  }
  if (!s)
    [s] = await tx.query<Submission>(
      "insert into submissions(assignment_id,course_id,user_id,status) values($1,$2,$3,'in_progress') returning *",
      [id, a.course_id, user.id],
    );
  const revision = s.current_revision + 1;
  await tx.query(
    "insert into submission_versions(submission_id,revision,user_id,course_id,request_key,text,link,file_id,late) values($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    [
      s.id,
      revision,
      user.id,
      a.course_id,
      data.request_key,
      data.text,
      data.link,
      data.file_id || null,
      new Date(a.due_at).getTime() < Date.now(),
    ],
  );
  return (
    await tx.query<Submission>(
      "update submissions set status='submitted',current_revision=$2,submitted_at=now() where id=$1 returning *",
      [s.id, revision],
    )
  )[0];
}
export async function withdrawSubmission(tx: Database, user: User, id: string) {
  const a = await writableAssignment(tx, user, id, true),
    s = await lockSubmission(tx, user, a);
  assert(
    s && ["submitted", "in_progress"].includes(s.status),
    "Yalnız inceleme başlamamış teslim geri çekilebilir.",
    409,
  );
  return (
    await tx.query<Submission>(
      "update submissions set status='withdrawn' where id=$1 returning *",
      [s.id],
    )
  )[0];
}
export async function reviewSubmission(
  tx: Database,
  user: User,
  courseId: string,
  id: string,
  input: unknown,
) {
  await ownCourse(tx, user, courseId);
  const data = z
    .object({
      feedback: z.string().trim().min(1).max(10000),
      grade: z.number().min(0).max(100).nullable().default(null),
      returned: z.boolean().default(false),
    })
    .parse(input);
  const [s] = await tx.query<Submission>(
    "select * from submissions where id=$1 and course_id=$2 for update",
    [id, courseId],
  );
  assert(s && s.status === "submitted", "Teslim incelemeye hazır değil.", 409);
  await tx.query(
    "insert into assignment_feedback(submission_id,revision,course_id,reviewer_id,grade,feedback,returned) values($1,$2,$3,$4,$5,$6,$7)",
    [s.id, s.current_revision, courseId, user.id, data.grade, data.feedback, data.returned],
  );
  return (
    await tx.query<Submission>("update submissions set status=$2 where id=$1 returning *", [
      id,
      data.returned ? "returned" : "reviewed",
    ])
  )[0];
}
export async function manageAssignment(
  tx: Database,
  user: User,
  courseId: string,
  id: string,
  input: unknown,
) {
  await ownCourse(tx, user, courseId);
  const data = z
    .object({
      status: z.enum(["published", "closed"]).optional(),
      due_at: z.iso.datetime({ offset: true }).optional(),
      allow_late: z.boolean().optional(),
    })
    .parse(input);
  const [a] = await tx.query<Assignment>(
    "select * from assignments where id=$1 and course_id=$2 for update",
    [id, courseId],
  );
  assert(a && a.status !== "draft", "Önce ödevi yayımla.", 409);
  return (
    await tx.query<Assignment>(
      "update assignments set status=$2,due_at=$3,allow_late=$4 where id=$1 returning *",
      [id, data.status || a.status, data.due_at || a.due_at, data.allow_late ?? a.allow_late],
    )
  )[0];
}
export async function uploadSubmissionFile(
  db: RootDatabase,
  user: User,
  courseId: string,
  id: string,
  file: File,
) {
  await asUser(db, user.id, async (tx) => {
    const a = await writableAssignment(tx, user, id);
    assert(
      a.course_id === courseId && a.kind === "traditional",
      "Dosya bu geleneksel ödeve ait olmalı.",
    );
  });
  assert(file.size > 0 && file.size <= MAX_FILE_SIZE, "Dosya en fazla 20 MB olabilir.", 413);
  const bytes = new Uint8Array(await file.arrayBuffer()),
    type = detectType(bytes);
  assert(type, "PDF, PNG veya JPEG dosyası seç.", 415);
  const fileId = randomUUID(),
    key = `${courseId}/${fileId}.${type.extension}`;
  await putFile(key, bytes, type.mime);
  try {
    return await asUser(db, user.id, async (tx) => {
      await writableAssignment(tx, user, id, true);
      await tx.query(
        "insert into files(id,course_id,uploaded_by,purpose,storage_key,original_name,mime_type,byte_size,sha256,assignment_id) values($1,$2,$3,'submission',$4,$5,$6,$7,$8,$9)",
        [
          fileId,
          courseId,
          user.id,
          key,
          file.name.replace(/[\\/]/g, "_").slice(0, 200),
          type.mime,
          file.size,
          createHash("sha256").update(bytes).digest("hex"),
          id,
        ],
      );
      return { id: fileId, name: file.name };
    });
  } catch (err) {
    await deleteStoredFile(key);
    throw err;
  }
}
