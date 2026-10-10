import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { asUser, createDatabase, migrate, type RootDatabase } from "@/lib/db";
import { createLocalUser } from "@/modules/auth/service";
import {
  createCourse,
  createObjective,
  joinCourse,
  archiveCourse,
} from "@/modules/courses/service";
import { saveActivity, publishActivity } from "@/modules/activities/service";
import { changeGap, gapDetail } from "@/modules/learning/gaps";
import { courseAnalytics, studentAnalytics } from "@/modules/analytics/service";
import { ensureDailyPlan, startPlanItem } from "@/modules/scheduling/service";
import { sessionView, submitAnswer } from "@/modules/learning/service";
import { exportPersonalData } from "@/modules/auth/export";
import type { Course, User } from "@/types/domain";
let db: RootDatabase,
  teacher: User,
  otherTeacher: User,
  student: User,
  peer: User,
  outsider: User,
  course: Course;
let objectiveId: string, closedId: string;
beforeAll(async () => {
  db = await createDatabase("memory://");
  await migrate(db);
  const makeUser = (name: string, role: "teacher" | "student") =>
    createLocalUser(
      db,
      {
        email: `${name}@support.test`,
        display_name: name,
        password: "TestPass2026!",
        role,
      },
      role === "teacher",
    );
  teacher = await makeUser("Teacher", "teacher");
  otherTeacher = await makeUser("OtherTeacher", "teacher");
  student = await makeUser("Student", "student");
  peer = await makeUser("Peer", "student");
  outsider = await makeUser("Outsider", "student");
  course = await asUser(db, teacher.id, (tx) =>
    createCourse(tx, teacher, { title: "Destek Dersi", term: "Güz" }),
  );
  const objective = await asUser(db, teacher.id, (tx) =>
    createObjective(tx, teacher, course.id, {
      topic_title: "Algoritmalar",
      title: "Sonluluk koşulunu açıklayabilme",
      week: 1,
    }),
  );
  objectiveId = objective.id;
  const closed = await asUser(db, teacher.id, (tx) =>
    createObjective(tx, teacher, course.id, {
      topic_title: "Kapalı içerik",
      title: "Henüz erişilemeyen kazanım",
      week: 2,
      accessible: false,
    }),
  );
  closedId = closed.id;
  const activity = await asUser(db, teacher.id, (tx) =>
    saveActivity(tx, teacher, course.id, {
      objective_id: objectiveId,
      activity: {
        kind: "true_false",
        title: "Sonlu algoritma",
        instruction: "Önermeyi değerlendir.",
        content: { statement: "Algoritma sonlu adımlardan oluşur." },
        answer_key: { value: true },
        explanation: "Algoritma bir sonuç üretip sonlanır.",
        difficulty: 1,
      },
    }),
  );
  await asUser(db, teacher.id, (tx) =>
    publishActivity(tx, teacher, course.id, activity.activity_id),
  );
  for (const user of [student, peer])
    await asUser(db, user.id, (tx) => joinCourse(tx, user, { code: course.invite_code }));
});
afterAll(async () => {
  await db.close();
});
const input = (note = "Döngünün durma koşulunu karıştırıyorum.", revision?: number) => ({
  course_id: course.id,
  objective_id: objectiveId,
  note,
  expected_revision: revision ?? null,
});

it("yalnız öğrenci kendi erişilebilir kazanımına bildirim açar; özel not ve geçmiş sınıf arkadaşına açılmaz", async () => {
  await expect(
    asUser(db, outsider.id, (tx) => changeGap(tx, outsider, input(), "report")),
  ).rejects.toThrow();
  await expect(
    asUser(db, teacher.id, (tx) => changeGap(tx, teacher, input(), "report")),
  ).rejects.toThrow();
  await expect(
    asUser(db, student.id, (tx) =>
      changeGap(tx, student, { ...input(), objective_id: closedId }, "report"),
    ),
  ).rejects.toThrow("erişilebilir");
  const [a, b] = await Promise.all(
    [1, 2].map(() => asUser(db, student.id, (tx) => changeGap(tx, student, input(), "report"))),
  );
  expect(a.revision).toBe(1);
  expect(b.revision).toBe(1);
  const detail = await asUser(db, student.id, (tx) =>
    gapDetail(tx, student, course.id, objectiveId),
  );
  expect(detail.history).toHaveLength(1);
  expect(
    (await asUser(db, peer.id, (tx) => gapDetail(tx, peer, course.id, objectiveId))).report,
  ).toBeNull();
  expect(
    await asUser(db, peer.id, (tx) =>
      tx.query("select * from gap_events where user_id=$1", [student.id]),
    ),
  ).toHaveLength(0);
  expect(
    await asUser(db, otherTeacher.id, (tx) => tx.query("select * from gap_events")),
  ).toHaveLength(0);
  await expect(
    asUser(db, student.id, (tx) =>
      tx.query("update gap_reports set resolved=true where user_id=$1", [student.id]),
    ),
  ).rejects.toThrow("permission denied");
  await expect(asUser(db, teacher.id, (tx) => tx.query("delete from gap_events"))).rejects.toThrow(
    "permission denied",
  );
  await expect(
    asUser(db, peer.id, (tx) =>
      tx.query("select * from set_gap_report($1,$2,$3,'resolve','',1)", [
        course.id,
        objectiveId,
        student.id,
      ]),
    ),
  ).rejects.toThrow("GAP_ACCESS_DENIED");
});
it("akademisyen yalnız kendi sınıfının bildirimini kapatır; eski sürüm yeni öğrenci notunu kapatamaz", async () => {
  const changed = await asUser(db, student.id, (tx) =>
    changeGap(tx, student, input("Özellikle while koşulunda zorlanıyorum.", 1), "report"),
  );
  expect(changed.revision).toBe(2);
  await expect(
    asUser(db, otherTeacher.id, (tx) =>
      changeGap(tx, otherTeacher, input("Yanıt", 2), "resolve", student.id),
    ),
  ).rejects.toThrow();
  await expect(
    asUser(db, peer.id, (tx) => changeGap(tx, peer, input("Yanıt", 2), "resolve", student.id)),
  ).rejects.toThrow("sana ait değil");
  await expect(
    asUser(db, teacher.id, (tx) =>
      changeGap(tx, teacher, input("Eski yanıt", 1), "resolve", student.id),
    ),
  ).rejects.toThrow("başka bir yerde");
  expect(
    (await asUser(db, student.id, (tx) => gapDetail(tx, student, course.id, objectiveId))).report
      ?.resolved,
  ).toBe(false);
  const feedback = "Durma koşulunu örnek üzerinden birlikte inceledik.";
  const resolved = await asUser(db, teacher.id, (tx) =>
    changeGap(tx, teacher, input(feedback, 2), "resolve", student.id),
  );
  expect(resolved.resolved).toBe(true);
  expect(resolved.resolved_by).toBe(teacher.id);
  expect(resolved.revision).toBe(3);
  await asUser(db, teacher.id, (tx) =>
    changeGap(tx, teacher, input(feedback, 2), "resolve", student.id),
  );
  const detail = await asUser(db, student.id, (tx) =>
    gapDetail(tx, student, course.id, objectiveId),
  );
  expect(detail.history).toHaveLength(3);
  expect(detail.history[0]).toMatchObject({
    action: "resolved",
    actor_role: "teacher",
    note: feedback,
  });
  const analytics = await asUser(db, teacher.id, (tx) =>
    studentAnalytics(tx, teacher, course.id, student.id),
  );
  expect(analytics.objectives.find((o) => o.id === objectiveId)).toMatchObject({
    gap_resolved: true,
    resolution_note: feedback,
  });
  const overview = await asUser(db, teacher.id, (tx) => courseAnalytics(tx, teacher, course.id));
  expect(overview.objectives.find((o) => o.id === objectiveId)?.reported_gaps).toBe(0);
});
it("bildirim yeniden açılabilir, öğrenci kapatabilir ve geçmiş kişisel dışa aktarımda korunur", async () => {
  await expect(
    asUser(db, student.id, (tx) => changeGap(tx, student, input("Yeni soru", 2), "report")),
  ).rejects.toThrow("başka bir yerde");
  const reopened = await asUser(db, student.id, (tx) =>
    changeGap(tx, student, input("Başka bir döngü örneğinde desteğe ihtiyacım var.", 3), "report"),
  );
  expect(reopened.revision).toBe(4);
  expect(reopened.resolved_by).toBeNull();
  expect(reopened.resolution_note).toBe("");
  await asUser(db, student.id, (tx) => changeGap(tx, student, input("", 4), "resolve"));
  const detail = await asUser(db, student.id, (tx) =>
    gapDetail(tx, student, course.id, objectiveId),
  );
  expect(detail.history.map((event) => event.action)).toEqual([
    "resolved",
    "reopened",
    "resolved",
    "updated",
    "reported",
  ]);
  const exported = await asUser(db, student.id, (tx) => exportPersonalData(tx, student));
  expect(exported.gap_events).toHaveLength(5);
  expect(
    (await asUser(db, peer.id, (tx) => exportPersonalData(tx, peer))).gap_events,
  ).toHaveLength(0);
  expect(
    await db.query("select * from objective_mastery where user_id=$1", [student.id]),
  ).toHaveLength(0);
  expect(
    await db.query("select * from xp_transactions where user_id=$1", [student.id]),
  ).toHaveLength(0);
});
it("destek önceliği yalnız kendi başlanmamış planını yeniler; başlamış/tamamlanmış plan ve ödül değişmez", async () => {
  const current = await asUser(db, student.id, (tx) => ensureDailyPlan(tx, student));
  const peersPlan = await asUser(db, peer.id, (tx) => ensureDailyPlan(tx, peer));
  await asUser(db, student.id, (tx) =>
    changeGap(tx, student, input("Sonluluk tekrar gerekli.", 5), "report"),
  );
  expect(
    (
      await db.query<{ status: string }>("select status from daily_plans where id=$1", [
        current.plan.id,
      ])
    )[0].status,
  ).toBe("invalidated");
  expect(
    (
      await db.query<{ status: string }>("select status from daily_plans where id=$1", [
        peersPlan.plan.id,
      ])
    )[0].status,
  ).toBe("ready");
  const updated = await asUser(db, student.id, (tx) => ensureDailyPlan(tx, student));
  expect(updated.plan.revision).toBe(current.plan.revision + 1);
  expect(updated.items[0].reason).toBe("Bildirdiğin eksiği tamamla");
  const session = await asUser(db, student.id, (tx) =>
    startPlanItem(tx, student, updated.items[0].id),
  );
  await asUser(db, teacher.id, (tx) =>
    changeGap(tx, teacher, input("Örneği birlikte çözdük.", 6), "resolve", student.id),
  );
  const unchanged = await asUser(db, student.id, (tx) => ensureDailyPlan(tx, student));
  expect(unchanged.plan.status).toBe("in_progress");
  expect(unchanged.plan.revision).toBe(updated.plan.revision);
  const view = await asUser(db, student.id, (tx) => sessionView(tx, student, session.id));
  await asUser(db, student.id, (tx) =>
    submitAnswer(tx, student, session.id, {
      activity_version_id: view.activity!.id,
      answer: true,
      request_key: randomUUID(),
    }),
  );
  const before = await db.query("select * from xp_transactions where user_id=$1 order by id", [
    student.id,
  ]);
  await asUser(db, student.id, (tx) =>
    changeGap(tx, student, input("Yeni bir sorum var.", 7), "report"),
  );
  const completed = await asUser(db, student.id, (tx) => ensureDailyPlan(tx, student));
  expect(completed.plan.status).toBe("completed");
  expect(completed.plan.revision).toBe(updated.plan.revision);
  expect(
    await db.query("select * from xp_transactions where user_id=$1 order by id", [student.id]),
  ).toEqual(before);
});
it("arşivlenen dersin bildirimi değiştirilemez", async () => {
  await asUser(db, teacher.id, (tx) => archiveCourse(tx, teacher, course.id, true));
  await expect(
    asUser(db, teacher.id, (tx) => changeGap(tx, teacher, input("", 8), "resolve", student.id)),
  ).rejects.toThrow("yetkin yok");
  await expect(
    asUser(db, student.id, (tx) => changeGap(tx, student, input("", 8), "resolve")),
  ).rejects.toThrow();
});
