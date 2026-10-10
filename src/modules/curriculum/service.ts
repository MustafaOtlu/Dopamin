import { z } from "zod";
import type { Database } from "@/lib/db";
import type { User } from "@/types/domain";
import { ownCourse } from "@/modules/courses/service";
import { assert } from "@/lib/errors";
export async function reviseCurriculum(tx: Database, user: User, courseId: string, input: unknown) {
  await ownCourse(tx, user, courseId);
  await tx.query("select id from courses where id=$1 for update", [courseId]);
  const data = z
    .object({
      topics: z
        .array(
          z.object({
            id: z.uuid(),
            week: z.number().int().min(1).max(52),
            scheduled_date: z.iso.date(),
            accessible: z.boolean(),
          }),
        )
        .min(1)
        .max(200),
    })
    .parse(input);
  const [current] = await tx.query<{ id: string; version: number }>(
    "select id,version from curriculum_versions where course_id=$1 and status='published' order by version desc limit 1 for update",
    [courseId],
  );
  const topics = await tx.query<{
    id: string;
    title: string;
    week: number;
    scheduled_date: string;
    accessible: boolean;
  }>("select *,scheduled_date::text from topics where curriculum_id=$1", [current.id]);
  assert(
    data.topics.every((t) => topics.some((old) => old.id === t.id)),
    "Konu bu müfredat sürümüne ait olmalı.",
  );
  const objectives = await tx.query("select * from objectives where course_id=$1", [courseId]);
  await tx.query("update curriculum_versions set status='archived',snapshot=$2 where id=$1", [
    current.id,
    JSON.stringify({ topics, objectives }),
  ]);
  const [next] = await tx.query<{ id: string }>(
    "insert into curriculum_versions(course_id,version) values($1,$2) returning id",
    [courseId, current.version + 1],
  );
  for (const topic of topics) {
    const changes = data.topics.find((t) => t.id === topic.id) || topic;
    const [clone] = await tx.query<{ id: string }>(
      "insert into topics(course_id,curriculum_id,title,week,scheduled_date,accessible) values($1,$2,$3,$4,$5,$6) returning id",
      [courseId, next.id, topic.title, changes.week, changes.scheduled_date, changes.accessible],
    );
    await tx.query("update objectives set topic_id=$2 where topic_id=$1 and course_id=$3", [
      topic.id,
      clone.id,
      courseId,
    ]);
  }
  await tx.query("select invalidate_course_plans($1)", [courseId]);
  return { version: current.version + 1, curriculum_id: next.id };
}
