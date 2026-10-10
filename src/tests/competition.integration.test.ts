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
  challengeRoster,
} from "@/modules/competition/service";
import { submitAnswer } from "@/modules/learning/service";
import { learningHistory } from "@/modules/learning/history";
import { rewardSummary } from "@/modules/rewards/service";
import { exportPersonalData } from "@/modules/auth/export";
import type { User, Course, LearningSession } from "@/types/domain";
let db: RootDatabase,
  teacher: User,
  one: User,
  two: User,
  outsider: User,
  course: Course,
  challengeId: string,
  first: LearningSession,
  second: LearningSession;
beforeAll(async () => {
  db = await createDatabase("memory://");
  await migrate(db);
  const user = async (role: "teacher" | "student", name: string) =>
    createLocalUser(
      db,
      { email: `${name}@test.edu`, display_name: name, password: "TestPass2026!", role },
      role === "teacher",
    );
  teacher = await user("teacher", "Öğretmen");
  one = await user("student", "Birinci");
  two = await user("student", "İkinci");
  outsider = await user("student", "Yabancı");
  course = await asUser(db, teacher.id, (tx) =>
    createCourse(tx, teacher, { title: "Düello dersi", term: "Güz" }),
  );
  await asUser(db, teacher.id, async (tx) => {
    const o = await createObjective(tx, teacher, course.id, {
      title: "Kazanım",
      topic_title: "Temel",
      week: 1,
    });
    for (let i = 0; i < 2; i++) {
      const a = await saveActivity(tx, teacher, course.id, {
        objective_id: o.id,
        activity: {
          kind: "true_false",
          title: `Önerme ${i}`,
          instruction: "Seç",
          content: { statement: "Doğru" },
          answer_key: { value: true },
          explanation: "Doğru.",
        },
      });
      await publishActivity(tx, teacher, course.id, a.activity_id);
    }
  });
  for (const u of [one, two])
    await asUser(db, u.id, (tx) => joinCourse(tx, u, { code: course.invite_code }));
});
afterAll(async () => {
  await db.close();
});
it("sadece sınıf arkadaşına davet oluşturulur, tekrar aynı davet olur ve özel kalır", async () => {
  const request = { course_id: course.id, recipient_id: two.id, request_key: randomUUID() };
  const c = await asUser(db, one.id, (tx) => createChallenge(tx, one, request));
  challengeId = c.id;
  expect((await asUser(db, one.id, (tx) => createChallenge(tx, one, request))).id).toBe(c.id);
  expect(await asUser(db, outsider.id, (tx) => listChallenges(tx, outsider))).toHaveLength(0);
  expect(await asUser(db, one.id, (tx) => challengeRoster(tx, one, course.id))).toEqual([
    { user_id: two.id, display_name: two.display_name },
  ]);
  await expect(
    asUser(db, one.id, (tx) =>
      createChallenge(tx, one, {
        ...request,
        recipient_id: outsider.id,
        request_key: randomUUID(),
      }),
    ),
  ).rejects.toThrow("aynı aktif derste");
  await expect(
    asUser(db, teacher.id, (tx) => createChallenge(tx, teacher, request)),
  ).rejects.toThrow();
  await expect(
    asUser(db, one.id, (tx) => respondChallenge(tx, one, c.id, { action: "accept" })),
  ).rejects.toThrow("yapamazsın");
  await expect(
    asUser(db, one.id, (tx) => tx.query("update challenges set items='[]' where id=$1", [c.id])),
  ).rejects.toThrow();
});
it("kabul sonrası aynı paket tek oturumla çözülür; ilk bitiren karşı tarafın sonucunu göremez", async () => {
  await asUser(db, two.id, (tx) => respondChallenge(tx, two, challengeId, { action: "accept" }));
  first = await asUser(db, one.id, (tx) => startChallenge(tx, one, challengeId));
  second = await asUser(db, two.id, (tx) => startChallenge(tx, two, challengeId));
  expect(first.items).toEqual(second.items);
  expect(first.curriculum_refs).toEqual(second.curriculum_refs);
  const [original] = await db.query<{ activity_id: string; objective_id: string }>(
    "select activity_id,objective_id from activity_versions where id=$1",
    [first.items[0]],
  );
  await asUser(db, teacher.id, async (tx) => {
    await saveActivity(
      tx,
      teacher,
      course.id,
      {
        objective_id: original.objective_id,
        activity: {
          kind: "true_false",
          title: "Yeni önerme sürümü",
          instruction: "Seç",
          content: { statement: "Yanlış" },
          answer_key: { value: false },
          explanation: "Yeni sürüm.",
        },
      },
      original.activity_id,
    );
    await publishActivity(tx, teacher, course.id, original.activity_id);
  });
  expect((await asUser(db, one.id, (tx) => startChallenge(tx, one, challengeId))).id).toBe(
    first.id,
  );
  for (const id of first.items) {
    const request = { request_key: randomUUID(), activity_version_id: id, answer: false };
    const response = await asUser(db, one.id, (tx) => submitAnswer(tx, one, first.id, request));
    expect(response).toMatchObject({ correct: null, correct_answer: "", pending_feedback: true });
    expect(
      (await asUser(db, one.id, (tx) => submitAnswer(tx, one, first.id, request))).replayed,
    ).toBe(true);
  }
  const [view] = await asUser(db, one.id, (tx) => listChallenges(tx, one));
  expect(view.status).toBe("accepted");
  expect(view.participants.every((p) => p.score === null && p.correct_count === null)).toBe(true);
  const exported = await asUser(db, one.id, (tx) => exportPersonalData(tx, one));
  expect(exported.attempts).toHaveLength(2);
  expect(
    exported.attempts.every((a) => a.correct === null && a.score === null && a.pending_feedback),
  ).toBe(true);
  expect(exported.sessions.every((s) => s.first_correct === null)).toBe(true);
  expect(exported.challenges[0].personal_score).toBeNull();
  expect(
    (await asUser(db, one.id, (tx) => learningHistory(tx, one, new URLSearchParams()))).items,
  ).toHaveLength(0);
  expect(
    await asUser(db, one.id, (tx) =>
      tx.query("select * from mistake_items where user_id=$1", [one.id]),
    ),
  ).toHaveLength(0);
  expect(
    await asUser(db, one.id, (tx) =>
      tx.query("select * from objective_mastery where user_id=$1", [one.id]),
    ),
  ).toHaveLength(0);
  expect(
    await asUser(db, one.id, (tx) =>
      tx.query("select * from learning_days where user_id=$1", [one.id]),
    ),
  ).toHaveLength(0);
});
it("sonuç ilk cevaplardan hesaplanır; rakibin cevapları ve akademik verisi açılmaz", async () => {
  for (const id of second.items)
    await asUser(db, two.id, (tx) =>
      submitAnswer(tx, two, second.id, {
        request_key: randomUUID(),
        activity_version_id: id,
        answer: true,
      }),
    );
  const [view] = await asUser(db, one.id, (tx) => listChallenges(tx, one));
  expect(view.status).toBe("completed");
  expect(view.winner_id).toBe(two.id);
  const exported = await asUser(db, one.id, (tx) => exportPersonalData(tx, one));
  expect(exported.attempts.every((a) => a.correct === false && Number(a.score) === 0)).toBe(true);
  expect(Number(exported.challenges[0].personal_score)).toBe(0);
  expect(Number(view.participants.find((p) => p.user_id === two.id)?.score)).toBe(1);
  expect(Number(view.participants.find((p) => p.user_id === one.id)?.score)).toBe(0);
  expect(
    (await asUser(db, one.id, (tx) => learningHistory(tx, one, new URLSearchParams()))).items,
  ).toHaveLength(2);
  expect(
    await asUser(db, one.id, (tx) => tx.query("select * from attempts where user_id=$1", [two.id])),
  ).toHaveLength(0);
  expect((await asUser(db, one.id, (tx) => rewardSummary(tx, one))).xp).toBe(15);
  await expect(
    asUser(db, one.id, (tx) =>
      submitAnswer(tx, one, first.id, {
        request_key: randomUUID(),
        activity_version_id: first.items[0],
        answer: true,
      }),
    ),
  ).rejects.toThrow("zaten tamamlandı");
});
it("eşit puan beraberliktir; davet reddedilebilir ve süresi dolan davet kabul edilemez", async () => {
  const c = await asUser(db, one.id, (tx) =>
    createChallenge(tx, one, {
      course_id: course.id,
      recipient_id: two.id,
      request_key: randomUUID(),
    }),
  );
  await asUser(db, two.id, (tx) => respondChallenge(tx, two, c.id, { action: "accept" }));
  for (const u of [one, two]) {
    const s = await asUser(db, u.id, (tx) => startChallenge(tx, u, c.id));
    for (const id of s.items)
      await asUser(db, u.id, (tx) =>
        submitAnswer(tx, u, s.id, {
          request_key: randomUUID(),
          activity_version_id: id,
          answer: true,
        }),
      );
  }
  expect(
    (await asUser(db, two.id, (tx) => listChallenges(tx, two))).find((v) => v.id === c.id),
  ).toMatchObject({ status: "completed", winner_id: null });
  const pending = await asUser(db, one.id, (tx) =>
    createChallenge(tx, one, {
      course_id: course.id,
      recipient_id: two.id,
      request_key: randomUUID(),
    }),
  );
  await asUser(db, two.id, (tx) => respondChallenge(tx, two, pending.id, { action: "reject" }));
  await expect(asUser(db, one.id, (tx) => startChallenge(tx, one, pending.id))).rejects.toThrow(
    "kabul edilmeli",
  );
  const expired = await asUser(db, one.id, (tx) =>
    createChallenge(tx, one, {
      course_id: course.id,
      recipient_id: two.id,
      request_key: randomUUID(),
    }),
  );
  await db.query("update challenges set expires_at=now()-interval '1 hour' where id=$1", [
    expired.id,
  ]);
  await expect(
    asUser(db, two.id, (tx) => respondChallenge(tx, two, expired.id, { action: "accept" })),
  ).rejects.toThrow("süresi doldu");
});
