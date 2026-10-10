import { z } from "zod";
import type { Database } from "@/lib/db";
import { AppError, assert } from "@/lib/errors";
import type { User, LearningSession } from "@/types/domain";
import { requireStudent } from "@/modules/auth/service";
import { studentCourse } from "@/modules/courses/service";
import { newSession } from "@/modules/learning/service";
import { gradeActivity } from "@/modules/activities/grader";
import type { StoredActivity, ActivityInput } from "@/modules/activities/schema";
interface Challenge {
  id: string;
  course_id: string;
  creator_id: string;
  recipient_id: string;
  status: string;
  items: string[];
  curriculum_refs: Record<string, string>;
  created_at: string;
  expires_at: string;
  winner_id: string | null;
  mode: "classic" | "rapid";
  duration_seconds: number;
}
const errors: Record<string, string> = {
  CHALLENGE_NOT_FOUND: "Meydan okuma bulunamadı.",
  CLASSMATE_ONLY: "İki öğrenci de aynı aktif derste bulunmalı.",
  CHALLENGE_REQUEST_CONFLICT: "Bu işlem anahtarı başka bir davette kullanılmış.",
  CHALLENGE_DAILY_LIMIT: "Bir günde en fazla 10 meydan okuma oluşturabilirsin.",
  CHALLENGE_NO_CONTENT: "Bu derste meydan okumaya uygun yayımlanmış içerik yok.",
  CHALLENGE_ACTION_FORBIDDEN: "Bu davet işlemini yapamazsın.",
  CHALLENGE_NOT_PENDING: "Bu davet daha önce yanıtlandı.",
  CHALLENGE_NOT_ACCEPTED: "Önce meydan okuma daveti kabul edilmeli.",
  CHALLENGE_EXPIRED: "Bu maçın davet süresi doldu.",
};
async function action<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    const code = Object.keys(errors).find((key) => message.includes(key));
    if (code) throw new AppError(409, errors[code]);
    throw err;
  }
}
export async function challengeRoster(tx: Database, user: User, courseId: string) {
  await studentCourse(tx, user, courseId);
  return tx.query<{ user_id: string; display_name: string }>(
    "select user_id,display_name from class_ranking($1,$2) where user_id!=$3",
    [courseId, "2000-01-03", user.id],
  );
}
export async function createChallenge(tx: Database, user: User, input: unknown) {
  requireStudent(user);
  const d = z
    .object({
      course_id: z.uuid(),
      recipient_id: z.uuid(),
      request_key: z.uuid(),
      mode: z.enum(["classic", "rapid"]).default("classic"),
    })
    .parse(input);
  return action(
    async () =>
      (
        await tx.query<Challenge>("select * from create_timed_challenge($1,$2,$3,$4)", [
          d.course_id,
          d.recipient_id,
          d.request_key,
          d.mode,
        ])
      )[0],
  );
}
export async function respondChallenge(tx: Database, user: User, id: string, input: unknown) {
  requireStudent(user);
  const { action: response } = z
    .object({ action: z.enum(["accept", "reject", "cancel"]) })
    .parse(input);
  return action(
    async () =>
      (await tx.query<Challenge>("select * from respond_challenge($1,$2)", [id, response]))[0],
  );
}
export async function listChallenges(tx: Database, user: User) {
  requireStudent(user);
  const active = await tx.query<{ id: string }>(
    "select id from challenges where status in ('pending','accepted') order by id",
  );
  for (const c of active) await tx.query("select settle_timed_challenge($1)", [c.id]);
  const rows = await tx.query<Challenge & { course_title: string }>(
    "select ch.*,c.title course_title from challenges ch join courses c on c.id=ch.course_id order by ch.created_at desc limit 100",
  );
  return Promise.all(
    rows.map(async (c) => ({
      ...c,
      status:
        c.status !== "completed" &&
        ["pending", "accepted"].includes(c.status) &&
        new Date(c.expires_at).getTime() <= Date.now()
          ? "expired"
          : c.status,
      participants: await tx.query<{
        user_id: string;
        display_name: string;
        score: string | null;
        correct_count: number | null;
        completed: boolean;
      }>("select * from challenge_results($1)", [c.id]),
      your_session:
        (
          await tx.query<{ session_id: string | null }>(
            "select session_id from challenge_participants where challenge_id=$1 and user_id=$2",
            [c.id, user.id],
          )
        )[0]?.session_id || null,
    })),
  );
}
export async function startChallenge(tx: Database, user: User, id: string) {
  requireStudent(user);
  return action(async () => {
    const [c] = await tx.query<Challenge>("select * from lock_challenge($1)", [id]);
    const [p] = await tx.query<{ session_id: string | null }>(
      "select session_id from challenge_participants where challenge_id=$1 and user_id=$2",
      [id, user.id],
    );
    if (p?.session_id) {
      const existing = (
        await tx.query<LearningSession>("select * from learning_sessions where id=$1", [
          p.session_id,
        ])
      )[0];
      return { ...existing, first_correct: 0 };
    }
    const session = await newSession(tx, user, c.items, "challenge", c.course_id);
    await tx.query("select link_challenge_session($1,$2)", [id, session.id]);
    return { ...session, challenge_id: id, curriculum_refs: c.curriculum_refs };
  });
}
export async function challengeAnswer(
  tx: Database,
  user: User,
  session: LearningSession,
  input: { request_key: string; activity_version_id: string; answer: unknown },
) {
  assert(session.challenge_id, "Bu oturum bir meydan okumaya bağlı değil.", 409);
  const [existing] = await tx.query<{ session_id: string; activity_version_id: string }>(
    "select session_id,activity_version_id from attempts where user_id=$1 and request_key=$2",
    [user.id, input.request_key],
  );
  if (existing) {
    assert(
      existing.session_id === session.id &&
        existing.activity_version_id === input.activity_version_id,
      "Bu işlem anahtarı başka bir cevapta kullanılmış.",
      409,
    );
    return {
      correct: null,
      pending_feedback: true,
      explanation: "İki öğrenci de tamamlayınca sonuçlar açıklanacak.",
      correct_answer: "",
      session: { ...session, first_correct: 0 },
      replayed: true,
    };
  }
  assert(session.status !== "completed", "Bu meydan okuma zaten tamamlandı.", 409);
  return action(async () => {
    const timing = await challengeTiming(tx, user, session.challenge_id!);
    assert(
      timing.started_at && new Date(timing.started_at).getTime() <= Date.now(),
      "Rakibinin hazır olması ve geri sayımın bitmesi bekleniyor.",
      409,
    );
    if (timing.deadline && new Date(timing.deadline).getTime() <= Date.now()) {
      await tx.query("select settle_timed_challenge($1)", [session.challenge_id]);
      const [finished] = await tx.query<LearningSession>(
        "select * from learning_sessions where id=$1",
        [session.id],
      );
      return {
        correct: null,
        pending_feedback: true,
        explanation: "Süre doldu. Verdiğin cevaplar kaydedildi.",
        correct_answer: "",
        session: { ...finished, first_correct: 0 },
        replayed: false,
      };
    }
    const [c] = await tx.query<Challenge>("select * from lock_challenge($1)", [
      session.challenge_id,
    ]);
    assert(JSON.stringify(c.items) === JSON.stringify(session.items), "Soru paketi tutarsız.", 409);
    const expected = session.items[session.cursor];
    assert(expected === input.activity_version_id, "Soru değişti. Oturumu yenile.", 409);
    const [activity] = await tx.query<StoredActivity>(
      "select * from activity_versions where id=$1",
      [expected],
    );
    assert(activity, "Etkinliğe erişim iznin yok.", 403);
    const grade = gradeActivity(activity as ActivityInput, input.answer);
    await tx.query(
      "insert into attempts(request_key,session_id,user_id,course_id,activity_version_id,objective_id,context,answer,correct,score,curriculum_id) values($1,$2,$3,$4,$5,$6,'first',$7,$8,$9,$10)",
      [
        input.request_key,
        session.id,
        user.id,
        activity.course_id,
        activity.id,
        activity.objective_id,
        JSON.stringify(input.answer),
        grade.correct,
        grade.score,
        session.curriculum_refs?.[activity.id] || null,
      ],
    );
    const done = session.cursor + 1 === session.items.length;
    const [updated] = await tx.query<LearningSession>(
      "update learning_sessions set cursor=cursor+1,first_correct=first_correct+$2,status=$3,interrupted_from=null,completed_at=case when $3='completed' then now() else null end where id=$1 returning *",
      [session.id, grade.correct ? 1 : 0, done ? "completed" : "in_progress"],
    );
    if (done) await tx.query("select finish_challenge_session($1)", [session.id]);
    return {
      correct: null,
      pending_feedback: true,
      explanation: "İki öğrenci de tamamlayınca sonuçlar açıklanacak.",
      correct_answer: "",
      session: { ...updated, first_correct: 0 },
      replayed: false,
    };
  });
}

export async function challengeTiming(tx: Database, user: User, challengeId: string) {
  const [row] = await tx.query<{
    mode: string;
    status: string;
    duration_seconds: number;
    started_at: string | null;
    deadline: string | null;
    server_time: string;
  }>(
    "select c.mode,case when c.status='pending' and c.expires_at<=clock_timestamp() then 'expired' else c.status end status,c.duration_seconds,p.started_at,case when p.started_at is not null then least(c.expires_at,p.started_at+make_interval(secs=>c.duration_seconds)) else null end deadline,clock_timestamp() server_time from challenges c join challenge_participants p on p.challenge_id=c.id where c.id=$1 and p.user_id=$2",
    [challengeId, user.id],
  );
  assert(row, "Maç bulunamadı.", 404);
  return row;
}
export async function findMatch(tx: Database, user: User, input: unknown) {
  requireStudent(user);
  const d = z
    .object({ course_id: z.uuid(), mode: z.enum(["classic", "rapid"]), request_key: z.uuid() })
    .parse(input);
  return action(
    async () =>
      (
        await tx.query<{ challenge_id: string | null }>(
          "select find_match($1,$2,$3) challenge_id",
          [d.course_id, d.mode, d.request_key],
        )
      )[0],
  );
}
export async function cancelMatchSearch(tx: Database, user: User) {
  requireStudent(user);
  await tx.query("select cancel_match_search()");
  return { cancelled: true };
}
