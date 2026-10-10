import { z } from "zod";
import type { Database } from "@/lib/db";
import { assert } from "@/lib/errors";
import type { User, LearningSession, SessionMode } from "@/types/domain";
import { requireStudent } from "@/modules/auth/service";
import { studentCourse } from "@/modules/courses/service";
import {
  publicActivity,
  type StoredActivity,
  type ActivityInput,
} from "@/modules/activities/schema";
import { gradeActivity, answerSummary } from "@/modules/activities/grader";
import { updateMastery } from "@/modules/mastery/service";
import { rewardSummary } from "@/modules/rewards/service";

export async function newSession(
  tx: Database,
  user: User,
  items: string[],
  mode: SessionMode,
  courseId: string | null,
) {
  requireStudent(user);
  assert(items.length > 0, "Bu çalışma için henüz yayımlanmış etkinlik yok.", 409);
  assert(new Set(items).size === items.length, "Oturum etkinlikleri benzersiz olmalı.");
  const rows = await tx.query<{ id: string; course_id: string; curriculum_id: string }>(
    "select v.id,v.course_id,t.curriculum_id from activity_versions v join objectives o on o.id=v.objective_id join topics t on t.id=o.topic_id where v.id=any($1::uuid[]) and v.published_at is not null",
    [items],
  );
  assert(
    rows.length === items.length && rows.every((r) => !courseId || r.course_id === courseId),
    "Oturumda erişilemeyen bir etkinlik var.",
    403,
  );
  const [session] = await tx.query<LearningSession>(
    "insert into learning_sessions(user_id,course_id,mode,items,curriculum_refs) values($1,$2,$3,$4,$5) returning *",
    [
      user.id,
      courseId,
      mode,
      JSON.stringify(items),
      JSON.stringify(Object.fromEntries(rows.map((r) => [r.id, r.curriculum_id]))),
    ],
  );
  return session;
}
export async function startPractice(tx: Database, user: User, input: unknown) {
  const data = z
    .object({
      course_id: z.uuid(),
      objective_id: z.uuid().optional(),
      topic_id: z.uuid().optional(),
      mode: z.enum(["practice", "advance"]).default("practice"),
    })
    .parse(input);
  await studentCourse(tx, user, data.course_id);
  const rows = await tx.query<{ id: string }>(
    `select v.id from activities a join activity_versions v on v.activity_id=a.id and v.version=a.published_version
    join objectives o on o.id=v.objective_id join topics t on t.id=o.topic_id join curriculum_versions c on c.id=t.curriculum_id
    where a.course_id=$1 and a.published_version is not null and a.status!='archived' and t.accessible and c.status='published' and ($2::uuid is null or v.objective_id=$2) and ($3::uuid is null or t.id=$3) order by a.created_at`,
    [data.course_id, data.objective_id || null, data.topic_id || null],
  );
  return newSession(
    tx,
    user,
    rows.map((r) => r.id),
    data.mode,
    data.course_id,
  );
}
export async function sessionView(tx: Database, user: User, id: string) {
  requireStudent(user);
  const [session] = await tx.query<LearningSession>(
    "select * from learning_sessions where id=$1 and user_id=$2",
    [id, user.id],
  );
  assert(session, "Oturum bulunamadı.", 404);
  let timing = null;
  if (session.challenge_id) {
    await tx.query("select settle_timed_challenge($1)", [session.challenge_id]);
    Object.assign(
      session,
      (await tx.query<LearningSession>("select * from learning_sessions where id=$1", [id]))[0],
    );
    const { challengeTiming } = await import("@/modules/competition/service");
    timing = await challengeTiming(tx, user, session.challenge_id);
  }
  if (session.status === "interrupted") {
    session.status = session.interrupted_from || "in_progress";
    await tx.query("update learning_sessions set status=$2,interrupted_from=null where id=$1", [
      session.id,
      session.status,
    ]);
  }
  let activity = null;
  if (
    session.status !== "completed" &&
    (!timing || (timing.started_at && new Date(timing.started_at).getTime() <= Date.now()))
  ) {
    const versionId =
      session.status === "reviewing"
        ? session.review_items[session.review_cursor]
        : session.items[session.cursor];
    const [row] = await tx.query<StoredActivity>("select * from activity_versions where id=$1", [
      versionId,
    ]);
    assert(row, "Bu etkinliğe erişimin artık yok. Ders kaydını kontrol et.", 403);
    activity = publicActivity(row);
  }
  const visibleSession = session.mode === "challenge" ? { ...session, first_correct: 0 } : session;
  return { session: visibleSession, activity, timing, rewards: await rewardSummary(tx, user) };
}
export async function submitAnswer(tx: Database, user: User, sessionId: string, input: unknown) {
  requireStudent(user);
  const data = z
    .object({ request_key: z.uuid(), activity_version_id: z.uuid(), answer: z.unknown() })
    .parse(input);
  // Match-first lock order is shared by answers, timeout settlement and ready/start.
  const [match] = await tx.query<{ challenge_id: string | null }>(
    "select challenge_id from learning_sessions where id=$1 and user_id=$2",
    [sessionId, user.id],
  );
  if (match?.challenge_id) await tx.query("select lock_match_for_answer($1)", [match.challenge_id]);
  const [session] = await tx.query<LearningSession>(
    "select * from learning_sessions where id=$1 and user_id=$2 for update",
    [sessionId, user.id],
  );
  assert(session, "Oturum bulunamadı.", 404);
  if (session.mode === "challenge") {
    const { challengeAnswer } = await import("@/modules/competition/service");
    return challengeAnswer(tx, user, session, data);
  }
  const [existing] = await tx.query<{
    correct: boolean;
    score: number;
    activity_version_id: string;
    session_id: string;
  }>(
    "select correct,score,activity_version_id,session_id from attempts where user_id=$1 and request_key=$2",
    [user.id, data.request_key],
  );
  if (existing) {
    assert(
      existing.session_id === sessionId &&
        existing.activity_version_id === data.activity_version_id,
      "Bu işlem anahtarı başka bir cevapta kullanılmış.",
      409,
    );
    const [activity] = await tx.query<StoredActivity>(
      "select * from activity_versions where id=$1",
      [existing.activity_version_id],
    );
    assert(activity, "Etkinliğe erişimin artık yok.", 403);
    return {
      correct: existing.correct,
      score: Number(existing.score),
      explanation: activity.explanation,
      correct_answer: answerSummary(activity as ActivityInput),
      session,
      replayed: true,
    };
  }
  assert(session.status !== "completed", "Oturum zaten tamamlandı.", 409);
  if (session.mode === "assignment") {
    const { assertAssignmentSession } = await import("@/modules/assignments/service");
    await assertAssignmentSession(tx, user, session.id);
  }
  const review = session.status === "reviewing";
  const expected = review
    ? session.review_items[session.review_cursor]
    : session.items[session.cursor];
  assert(
    expected === data.activity_version_id,
    "Soru değişti. Oturumu yenileyip tekrar dene.",
    409,
  );
  const [activity] = await tx.query<StoredActivity>("select * from activity_versions where id=$1", [
    expected,
  ]);
  assert(activity, "Etkinliğe erişim iznin yok.", 403);
  await studentCourse(tx, user, activity.course_id);
  const grade = gradeActivity(activity as ActivityInput, data.answer);
  const context =
    session.mode === "mistakes" ? "mistake_review" : review ? "session_review" : "first";
  await tx.query(
    `insert into attempts(request_key,session_id,user_id,course_id,activity_version_id,objective_id,context,answer,correct,score,curriculum_id)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      data.request_key,
      sessionId,
      user.id,
      activity.course_id,
      activity.id,
      activity.objective_id,
      context,
      JSON.stringify(data.answer),
      grade.correct,
      grade.score,
      session.curriculum_refs?.[activity.id] || null,
    ],
  );
  if (!grade.correct) {
    await tx.query(
      `insert into mistake_items(user_id,course_id,activity_version_id,objective_id) values($1,$2,$3,$4)
      on conflict(user_id,activity_version_id) do update set status='pending',wrong_count=mistake_items.wrong_count+1,resolved_at=null`,
      [user.id, activity.course_id, activity.id, activity.objective_id],
    );
    if (!review && session.mode !== "mistakes") session.review_items.push(activity.id);
  } else if (session.mode === "mistakes") {
    await tx.query(
      "update mistake_items set status='resolved',resolved_at=now() where user_id=$1 and activity_version_id=$2",
      [user.id, activity.id],
    );
  }
  if (context === "first") {
    if (grade.correct) session.first_correct++;
    if (session.mode !== "assignment")
      await updateMastery(tx, user.id, activity.objective_id, activity.course_id, grade.correct);
    if (session.mode !== "assignment") {
      const { invalidateUnstarted } = await import("@/modules/scheduling/service");
      await invalidateUnstarted(tx, user.id);
    }
  }
  if (review) session.review_cursor++;
  else session.cursor++;
  if (review && session.review_cursor >= session.review_items.length) session.status = "completed";
  else if (!review && session.cursor >= session.items.length)
    session.status = session.review_items.length ? "reviewing" : "completed";
  else session.status = review ? "reviewing" : "in_progress";
  const [updated] = await tx.query<LearningSession>(
    `update learning_sessions set status=$2,cursor=$3,review_items=$4,review_cursor=$5,first_correct=$6,
    completed_at=case when $2='completed' then now() else null end where id=$1 returning *`,
    [
      sessionId,
      session.status,
      session.cursor,
      JSON.stringify(session.review_items),
      session.review_cursor,
      session.first_correct,
    ],
  );
  if (updated.status === "completed" && updated.mode === "daily") {
    const { completePlanItem } = await import("@/modules/scheduling/service");
    await completePlanItem(tx, user, updated.id);
  }
  if (updated.status === "completed" && updated.mode === "assignment") {
    const { completeAssignment } = await import("@/modules/assignments/service");
    await completeAssignment(tx, user, updated);
  }
  if (updated.mode !== "assignment" && updated.mode !== "challenge") {
    await tx.query("select record_learning_day($1)", [updated.id]);
    if (updated.status === "completed")
      await tx.query("select award_completed_session($1)", [updated.id]);
  }
  return {
    ...grade,
    explanation: activity.explanation,
    correct_answer: answerSummary(activity as ActivityInput),
    session: updated,
    replayed: false,
  };
}

export async function pauseSession(tx: Database, user: User, id: string) {
  requireStudent(user);
  const [session] = await tx.query<LearningSession>(
    "select * from learning_sessions where id=$1 and user_id=$2 for update",
    [id, user.id],
  );
  assert(session, "Oturum bulunamadı.", 404);
  if (session.status === "completed" || session.status === "interrupted") return session;
  return (
    await tx.query<LearningSession>(
      "update learning_sessions set interrupted_from=status,status='interrupted' where id=$1 returning *",
      [id],
    )
  )[0];
}
export async function listMistakes(tx: Database, user: User, courseId?: string) {
  requireStudent(user);
  return tx.query(
    `select m.*,v.title,v.kind,o.title objective_title,t.title topic_title,c.title course_title,c.color
    from mistake_items m join activity_versions v on v.id=m.activity_version_id join objectives o on o.id=m.objective_id
    join topics t on t.id=o.topic_id join courses c on c.id=m.course_id
    where m.user_id=$1 and m.status='pending' ${courseId ? "and m.course_id=$2" : ""} and not c.archived order by m.created_at`,
    courseId ? [user.id, courseId] : [user.id],
  );
}
export async function startMistakes(tx: Database, user: User, courseId?: string) {
  const mistakes = (await listMistakes(tx, user, courseId)) as { activity_version_id: string }[];
  return newSession(
    tx,
    user,
    mistakes.map((m) => m.activity_version_id),
    "mistakes",
    courseId || null,
  );
}
