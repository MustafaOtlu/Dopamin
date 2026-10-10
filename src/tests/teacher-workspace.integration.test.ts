import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { createDatabase, migrate, asUser, type RootDatabase } from "@/lib/db";
import { createLocalUser } from "@/modules/auth/service";
import {
  createCourse,
  createObjective,
  joinCourse,
  archiveCourse,
} from "@/modules/courses/service";
import { saveActivity } from "@/modules/activities/service";
import { changeGap } from "@/modules/learning/gaps";
import {
  saveAssignment,
  publishAssignment,
  submitTraditional,
  reviewSubmission,
} from "@/modules/assignments/service";
import { teacherWorkspace, courseGradebook } from "@/modules/analytics/teacher-workspace";
import { classRanking } from "@/modules/rewards/service";
import type { Course, User } from "@/types/domain";
let db: RootDatabase,
  teacher: User,
  other: User,
  student: User,
  peer: User,
  course: Course,
  assignmentId: string,
  submissionId: string;
beforeAll(async () => {
  db = await createDatabase("memory://");
  await migrate(db);
  const user = (name: string, role: "teacher" | "student") =>
    createLocalUser(
      db,
      { email: `${name}@desk.test`, display_name: name, role, password: "TestPass2026!" },
      role === "teacher",
    );
  teacher = await user("Teacher", "teacher");
  other = await user("Other", "teacher");
  student = await user("Student", "student");
  peer = await user("Peer", "student");
  course = await asUser(db, teacher.id, (tx) =>
    createCourse(tx, teacher, { title: "Ders defteri", term: "Güz" }),
  );
  for (const s of [student, peer])
    await asUser(db, s.id, (tx) => joinCourse(tx, s, { code: course.invite_code }));
  const objective = await asUser(db, teacher.id, (tx) =>
    createObjective(tx, teacher, course.id, {
      topic_title: "Temeller",
      title: "İlk kazanım",
      week: 1,
    }),
  );
  const activity = await asUser(db, teacher.id, (tx) =>
    saveActivity(tx, teacher, course.id, {
      objective_id: objective.id,
      activity: {
        kind: "true_false",
        title: "İncelenecek önerme",
        instruction: "Seç",
        content: { statement: "Doğru" },
        answer_key: { value: true },
        explanation: "Açıklama",
      },
    }),
  );
  await db.query("update activities set status='needs_review' where id=$1", [activity.activity_id]);
  await asUser(db, student.id, (tx) =>
    changeGap(
      tx,
      student,
      {
        course_id: course.id,
        objective_id: objective.id,
        note: "Bir örnek daha gerekiyor.",
        expected_revision: null,
      },
      "report",
    ),
  );
  const assignment = await asUser(db, teacher.id, async (tx) => {
    const a = await saveAssignment(tx, teacher, course.id, {
      title: "Okuma raporu",
      kind: "traditional",
      due_at: new Date(Date.now() + 86400000).toISOString(),
      allow_late: true,
    });
    await publishAssignment(tx, teacher, course.id, a.id);
    return a;
  });
  assignmentId = assignment.id;
  const s = await asUser(db, student.id, (tx) =>
    submitTraditional(tx, student, assignmentId, {
      request_key: randomUUID(),
      text: "Öğrencinin raporu.",
    }),
  );
  submissionId = s.id;
});
afterAll(async () => {
  await db.close();
});
it("gerçek inceleme, teslim ve destek kayıtlarını doğru dersle bağlar; oyun verisi taşımaz", async () => {
  const desk = await asUser(db, teacher.id, (tx) => teacherWorkspace(tx, teacher));
  expect(desk.courses).toHaveLength(1);
  expect(desk.courses[0]).toMatchObject({ students: 2, grading: 1, review: 1, support: 1 });
  expect(desk.queue.map((i) => i.kind).sort()).toEqual(["content", "grading", "support"]);
  expect(desk.queue.find((i) => i.kind === "grading")?.id).toBe(assignmentId);
  expect(desk.deadlines[0]).toMatchObject({ id: assignmentId, submitted: 1, targets: 2 });
  expect(JSON.stringify(desk)).not.toMatch(/"(?:xp|tokens|cosmetics)"/);
});
it("öğrenci ve başka öğretmen sınıf defterine erişemez; öğretmen XP sıralamasını alamaz", async () => {
  await expect(asUser(db, student.id, (tx) => teacherWorkspace(tx, student))).rejects.toThrow();
  await expect(
    asUser(db, other.id, (tx) => courseGradebook(tx, other, course.id)),
  ).rejects.toThrow();
  await expect(
    asUser(db, student.id, (tx) => courseGradebook(tx, student, course.id)),
  ).rejects.toThrow();
  expect((await asUser(db, other.id, (tx) => teacherWorkspace(tx, other))).courses).toEqual([]);
  expect((await asUser(db, other.id, (tx) => teacherWorkspace(tx, other))).queue).toEqual([]);
  await expect(
    asUser(db, teacher.id, (tx) => classRanking(tx, teacher, course.id, new URLSearchParams())),
  ).rejects.toThrow();
});
it("teslim etmeyen öğrenciyi boş notla gösterir ve son tarih geçince ayırt eder", async () => {
  let rows = await asUser(db, teacher.id, (tx) => courseGradebook(tx, teacher, course.id));
  expect(rows.find((r) => r.user_id === peer.id)).toMatchObject({
    status: "not_started",
    grade: null,
    submitted_at: null,
  });
  expect(rows.find((r) => r.user_id === student.id)).toMatchObject({
    status: "submitted",
    grade: null,
  });
  await db.query("update assignments set due_at=now()-interval '1 hour' where id=$1", [
    assignmentId,
  ]);
  rows = await asUser(db, teacher.id, (tx) => courseGradebook(tx, teacher, course.id));
  expect(rows.find((r) => r.user_id === peer.id)?.status).toBe("missing");
});
it("değerlendirme sonrası kuyruk kapanır, sıfır notu ve güncel geri bildirim deftere geçer", async () => {
  await asUser(db, teacher.id, (tx) =>
    reviewSubmission(tx, teacher, course.id, submissionId, {
      grade: 0,
      feedback: "Kaynakları yeniden inceleyin.",
      returned: false,
    }),
  );
  const rows = await asUser(db, teacher.id, (tx) => courseGradebook(tx, teacher, course.id));
  expect(rows.find((r) => r.user_id === student.id)).toMatchObject({
    status: "reviewed",
    grade: 0,
    feedback: "Kaynakları yeniden inceleyin.",
    revision: 1,
  });
  const desk = await asUser(db, teacher.id, (tx) => teacherWorkspace(tx, teacher));
  expect(desk.courses[0].grading).toBe(0);
  expect(desk.queue.some((i) => i.kind === "grading")).toBe(false);
});
it("arşivlenen ders çalışma masasında bekleyen iş bırakmaz", async () => {
  await asUser(db, teacher.id, (tx) => archiveCourse(tx, teacher, course.id, true));
  const desk = await asUser(db, teacher.id, (tx) => teacherWorkspace(tx, teacher));
  expect(desk).toEqual({ courses: [], queue: [], deadlines: [] });
});
