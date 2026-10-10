import { randomBytes } from "node:crypto";
import { z } from "zod";
import { assert } from "@/lib/errors";
import type { Database } from "@/lib/db";
import { requireTeacher, requireStudent } from "@/modules/auth/service";
import type { Course, Objective, User } from "@/types/domain";
import { today } from "@/lib/time";

export async function ownCourse(tx: Database, user: User, id: string) {
  requireTeacher(user);
  const [course] = await tx.query<Course>("select * from courses where id=$1 and owner_id=$2", [
    id,
    user.id,
  ]);
  assert(course, "Ders bulunamadı veya erişim iznin yok.", 404);
  return course;
}
export async function studentCourse(tx: Database, user: User, id: string) {
  requireStudent(user);
  const [course] = await tx.query<Course>(
    "select c.* from courses c join enrollments e on e.course_id=c.id where c.id=$1 and e.user_id=$2 and not c.archived",
    [id, user.id],
  );
  assert(course, "Ders bulunamadı veya bu sınıfa kayıtlı değilsin.", 404);
  return course;
}
export async function listCourses(tx: Database, user: User) {
  return tx.query<Course>(
    `select c.*,
    (select count(*)::int from enrollments e where e.course_id=c.id) student_count,
    (select count(*)::int from activities a where a.course_id=c.id and a.published_version is not null and a.status!='archived') activity_count,
    (select i.code from class_invites i where i.course_id=c.id and not i.revoked and i.expires_at>now() order by created_at desc limit 1) invite_code,
    (select i.expires_at from class_invites i where i.course_id=c.id and not i.revoked and i.expires_at>now() order by created_at desc limit 1) invite_expires_at
    from courses c where ${user.role === "teacher" ? "c.owner_id=$1" : "exists(select 1 from enrollments e where e.course_id=c.id and e.user_id=$1)"} and not c.archived order by c.created_at desc`,
    [user.id],
  );
}
const courseSchema = z.object({
  title: z.string().trim().min(2).max(140),
  description: z.string().max(2000).default(""),
  code: z.string().max(20).default(""),
  term: z.string().trim().min(2).max(100),
  color: z.enum(["violet", "blue", "orange", "teal"]).default("violet"),
});
export async function updateCourse(tx: Database, user: User, id: string, input: unknown) {
  const course = await ownCourse(tx, user, id);
  assert(!course.archived, "Önce arşivdeki dersi geri aç.", 409);
  const data = courseSchema.parse(input);
  return (
    await tx.query<Course>(
      "update courses set title=$2,description=$3,code=$4,term=$5,color=$6 where id=$1 returning *",
      [id, data.title, data.description, data.code, data.term, data.color],
    )
  )[0];
}
export async function archivedCourses(tx: Database, user: User) {
  requireTeacher(user);
  return tx.query<Course>(
    "select c.*,(select count(*)::int from enrollments e where e.course_id=c.id) student_count from courses c where c.owner_id=$1 and c.archived order by c.created_at desc",
    [user.id],
  );
}
export async function updatePublicationPolicy(
  tx: Database,
  user: User,
  id: string,
  input: unknown,
) {
  await ownCourse(tx, user, id);
  const data = z
    .object({
      publish_mode: z.enum(["review", "automatic"]),
      automatic_consent: z.boolean().default(false),
    })
    .parse(input);
  assert(
    data.publish_mode !== "automatic" || data.automatic_consent,
    "Otomatik yayın için açık onay ver.",
  );
  const [course] = await tx.query<Course>(
    `update courses set publish_mode=$2,publication_policy_revision=publication_policy_revision+1,
    automatic_consent_at=case when $2='automatic' then now() else null end,
    automatic_consent_by=case when $2='automatic' then $3::uuid else null end
    where id=$1 and not archived returning *`,
    [id, data.publish_mode, user.id],
  );
  assert(course, "Önce arşivdeki dersi geri aç.", 409);
  return course;
}
export async function archiveCourse(tx: Database, user: User, id: string, archived: boolean) {
  await ownCourse(tx, user, id);
  await tx.query("select id from courses where id=$1 for update", [id]);
  await tx.query("update courses set archived=$2 where id=$1", [id, archived]);
  if (archived) await tx.query("update class_invites set revoked=true where course_id=$1", [id]);
  await tx.query("select invalidate_course_plans($1)", [id]);
  return { archived };
}
export async function createCourse(tx: Database, user: User, input: unknown) {
  requireTeacher(user);
  const data = courseSchema.parse(input);
  const [course] = await tx.query<Course>(
    "insert into courses(owner_id,title,description,code,term,color) values($1,$2,$3,$4,$5,$6) returning *",
    [user.id, data.title, data.description, data.code, data.term, data.color],
  );
  await tx.query("insert into curriculum_versions(course_id,version) values($1,1)", [course.id]);
  const invite = randomBytes(4).toString("hex").toUpperCase();
  await tx.query("insert into class_invites(course_id,code) values($1,$2)", [course.id, invite]);
  return { ...course, invite_code: invite };
}
export async function joinCourse(tx: Database, user: User, input: unknown) {
  requireStudent(user);
  const { code } = z
    .object({
      code: z
        .string()
        .trim()
        .min(6)
        .max(20)
        .transform((s) => s.toUpperCase()),
    })
    .parse(input);
  try {
    const [row] = await tx.query<{ course_id: string }>("select join_by_code($1) as course_id", [
      code,
    ]);
    const { invalidateUnstarted } = await import("@/modules/scheduling/service");
    await invalidateUnstarted(tx, user.id);
    return row;
  } catch {
    assert(false, "Sınıf kodu geçersiz, süresi dolmuş veya iptal edilmiş.");
  }
}
export async function rotateInvite(tx: Database, user: User, courseId: string, revokeOnly = false) {
  await ownCourse(tx, user, courseId);
  await tx.query("select id from courses where id=$1 for update", [courseId]);
  await tx.query("update class_invites set revoked=true where course_id=$1", [courseId]);
  if (revokeOnly) return { code: null };
  const code = randomBytes(4).toString("hex").toUpperCase();
  await tx.query("insert into class_invites(course_id,code) values($1,$2)", [courseId, code]);
  return { code };
}
export async function listObjectives(tx: Database, user: User, courseId: string) {
  if (user.role === "teacher") await ownCourse(tx, user, courseId);
  else await studentCourse(tx, user, courseId);
  return tx.query<Objective>(
    `select o.*,t.title topic_title,t.week,t.scheduled_date::text,t.accessible,m.state mastery_state,m.confidence,
    exists(select 1 from gap_reports g where g.user_id=$2 and g.objective_id=o.id and not g.resolved) gap_reported
    from objectives o join topics t on t.id=o.topic_id join curriculum_versions v on v.id=t.curriculum_id
    left join objective_mastery m on m.objective_id=o.id and m.user_id=$2
    where o.course_id=$1 and v.status='published' order by t.week,t.title,o.title`,
    [courseId, user.id],
  );
}
export async function createObjective(tx: Database, user: User, courseId: string, input: unknown) {
  await ownCourse(tx, user, courseId);
  const data = z
    .object({
      topic_title: z.string().trim().min(2).max(200),
      title: z.string().trim().min(2).max(500),
      week: z.number().int().min(1).max(52),
      scheduled_date: z.iso.date().default(today()),
      importance: z.number().int().min(1).max(3).default(2),
      accessible: z.boolean().default(true),
    })
    .parse(input);
  const [curriculum] = await tx.query<{ id: string }>(
    "select id from curriculum_versions where course_id=$1 and status='published' order by version desc limit 1",
    [courseId],
  );
  let [topic] = await tx.query<{ id: string }>(
    "select id from topics where curriculum_id=$1 and title=$2 and week=$3",
    [curriculum.id, data.topic_title, data.week],
  );
  if (!topic)
    [topic] = await tx.query<{ id: string }>(
      "insert into topics(course_id,curriculum_id,title,week,scheduled_date,accessible) values($1,$2,$3,$4,$5,$6) returning id",
      [courseId, curriculum.id, data.topic_title, data.week, data.scheduled_date, data.accessible],
    );
  const [objective] = await tx.query<Objective>(
    "insert into objectives(course_id,topic_id,title,importance) values($1,$2,$3,$4) returning *",
    [courseId, topic.id, data.title, data.importance],
  );
  return objective;
}
export async function removeStudent(tx: Database, user: User, courseId: string, studentId: string) {
  await ownCourse(tx, user, courseId);
  await tx.query("select invalidate_course_plans($1)", [courseId]);
  await tx.query("delete from enrollments where course_id=$1 and user_id=$2", [
    courseId,
    studentId,
  ]);
  return { removed: true };
}
