import { z } from "zod";
import type { Database } from "@/lib/db";
import type { User } from "@/types/domain";
import { assert } from "@/lib/errors";
import { studentCourse } from "@/modules/courses/service";
const card = z.object({
  term: z.string().min(1).max(120),
  fact: z.string().min(1).max(600),
  example: z.string().max(400).optional(),
  question: z.string().max(200).optional(),
});
export const preparationSchema = z.object({ cards: z.array(card).min(1).max(12) });
export async function lessonPreparation(
  tx: Database,
  user: User,
  courseId: string,
  topicId: string,
) {
  await studentCourse(tx, user, courseId);
  const [topic] = await tx.query<{ title: string; preparation: unknown }>(
    "select t.title,t.preparation from topics t join curriculum_versions c on c.id=t.curriculum_id where t.id=$1 and t.course_id=$2 and t.accessible and c.status='published'",
    [topicId, courseId],
  );
  assert(topic, "Bu konuya erişilemiyor.", 404);
  const saved = preparationSchema.safeParse(topic.preparation);
  if (saved.success) return { title: topic.title, ...saved.data };
  const facts = await tx.query<{ title: string; explanation: string }>(
    "select v.title,v.explanation from activities a join activity_versions v on v.activity_id=a.id and v.version=a.published_version join objectives o on o.id=v.objective_id where a.course_id=$1 and o.topic_id=$2 and a.status!='archived' and v.published_at is not null order by a.created_at limit 8",
    [courseId, topicId],
  );
  const seen = new Set<string>();
  return {
    title: topic.title,
    cards: facts
      .filter((f) => {
        const text = f.explanation.trim();
        if (!text || seen.has(text)) return false;
        seen.add(text);
        return true;
      })
      .map((f) => ({ term: f.title, fact: f.explanation })),
  };
}
