import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { createDatabase, migrate, asUser, type RootDatabase } from "@/lib/db";
import { createLocalUser } from "@/modules/auth/service";
import {
  createCourse,
  createObjective,
  joinCourse,
  listObjectives,
} from "@/modules/courses/service";
import { saveActivity, publishActivity } from "@/modules/activities/service";
import { ensureDailyPlan, startPlanItem } from "@/modules/scheduling/service";
import { reviseCurriculum } from "@/modules/curriculum/service";
import { sessionView, submitAnswer, pauseSession } from "@/modules/learning/service";
import { today, addDays } from "@/lib/time";
import { courseAnalytics, studentAnalytics } from "@/modules/analytics/service";
import { learningHistory } from "@/modules/learning/history";
import type { User, Course } from "@/types/domain";
let db: RootDatabase, teacher: User, students: User[], courses: Course[], objectiveIds: string[];
beforeAll(async () => {
  db = await createDatabase("memory://");
  await migrate(db);
  teacher = await createLocalUser(
    db,
    {
      email: "scheduler-teacher@test.edu",
      display_name: "Akademisyen",
      password: "TestPass2026!",
      role: "teacher",
    },
    true,
  );
  students = await Promise.all(
    [1, 2, 3].map((i) =>
      createLocalUser(db, {
        email: `scheduler-${i}@test.edu`,
        display_name: `Öğrenci ${i}`,
        password: "TestPass2026!",
        role: "student",
      }),
    ),
  );
  courses = [];
  objectiveIds = [];
  for (const title of ["Algoritmalar", "Biyoloji"]) {
    const c = await asUser(db, teacher.id, (tx) =>
      createCourse(tx, teacher, { title, term: "Güz" }),
    );
    courses.push(c);
    await asUser(db, teacher.id, async (tx) => {
      const o = await createObjective(tx, teacher, c.id, {
        topic_title: "Temeller",
        title: `${title} temellerini açıklar`,
        week: 1,
        scheduled_date: today(),
        importance: 3,
      });
      objectiveIds.push(o.id);
      for (let i = 0; i < 3; i++) {
        const a = await saveActivity(tx, teacher, c.id, {
          objective_id: o.id,
          activity: {
            kind: "true_false",
            title: `${title} ${i + 1}`,
            instruction: "Seç",
            content: { statement: "Doğru önerme" },
            answer_key: { value: true },
            explanation: "Önerme doğrudur.",
          },
        });
        await publishActivity(tx, teacher, c.id, a.activity_id);
      }
    });
    for (const s of students.slice(0, 2))
      await asUser(db, s.id, (tx) => joinCourse(tx, s, { code: c.invite_code }));
  }
  await db.query(
    "insert into objective_mastery(user_id,course_id,objective_id,state,confidence,next_review_date) values($1,$2,$3,'mastered',1,$4)",
    [students[1].id, courses[0].id, objectiveIds[0], addDays(today(), 7)],
  );
});
afterAll(async () => {
  await db.close();
});
it("aynı iki derste öğrencilerin geçmişi farklı plan oluşturur; sayfa yenilemek planı değiştirmez", async () => {
  const plans = await Promise.all(
    students.slice(0, 2).map((s) => asUser(db, s.id, (tx) => ensureDailyPlan(tx, s))),
  );
  expect(plans[0].items).toHaveLength(2);
  expect(plans[1].items).toHaveLength(2);
  expect(plans[0].items.flatMap((i) => i.activity_version_ids)).toHaveLength(6);
  expect(plans[1].items.flatMap((i) => i.activity_version_ids)).toHaveLength(4);
  expect(
    (await asUser(db, students[0].id, (tx) => ensureDailyPlan(tx, students[0]))).items.map(
      (i) => i.id,
    ),
  ).toEqual(plans[0].items.map((i) => i.id));
  expect(
    await asUser(db, students[1].id, (tx) =>
      tx.query("select * from daily_plans where user_id=$1", [students[0].id]),
    ),
  ).toHaveLength(0);
});
it("müfredat değişikliği başlanmış planı ve oturum sürümünü korur, başlanmamış planı yeniler", async () => {
  const first = students[0],
    second = students[1];
  const plan = await asUser(db, first.id, (tx) => ensureDailyPlan(tx, first));
  const item = plan.items.find((i) => i.course_id === courses[0].id)!;
  const session = await asUser(db, first.id, (tx) => startPlanItem(tx, first, item.id));
  const oldCurriculum = item.curriculum_id;
  const topics = await asUser(db, teacher.id, (tx) => listObjectives(tx, teacher, courses[0].id));
  await asUser(db, teacher.id, (tx) =>
    reviseCurriculum(tx, teacher, courses[0].id, {
      topics: [
        { id: topics[0].topic_id, week: 9, scheduled_date: addDays(today(), 60), accessible: true },
      ],
    }),
  );
  const preserved = await asUser(db, first.id, (tx) => ensureDailyPlan(tx, first));
  expect(preserved.items.map((i) => i.id)).toEqual(plan.items.map((i) => i.id));
  const revised = await asUser(db, second.id, (tx) => ensureDailyPlan(tx, second));
  expect(revised.plan.revision).toBe(2);
  expect(revised.items).toHaveLength(1);
  const [version] = await db.query<{ activity_id: string }>(
    "select activity_id from activity_versions where id=$1",
    [session.items[0]],
  );
  await asUser(db, teacher.id, (tx) =>
    saveActivity(
      tx,
      teacher,
      courses[0].id,
      {
        objective_id: objectiveIds[0],
        activity: {
          kind: "true_false",
          title: "Taslak değişikliği",
          instruction: "Seç",
          content: { statement: "Yanlış önerme" },
          answer_key: { value: false },
          explanation: "Yeni sürüm",
        },
      },
      version.activity_id,
    ),
  );
  const view = await asUser(db, first.id, (tx) => sessionView(tx, first, session.id));
  expect(view.activity!.id).toBe(session.items[0]);
  await asUser(db, first.id, (tx) =>
    submitAnswer(tx, first, session.id, {
      request_key: randomUUID(),
      activity_version_id: session.items[0],
      answer: false,
    }),
  );
  for (const id of session.items.slice(1))
    await asUser(db, first.id, (tx) =>
      submitAnswer(tx, first, session.id, {
        request_key: randomUUID(),
        activity_version_id: id,
        answer: true,
      }),
    );
  const paused = await asUser(db, first.id, (tx) => pauseSession(tx, first, session.id));
  expect(paused.interrupted_from).toBe("reviewing");
  const resumed = await asUser(db, first.id, (tx) => sessionView(tx, first, session.id));
  expect(resumed.session.status).toBe("reviewing");
  const result = await asUser(db, first.id, (tx) =>
    submitAnswer(tx, first, session.id, {
      request_key: randomUUID(),
      activity_version_id: session.items[0],
      answer: true,
    }),
  );
  expect(result.correct).toBe(true);
  const attempts = await db.query<{ curriculum_id: string }>(
    "select curriculum_id from attempts where session_id=$1",
    [session.id],
  );
  expect(attempts.every((a) => a.curriculum_id === oldCurriculum)).toBe(true);
});
it("tamamlanmış günlük plana yeni zorunlu görev eklenmez", async () => {
  const s = students[0],
    plan = await asUser(db, s.id, (tx) => ensureDailyPlan(tx, s));
  for (const item of plan.items.filter((i) => i.status !== "completed")) {
    const session = await asUser(db, s.id, (tx) => startPlanItem(tx, s, item.id));
    for (const id of session.items)
      await asUser(db, s.id, (tx) =>
        submitAnswer(tx, s, session.id, {
          request_key: randomUUID(),
          activity_version_id: id,
          answer: true,
        }),
      );
  }
  const completed = await asUser(db, s.id, (tx) => ensureDailyPlan(tx, s));
  expect(completed.plan.status).toBe("completed");
  expect(completed.items.map((i) => i.id)).toEqual(plan.items.map((i) => i.id));
  const oldItem = await asUser(db, s.id, (tx) => startPlanItem(tx, s, completed.items[0].id));
  expect(oldItem.status).toBe("completed");
});
it("içerik yoksa nötr gün; yalnız uzak gelecek içeriği de görev olmaz", async () => {
  const s = students[2];
  let plan = await asUser(db, s.id, (tx) => ensureDailyPlan(tx, s));
  expect(plan.plan.status).toBe("no_content");
  await asUser(db, s.id, (tx) => joinCourse(tx, s, { code: courses[0].invite_code }));
  plan = await asUser(db, s.id, (tx) => ensureDailyPlan(tx, s));
  expect(plan.plan.status).toBe("no_content");
  expect(plan.items).toHaveLength(0);
});
it("akademisyen günlük katılımı ve öğrencinin sadece bu dersteki geçmişini görür", async () => {
  const stats = await asUser(db, teacher.id, (tx) => courseAnalytics(tx, teacher, courses[0].id));
  expect(Number(stats.plans[0].completed_items)).toBe(1);
  expect(Number(stats.participation[0].daily_students)).toBe(1);
  const detail = await asUser(db, teacher.id, (tx) =>
    studentAnalytics(tx, teacher, courses[0].id, students[0].id),
  );
  expect(detail.objectives).toHaveLength(1);
  expect(detail.plans).toHaveLength(1);
  expect(detail.attempts).toHaveLength(4);
  await expect(
    asUser(db, students[1].id, (tx) =>
      studentAnalytics(tx, students[1], courses[0].id, students[0].id),
    ),
  ).rejects.toThrow();
});
it("özel öğrenme geçmişi eşit tarihli kayıtlarda da tekrarsız sayfalanır", async () => {
  const s = students[0];
  await db.query(
    `insert into attempts(request_key,session_id,user_id,course_id,activity_version_id,objective_id,context,answer,correct,score,curriculum_id)
    select gen_random_uuid(),a.session_id,a.user_id,a.course_id,a.activity_version_id,a.objective_id,a.context,a.answer,a.correct,a.score,a.curriculum_id
    from (select * from attempts where user_id=$1 limit 1) a cross join generate_series(1,55)`,
    [s.id],
  );
  const first = await asUser(db, s.id, (tx) => learningHistory(tx, s, new URLSearchParams()));
  expect(first.items).toHaveLength(50);
  expect(first.next).not.toBeNull();
  const second = await asUser(db, s.id, (tx) =>
    learningHistory(tx, s, new URLSearchParams(first.next!)),
  );
  expect(new Set([...first.items, ...second.items].map((i) => i.id)).size).toBe(
    first.items.length + second.items.length,
  );
  expect(second.next).toBeNull();
  expect(
    (
      await asUser(db, students[2].id, (tx) =>
        learningHistory(tx, students[2], new URLSearchParams()),
      )
    ).items,
  ).toHaveLength(0);
});
