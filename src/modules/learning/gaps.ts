import { z } from "zod";
import type { Database } from "@/lib/db";
import { AppError, assert } from "@/lib/errors";
import type { User } from "@/types/domain";
import { studentCourse, ownCourse } from "@/modules/courses/service";
export interface GapReport {
  user_id: string;
  objective_id: string;
  course_id: string;
  note: string;
  resolved: boolean;
  revision: number;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_note: string;
}
export interface GapEvent {
  id: string;
  action: "reported" | "updated" | "reopened" | "resolved";
  note: string;
  actor_role: "student" | "teacher";
  revision: number;
  created_at: string;
}
const changeSchema = z.object({
  course_id: z.uuid(),
  objective_id: z.uuid(),
  note: z.string().trim().max(1000).default(""),
  expected_revision: z.number().int().positive().nullable().default(null),
});
export async function gapDetail(tx: Database, user: User, courseId: string, objectiveId: string) {
  await studentCourse(tx, user, courseId);
  assert(
    (
      await tx.query("select id from objectives where id=$1 and course_id=$2", [
        objectiveId,
        courseId,
      ])
    ).length,
    "Kazanım bulunamadı.",
    404,
  );
  const [report] = await tx.query<GapReport>(
    "select * from gap_reports where course_id=$1 and objective_id=$2 and user_id=$3",
    [courseId, objectiveId, user.id],
  );
  const history = await tx.query<GapEvent>(
    "select id,action,note,actor_role,revision,created_at from gap_events where course_id=$1 and objective_id=$2 and user_id=$3 order by revision desc limit 30",
    [courseId, objectiveId, user.id],
  );
  return { report: report || null, history };
}
export async function changeGap(
  tx: Database,
  user: User,
  input: unknown,
  action: "report" | "resolve",
  studentId = user.id,
) {
  const data = changeSchema.parse(input);
  if (action === "report" || user.role === "student") {
    assert(studentId === user.id, "Bu bildirim sana ait değil.", 403);
    await studentCourse(tx, user, data.course_id);
  } else await ownCourse(tx, user, data.course_id);
  try {
    return (
      await tx.query<GapReport>("select * from set_gap_report($1,$2,$3,$4,$5,$6)", [
        data.course_id,
        data.objective_id,
        studentId,
        action,
        data.note,
        data.expected_revision,
      ])
    )[0];
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("GAP_CHANGED"))
      throw new AppError(
        409,
        "Bildirim başka bir yerde güncellendi. Güncel notu inceleyip tekrar dene.",
      );
    if (message.includes("GAP_ACCESS_DENIED"))
      throw new AppError(403, "Bu dersteki bildirim için yetkin yok.");
    if (/GAP_NOT_FOUND|GAP_OBJECTIVE_UNAVAILABLE/.test(message))
      throw new AppError(404, "Bildirim veya erişilebilir kazanım bulunamadı.");
    throw error;
  }
}
