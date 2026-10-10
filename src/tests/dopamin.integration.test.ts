import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { createDatabase, migrate, asUser, type RootDatabase } from "@/lib/db";
import { createLocalUser } from "@/modules/auth/service";
import { createCourse, createObjective, joinCourse } from "@/modules/courses/service";
import { saveActivity, publishActivity } from "@/modules/activities/service";
import {
  createChallenge,
  respondChallenge,
  startChallenge,
  listChallenges,
  findMatch,
  cancelMatchSearch,
} from "@/modules/competition/service";
import { sessionView, submitAnswer, startPractice } from "@/modules/learning/service";
import { purchase, equip, rewardSummary } from "@/modules/rewards/service";
import { publicStudentProfile } from "@/modules/rewards/profiles";
import { levelProgress } from "@/lib/levels";
import { weekStart } from "@/lib/time";
import type { User, Course, LearningSession } from "@/types/domain";
let db: RootDatabase, teacher: User, course: Course, topicId: string;
const as = <T>(user: User, fn: Parameters<typeof asUser<T>>[2]) => asUser(db, user.id, fn);
const student = async () => {
  const user = await createLocalUser(db, {
    email: `dopamin-${randomUUID()}@test.edu`,
    display_name: "Dopamin öğrencisi",
    password: "TestPass2026!",
    role: "student",
  });
  await as(user, (tx) => joinCourse(tx, user, { code: course.invite_code }));
  return user;
};
beforeAll(async () => {
  db = await createDatabase("memory://");
  await migrate(db);
  teacher = await createLocalUser(
    db,
    {
      email: "dopamin-teacher@test.edu",
      display_name: "Öğretmen",
      password: "TestPass2026!",
      role: "teacher",
    },
    true,
  );
  course = await as(teacher, (tx) =>
    createCourse(tx, teacher, { title: "Dopamin test dersi", term: "Güz" }),
  );
  await as(teacher, async (tx) => {
    const objective = await createObjective(tx, teacher, course.id, {
      title: "Anahtar kavramı tanı",
      topic_title: "İlk konu",
      week: 1,
    });
    topicId = objective.topic_id;
    for (let i = 0; i < 2; i++) {
      const activity = await saveActivity(tx, teacher, course.id, {
        objective_id: objective.id,
        activity: {
          kind: "true_false",
          title: `Soru ${i}`,
          instruction: "Seç",
          content: { statement: "Doğru önerme" },
          answer_key: { value: true },
          explanation: "Doğru.",
        },
      });
      await publishActivity(tx, teacher, course.id, activity.activity_id);
    }
  });
});
afterAll(async () => {
  await db.close();
});
async function match(one: User, two: User, mode = "classic") {
  const c = await as(one, (tx) =>
    createChallenge(tx, one, {
      course_id: course.id,
      recipient_id: two.id,
      request_key: randomUUID(),
      mode,
    }),
  );
  await as(two, (tx) => respondChallenge(tx, two, c.id, { action: "accept" }));
  return c;
}
async function answerAll(user: User, s: LearningSession, answer = true) {
  for (const id of s.items)
    expect(
      await as(user, (tx) =>
        submitAnswer(tx, user, s.id, {
          request_key: randomUUID(),
          activity_version_id: id,
          answer,
        }),
      ),
    ).toMatchObject({ correct: null, pending_feedback: true, session: { first_correct: 0 } });
}
it("seviye kilidi sunucuda uygulanır; idempotent alım, farklı kozmetik türleri ve öğretmen gizliliği korunur", async () => {
  const user = await student(),
    other = await student();
  await db.query("select issue_reward($1,'fixture','fixture',null,249,0,0,500)", [user.id]);
  expect(levelProgress(249).level).toBe(1);
  expect(levelProgress(250).level).toBe(2);
  await expect(
    as(user, (tx) => purchase(tx, user, { product_id: "theme-aurora", request_key: randomUUID() })),
  ).rejects.toThrow("seviye");
  expect((await as(user, (tx) => rewardSummary(tx, user))).tokens).toBe(500);
  await db.query("select issue_reward($1,'level-up','fixture',null,1,0,0,0)", [user.id]);
  const key = randomUUID();
  await as(user, (tx) => purchase(tx, user, { product_id: "theme-aurora", request_key: key }));
  await as(user, (tx) => purchase(tx, user, { product_id: "theme-aurora", request_key: key }));
  expect((await as(user, (tx) => rewardSummary(tx, user))).tokens).toBe(440);
  for (const id of ["banner-aurora", "font-mono", "avatar-penguin"]) {
    await as(user, (tx) => purchase(tx, user, { product_id: id, request_key: randomUUID() }));
    await as(user, (tx) => equip(tx, user, { product_id: id }));
  }
  await as(user, (tx) => equip(tx, user, { product_id: "theme-aurora" }));
  expect((await as(user, (tx) => rewardSummary(tx, user))).cosmetics).toMatchObject({
    theme: "aurora",
    banner: "aurora",
    font: "mono",
    outfit: "penguin",
    avatar: null,
  });
  expect(
    (await db.query<{ avatar: string }>("select avatar from profiles where id=$1", [user.id]))[0]
      .avatar,
  ).toBe("violet");
  expect(
    await as(teacher, (tx) =>
      tx.query("select * from profile_cosmetics where user_id=$1", [user.id]),
    ),
  ).toHaveLength(0);
  await expect(as(other, (tx) => publicStudentProfile(tx, other, user.id))).rejects.toThrow(
    "paylaşılmıyor",
  );
  await db.query("update profiles set public_profile=true where id=$1", [user.id]);
  const profile = (await as(other, (tx) => publicStudentProfile(tx, other, user.id))) as Record<
    string,
    unknown
  >;
  expect(profile.cosmetics).toMatchObject({ banner: "aurora", font: "mono" });
  expect(profile).not.toHaveProperty("email");
  expect(profile).not.toHaveProperty("tokens");
  await expect(
    as(teacher, (tx) => tx.query("select student_public_profile($1)", [user.id])),
  ).rejects.toThrow("STUDENT_ONLY");
  await as(user, (tx) => equip(tx, user, { product_id: "reset:theme" }));
  expect((await as(user, (tx) => rewardSummary(tx, user))).cosmetics.theme).toBeNull();
});
it("konu üzerinden tekrar yalnız o konunun yayımlanmış sorularını açar", async () => {
  const user = await student();
  const s = await as(user, (tx) =>
    startPractice(tx, user, { course_id: course.id, topic_id: topicId }),
  );
  expect(s.items).toHaveLength(2);
  await expect(
    as(user, (tx) => startPractice(tx, user, { course_id: course.id, topic_id: randomUUID() })),
  ).rejects.toThrow("yayımlanmış etkinlik yok");
});
it("Klasik davet gönderen kabulü beklemeden bitirir; rakip kabul etmeden oynayamaz ve ödül sonuçlanınca verilir", async () => {
  const one = await student(),
    two = await student();
  const c = await as(one, (tx) =>
    createChallenge(tx, one, {
      course_id: course.id,
      recipient_id: two.id,
      request_key: randomUUID(),
      mode: "classic",
    }),
  );
  await expect(as(two, (tx) => startChallenge(tx, two, c.id))).rejects.toThrow("kabul");
  const first = await as(one, (tx) => startChallenge(tx, one, c.id));
  await answerAll(one, first);
  const pending = (await as(one, (tx) => listChallenges(tx, one))).find((row) => row.id === c.id)!;
  expect(pending.status).toBe("pending");
  expect(pending.participants.find((p) => p.user_id === one.id)).toMatchObject({
    completed: true,
    score: null,
  });
  expect(await as(one, (tx) => rewardSummary(tx, one))).toMatchObject({ xp: 0, tokens: 0 });
  await as(two, (tx) => respondChallenge(tx, two, c.id, { action: "accept" }));
  const second = await as(two, (tx) => startChallenge(tx, two, c.id));
  await answerAll(two, second, false);
  expect(await as(one, (tx) => rewardSummary(tx, one))).toMatchObject({ xp: 30, tokens: 5 });
  expect(await as(two, (tx) => rewardSummary(tx, two))).toMatchObject({ xp: 15, tokens: 0 });
  await as(two, (tx) => listChallenges(tx, two));
  expect((await as(one, (tx) => rewardSummary(tx, one))).xp).toBe(30);
});
it("Bekleyen davette süresi dolan Klasik tur kaydolur, boş rakip turu ve ödül üretilmez", async () => {
  const one = await student(),
    two = await student();
  const c = await as(one, (tx) =>
    createChallenge(tx, one, {
      course_id: course.id,
      recipient_id: two.id,
      request_key: randomUUID(),
      mode: "classic",
    }),
  );
  const first = await as(one, (tx) => startChallenge(tx, one, c.id));
  await as(one, (tx) =>
    submitAnswer(tx, one, first.id, {
      request_key: randomUUID(),
      activity_version_id: first.items[0],
      answer: true,
    }),
  );
  await db.query(
    "update challenge_participants set started_at=clock_timestamp()-interval '4 minutes' where challenge_id=$1",
    [c.id],
  );
  expect((await as(one, (tx) => sessionView(tx, one, first.id))).session.status).toBe("completed");
  const pending = (await as(one, (tx) => listChallenges(tx, one))).find((row) => row.id === c.id)!;
  expect(pending.status).toBe("pending");
  expect(pending.participants.find((p) => p.user_id === two.id)?.completed).toBe(false);
  await as(two, (tx) => respondChallenge(tx, two, c.id, { action: "reject" }));
  expect((await as(one, (tx) => sessionView(tx, one, first.id))).timing?.status).toBe("rejected");
  expect((await as(one, (tx) => rewardSummary(tx, one))).xp).toBe(0);
});
it("Seri davet kabul edilmeden oda açılır; reddedilen veya süresi dolan oda kapanır", async () => {
  for (const outcome of ["reject", "expire"]) {
    const one = await student(),
      two = await student();
    const c = await as(one, (tx) =>
      createChallenge(tx, one, {
        course_id: course.id,
        recipient_id: two.id,
        request_key: randomUUID(),
        mode: "rapid",
      }),
    );
    const first = await as(one, (tx) => startChallenge(tx, one, c.id));
    const waiting = await as(one, (tx) => sessionView(tx, one, first.id));
    expect(waiting.activity).toBeNull();
    expect(waiting.timing?.started_at).toBeNull();
    if (outcome === "reject")
      await as(two, (tx) => respondChallenge(tx, two, c.id, { action: outcome }));
    else
      await db.query(
        "update challenges set expires_at=clock_timestamp()-interval '1 second' where id=$1",
        [c.id],
      );
    const closed = await as(one, (tx) => sessionView(tx, one, first.id));
    expect(closed.session.status).toBe("completed");
    expect(closed.activity).toBeNull();
    expect((await as(one, (tx) => rewardSummary(tx, one))).xp).toBe(0);
  }
});
it("Seri iki hazır oyuncuyu bekler, önceden soru göstermez ve ortak sayaç yenilemeyle sıfırlanmaz", async () => {
  const one = await student(),
    two = await student(),
    c = await match(one, two, "rapid");
  const first = await as(one, (tx) => startChallenge(tx, one, c.id));
  let view = await as(one, (tx) => sessionView(tx, one, first.id));
  expect(view.activity).toBeNull();
  expect(view.timing?.started_at).toBeNull();
  await expect(
    as(one, (tx) =>
      submitAnswer(tx, one, first.id, {
        request_key: randomUUID(),
        activity_version_id: first.items[0],
        answer: true,
      }),
    ),
  ).rejects.toThrow("geri sayım");
  const second = await as(two, (tx) => startChallenge(tx, two, c.id));
  const twoView = await as(two, (tx) => sessionView(tx, two, second.id));
  view = await as(one, (tx) => sessionView(tx, one, first.id));
  expect(view.timing?.deadline).toEqual(twoView.timing?.deadline);
  expect(view.activity).toBeNull();
  await db.query(
    "update challenge_participants set started_at=clock_timestamp()-interval '1 second' where challenge_id=$1",
    [c.id],
  );
  view = await as(one, (tx) => sessionView(tx, one, first.id));
  expect(view.activity).not.toBeNull();
  const before = view.timing?.deadline;
  await as(one, (tx) => startChallenge(tx, one, c.id));
  expect((await as(one, (tx) => sessionView(tx, one, first.id))).timing?.deadline).toEqual(before);
  await answerAll(one, first);
  expect((await as(one, (tx) => startChallenge(tx, one, c.id))).first_correct).toBe(0);
  expect((await as(one, (tx) => sessionView(tx, one, first.id))).session.first_correct).toBe(0);
  await answerAll(two, second, false);
  expect(await as(one, (tx) => rewardSummary(tx, one))).toMatchObject({ xp: 30, tokens: 5 });
  expect(await as(two, (tx) => rewardSummary(tx, two))).toMatchObject({ xp: 15, tokens: 0 });
  await as(one, (tx) => listChallenges(tx, one));
  await as(two, (tx) => listChallenges(tx, two));
  expect((await as(one, (tx) => rewardSummary(tx, one))).xp).toBe(30);
  const [xp] = await db.query<{ amount: number; week: string }>(
    "select amount,week::text from xp_transactions where user_id=$1",
    [one.id],
  );
  expect(xp).toEqual({ amount: 30, week: weekStart() });
});
it("Klasik turlar ayrı başlar; süre aşımı kısmi cevapları korur, boş tur ödül almaz", async () => {
  const one = await student(),
    two = await student(),
    c = await match(one, two);
  const first = await as(one, (tx) => startChallenge(tx, one, c.id));
  await as(one, (tx) =>
    submitAnswer(tx, one, first.id, {
      request_key: randomUUID(),
      activity_version_id: first.items[0],
      answer: true,
    }),
  );
  await db.query(
    "update challenge_participants set started_at=clock_timestamp()-interval '4 minutes' where challenge_id=$1 and user_id=$2",
    [c.id, one.id],
  );
  const expired = await as(one, (tx) => sessionView(tx, one, first.id));
  expect(expired.session.status).toBe("completed");
  expect(expired.activity).toBeNull();
  const second = await as(two, (tx) => startChallenge(tx, two, c.id));
  expect((await as(two, (tx) => sessionView(tx, two, second.id))).activity).not.toBeNull();
  await db.query(
    "update challenge_participants set started_at=clock_timestamp()-interval '4 minutes' where challenge_id=$1 and user_id=$2",
    [c.id, two.id],
  );
  const [result] = await as(two, (tx) => listChallenges(tx, two));
  expect(result.status).toBe("completed");
  expect(result.winner_id).toBe(one.id);
  expect(Number(result.participants.find((p) => p.user_id === one.id)?.score)).toBe(0.5);
  expect((await as(two, (tx) => rewardSummary(tx, two))).xp).toBe(0);
  expect((await as(one, (tx) => rewardSummary(tx, one))).tokens).toBe(5);
});
it("rastgele eşleştirme yalnız arama açmış aynı dersteki rakiple olur ve iptal kuyruktan çıkarır", async () => {
  const one = await student(),
    two = await student();
  const firstKey = randomUUID();
  expect(
    (
      await as(one, (tx) =>
        findMatch(tx, one, { course_id: course.id, mode: "rapid", request_key: firstKey }),
      )
    ).challenge_id,
  ).toBeNull();
  await as(one, (tx) => cancelMatchSearch(tx, one));
  expect(await as(one, (tx) => tx.query("select * from match_queue"))).toHaveLength(0);
  await as(one, (tx) =>
    findMatch(tx, one, { course_id: course.id, mode: "rapid", request_key: randomUUID() }),
  );
  const key = randomUUID();
  const found = await as(two, (tx) =>
    findMatch(tx, two, { course_id: course.id, mode: "rapid", request_key: key }),
  );
  expect(found.challenge_id).toBeTruthy();
  expect(
    await as(two, (tx) =>
      findMatch(tx, two, { course_id: course.id, mode: "rapid", request_key: key }),
    ),
  ).toEqual(found);
  expect(await as(one, (tx) => tx.query("select * from match_queue"))).toHaveLength(0);
  expect((await as(one, (tx) => listChallenges(tx, one)))[0]).toMatchObject({
    status: "accepted",
    mode: "rapid",
  });
});
it("aynı gün beş ödüllü maçtan sonra yeni maç tekrar XP ve token basmaz", async () => {
  const one = await student(),
    two = await student(),
    c = await match(one, two);
  for (let i = 0; i < 5; i++)
    await db.query("select issue_reward($1,$2,'challenge_win',null,30,0,0,5)", [
      one.id,
      `prior-${i}`,
    ]);
  const first = await as(one, (tx) => startChallenge(tx, one, c.id)),
    second = await as(two, (tx) => startChallenge(tx, two, c.id));
  await answerAll(one, first);
  await answerAll(two, second, false);
  expect(await as(one, (tx) => rewardSummary(tx, one))).toMatchObject({ xp: 150, tokens: 25 });
  expect((await as(two, (tx) => rewardSummary(tx, two))).xp).toBe(15);
});
