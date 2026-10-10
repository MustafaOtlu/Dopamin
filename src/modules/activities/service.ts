import { z } from "zod";
import type { Database } from "@/lib/db";
import { assert, AppError } from "@/lib/errors";
import type { User, GenerationChecks } from "@/types/domain";
import { ownCourse, studentCourse } from "@/modules/courses/service";
import { validateActivity, publicActivity, type StoredActivity } from "./schema";

export async function listActivities(tx: Database, user: User, courseId: string) {
  if (user.role === "teacher") await ownCourse(tx, user, courseId);
  else await studentCourse(tx, user, courseId);
  const rows = await tx.query<
    StoredActivity & {
      status: string;
      objective_title: string;
      topic_title: string;
      generation_checks?: GenerationChecks;
    }
  >(
    `select v.*,${user.role === "student" ? "'published'::text" : "a.status"} status,o.title objective_title,t.title topic_title
    ${user.role === "teacher" ? ", (select r.checks from generation_reviews r where r.version_id=v.id limit 1) generation_checks" : ""}
    from activities a join activity_versions v on v.activity_id=a.id and v.version=${user.role === "student" ? "a.published_version" : "a.current_version"}
    join objectives o on o.id=v.objective_id join topics t on t.id=o.topic_id
    where a.course_id=$1 ${user.role === "student" ? "and a.published_version is not null and a.status!='archived' and t.accessible" : ""} order by a.created_at desc`,
    [courseId],
  );
  return rows.map((a) =>
    user.role === "teacher"
      ? a
      : {
          ...publicActivity(a),
          status: a.status,
          objective_title: a.objective_title,
          topic_title: a.topic_title,
        },
  );
}
export async function saveActivity(
  tx: Database,
  user: User,
  courseId: string,
  input: unknown,
  activityId?: string,
) {
  await ownCourse(tx, user, courseId);
  const data = z.object({ objective_id: z.uuid(), activity: z.unknown() }).parse(input);
  await tx.query("select id from courses where id=$1 for update", [courseId]);
  let activity;
  try {
    activity = validateActivity(data.activity);
  } catch (err) {
    if (err instanceof z.ZodError) throw err;
    throw new AppError(400, (err as Error).message);
  }
  assert(
    (
      await tx.query("select id from objectives where id=$1 and course_id=$2", [
        data.objective_id,
        courseId,
      ])
    ).length,
    "Kazanım bu derse ait olmalı.",
  );
  let id: string, version: number;
  if (activity.kind === "region") {
    const fileId = activity.content.image_url.split("/").at(-1);
    assert(
      (
        await tx.query(
          "select id from files where id=$1 and course_id=$2 and purpose='image' and student_access",
          [fileId, courseId],
        )
      ).length,
      "Görsel derse ait ve öğrencilere erişilebilir olmalı.",
    );
  }
  if (activityId) {
    const [existing] = await tx.query<{ id: string; current_version: number }>(
      "select id,current_version from activities where id=$1 and course_id=$2 for update",
      [activityId, courseId],
    );
    assert(existing, "Etkinlik bulunamadı.", 404);
    id = existing.id;
    version = existing.current_version + 1;
    await tx.query(
      "update activities set current_version=$2,objective_id=$3,status='draft' where id=$1",
      [id, version, data.objective_id],
    );
  } else {
    const [created] = await tx.query<{ id: string }>(
      "insert into activities(course_id,objective_id,created_by) values($1,$2,$3) returning id",
      [courseId, data.objective_id, user.id],
    );
    id = created.id;
    version = 1;
  }
  const [saved] = await tx.query<StoredActivity>(
    `insert into activity_versions(activity_id,course_id,version,kind,title,instruction,content,answer_key,explanation,difficulty,source_refs,objective_id)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning *`,
    [
      id,
      courseId,
      version,
      activity.kind,
      activity.title,
      activity.instruction,
      JSON.stringify(activity.content),
      JSON.stringify(activity.answer_key),
      activity.explanation,
      activity.difficulty,
      JSON.stringify(activity.source_refs),
      data.objective_id,
    ],
  );
  return { ...saved, objective_id: data.objective_id };
}
export async function publishActivity(
  tx: Database,
  user: User,
  courseId: string,
  activityId: string,
  automatic?: { method: "automatic"; version_id: string },
) {
  await ownCourse(tx, user, courseId);
  await tx.query("select id from courses where id=$1 for update", [courseId]);
  const [activity] = await tx.query<StoredActivity>(
    `select v.* from activities a join activity_versions v on v.activity_id=a.id and v.version=a.current_version where a.id=$1 and a.course_id=$2 for update of a`,
    [activityId, courseId],
  );
  assert(activity, "Etkinlik bulunamadı.", 404);
  if (automatic)
    assert(activity.id === automatic.version_id, "İncelenen soru sürümü artık geçerli değil.", 409);
  validateActivity(activity);
  if (activity.source_refs.length) {
    const { loadSources } = await import("@/modules/ai/service");
    const { verifyCitations } = await import("@/modules/ai/contracts");
    const chunks = await loadSources(
      tx,
      courseId,
      [...new Set(activity.source_refs.map((s) => s.document_id))],
      null,
    );
    verifyCitations(activity.source_refs, chunks);
  }
  if (!activity.published_at)
    await tx.query("update activity_versions set published_at=now() where id=$1", [activity.id]);
  await tx.query("update activities set status='published',published_version=$2 where id=$1", [
    activityId,
    activity.version,
  ]);
  if (!automatic)
    await tx.query(
      `update generation_reviews set status='approved',reviewed_by=$2,reviewed_at=now(),
    checks=checks || '{"publication_method":"teacher"}'::jsonb
    where activity_id=$1 and version_id=$3 and status='pending'`,
      [activityId, user.id, activity.id],
    );
  await tx.query("select invalidate_course_plans($1)", [courseId]);
  return { published: true };
}
