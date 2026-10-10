import type { Database } from "@/lib/db";
import { today, addDays } from "@/lib/time";

export function masteryState(
  stats: { attempts: number; correct: number; days: number; activities: number },
  latestCorrect: boolean,
  previous?: string,
) {
  const confidence = stats.correct / Math.max(1, stats.attempts);
  const mastered =
    latestCorrect &&
    stats.attempts >= 3 &&
    stats.days >= 2 &&
    stats.activities >= 2 &&
    confidence >= 0.75;
  return {
    confidence,
    state: mastered
      ? "mastered"
      : !latestCorrect && (previous === "mastered" || previous === "needs_review")
        ? "needs_review"
        : stats.correct > 0
          ? "reinforcing"
          : "learning",
  };
}
export async function updateMastery(
  tx: Database,
  userId: string,
  objectiveId: string,
  courseId: string,
  correct: boolean,
) {
  const [stats] = await tx.query<{
    attempts: number;
    correct: number;
    days: number;
    activities: number;
  }>(
    `select count(*)::int attempts,
    count(*) filter(where a.correct)::int correct,
    count(distinct (a.created_at at time zone 'Europe/Istanbul')::date)::int days,
    count(distinct v.activity_id)::int activities from attempts a join learning_sessions s on s.id=a.session_id join activity_versions v on v.id=a.activity_version_id
    where a.user_id=$1 and a.objective_id=$2 and a.context='first' and s.mode in ('practice','daily','advance')`,
    [userId, objectiveId],
  );
  const [previous] = await tx.query<{ state: string }>(
    "select state from objective_mastery where user_id=$1 and objective_id=$2",
    [userId, objectiveId],
  );
  const result = masteryState(stats, correct, previous?.state);
  await tx.query(
    `insert into objective_mastery(user_id,objective_id,course_id,state,first_attempts,first_correct,distinct_days,distinct_activities,confidence,next_review_date)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict(user_id,objective_id) do update set
    state=excluded.state,first_attempts=excluded.first_attempts,first_correct=excluded.first_correct,distinct_days=excluded.distinct_days,
    distinct_activities=excluded.distinct_activities,confidence=excluded.confidence,next_review_date=excluded.next_review_date,updated_at=now()`,
    [
      userId,
      objectiveId,
      courseId,
      result.state,
      stats.attempts,
      stats.correct,
      stats.days,
      stats.activities,
      result.confidence,
      addDays(today(), result.state === "mastered" ? 7 : 1),
    ],
  );
}
