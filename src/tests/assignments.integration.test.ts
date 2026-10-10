import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { createDatabase, migrate, asUser, type RootDatabase } from "@/lib/db";
import { createLocalUser } from "@/modules/auth/service";
import { createCourse, createObjective, joinCourse } from "@/modules/courses/service";
import { saveActivity, publishActivity } from "@/modules/activities/service";
import {
  saveAssignment,
  publishAssignment,
  listAssignments,
  assignmentDetail,
  startAssignment,
  submitTraditional,
  reviewSubmission,
  uploadSubmissionFile,
  withdrawSubmission,
  manageAssignment,
} from "@/modules/assignments/service";
import { submitAnswer, startPractice } from "@/modules/learning/service";
import { ensureDailyPlan } from "@/modules/scheduling/service";
import type { User, Course } from "@/types/domain";
import { academicPdf } from "./fixtures";
let db: RootDatabase,
  teacher: User,
  otherTeacher: User,
  student: User,
  otherStudent: User,
  course: Course,
  versionId: string,
  storage: string;
const originalStorage = process.env.STORAGE_PATH;
beforeAll(async () => {
  await mkdir(".data", { recursive: true });
  storage = await mkdtemp(path.resolve(".data/test-assignments-"));
  process.env.STORAGE_PATH = storage;
  db = await createDatabase("memory://");
  await migrate(db);
  teacher = await createLocalUser(
    db,
    {
      email: "assign-teacher@test.edu",
      display_name: "Akademisyen",
      role: "teacher",
      password: "TestPass2026!",
    },
    true,
  );
  otherTeacher = await createLocalUser(
    db,
    {
      email: "assign-other-teacher@test.edu",
      display_name: "Başka Akademisyen",
      role: "teacher",
      password: "TestPass2026!",
    },
    true,
  );
  student = await createLocalUser(db, {
    email: "assign-student@test.edu",
    display_name: "Öğrenci",
    role: "student",
    password: "TestPass2026!",
  });
  otherStudent = await createLocalUser(db, {
    email: "assign-other-student@test.edu",
    display_name: "Başka Öğrenci",
    role: "student",
    password: "TestPass2026!",
  });
  course = await asUser(db, teacher.id, (tx) =>
    createCourse(tx, teacher, { title: "Ödev dersi", term: "Güz" }),
  );
  for (const s of [student, otherStudent])
    await asUser(db, s.id, (tx) => joinCourse(tx, s, { code: course.invite_code }));
  await asUser(db, teacher.id, async (tx) => {
    const o = await createObjective(tx, teacher, course.id, {
      title: "Temel kazanım",
      topic_title: "Temeller",
      week: 1,
    });
    const a = await saveActivity(tx, teacher, course.id, {
      objective_id: o.id,
      activity: {
        kind: "true_false",
        title: "Doğru önerme",
        instruction: "Seç",
        content: { statement: "Doğru önerme" },
        answer_key: { value: true },
        explanation: "Doğru",
      },
    });
    await publishActivity(tx, teacher, course.id, a.activity_id);
    versionId = a.id;
  });
});
afterAll(async () => {
  await db.close();
  if (originalStorage === undefined) delete process.env.STORAGE_PATH;
  else process.env.STORAGE_PATH = originalStorage;
  if (storage.startsWith(path.resolve(".data/test-assignments-")))
    await rm(storage, { recursive: true });
});
const future = () => new Date(Date.now() + 86400000).toISOString();
it("taslak ve hedef öğrenciler RLS ile ayrılır; başka akademisyen erişemez", async () => {
  const a = await asUser(db, teacher.id, (tx) =>
    saveAssignment(tx, teacher, course.id, {
      title: "Hedefli ödev",
      kind: "traditional",
      due_at: future(),
      target_ids: [student.id],
    }),
  );
  expect(
    await asUser(db, student.id, (tx) => listAssignments(tx, student, course.id)),
  ).toHaveLength(0);
  await asUser(db, teacher.id, (tx) => publishAssignment(tx, teacher, course.id, a.id));
  expect(
    await asUser(db, student.id, (tx) => listAssignments(tx, student, course.id)),
  ).toHaveLength(1);
  expect(
    await asUser(db, otherStudent.id, (tx) => listAssignments(tx, otherStudent, course.id)),
  ).toHaveLength(0);
  await expect(
    asUser(db, otherStudent.id, (tx) =>
      submitTraditional(tx, otherStudent, a.id, { request_key: randomUUID(), text: "Yetkisiz" }),
    ),
  ).rejects.toThrow("bulunamadı");
  await expect(
    asUser(db, otherTeacher.id, (tx) => assignmentDetail(tx, otherTeacher, course.id, a.id)),
  ).rejects.toThrow("erişim");
});
it("interaktif ödev sürümü sabittir, ilk başarı ayrılır ve günlük plan değişmez", async () => {
  const a = await asUser(db, teacher.id, (tx) =>
    saveAssignment(tx, teacher, course.id, {
      title: "İnteraktif ödev",
      kind: "interactive",
      due_at: future(),
      activity_version_ids: [versionId],
    }),
  );
  await asUser(db, teacher.id, (tx) => publishAssignment(tx, teacher, course.id, a.id));
  const plan = await asUser(db, student.id, (tx) => ensureDailyPlan(tx, student));
  const s = await asUser(db, student.id, (tx) => startAssignment(tx, student, a.id));
  expect((await asUser(db, student.id, (tx) => startAssignment(tx, student, a.id))).id).toBe(s.id);
  const wrong = { request_key: randomUUID(), activity_version_id: versionId, answer: false };
  await asUser(db, student.id, (tx) => submitAnswer(tx, student, s.id, wrong));
  await asUser(db, student.id, (tx) =>
    submitAnswer(tx, student, s.id, {
      request_key: randomUUID(),
      activity_version_id: versionId,
      answer: true,
    }),
  );
  const detail = await asUser(db, teacher.id, (tx) =>
    assignmentDetail(tx, teacher, course.id, a.id),
  );
  expect(detail.submissions[0].status).toBe("submitted");
  expect(Number(detail.versions[0].first_score)).toBe(0);
  const after = await asUser(db, student.id, (tx) => ensureDailyPlan(tx, student));
  expect(after.plan.status).toBe("ready");
  expect(after.items.map((i) => i.id)).toEqual(plan.items.map((i) => i.id));
  expect(
    await db.query("select * from objective_mastery where user_id=$1", [student.id]),
  ).toHaveLength(0);
  await expect(asUser(db, student.id, (tx) => startAssignment(tx, student, a.id))).rejects.toThrow(
    "inceleme",
  );
  const voluntary = await asUser(db, student.id, (tx) =>
    startPractice(tx, student, { course_id: course.id }),
  );
  await asUser(db, student.id, (tx) =>
    submitAnswer(tx, student, voluntary.id, {
      request_key: randomUUID(),
      activity_version_id: versionId,
      answer: false,
    }),
  );
  const [mastery] = await db.query<{ first_attempts: number; distinct_activities: number }>(
    "select first_attempts,distinct_activities from objective_mastery where user_id=$1",
    [student.id],
  );
  expect(mastery.first_attempts).toBe(1);
  expect(mastery.distinct_activities).toBe(1);
});
it("PDF teslimi, geri bildirim, düzeltme ve yeniden teslim geçmişi korunur", async () => {
  const a = await asUser(db, teacher.id, (tx) =>
    saveAssignment(tx, teacher, course.id, {
      title: "PDF ödev",
      kind: "traditional",
      due_at: future(),
    }),
  );
  await asUser(db, teacher.id, (tx) => publishAssignment(tx, teacher, course.id, a.id));
  const file = await uploadSubmissionFile(
    db,
    student,
    course.id,
    a.id,
    new File([Buffer.from(academicPdf())], "odev.pdf", { type: "application/pdf" }),
  );
  expect(
    await asUser(db, otherStudent.id, (tx) =>
      tx.query("select * from files where id=$1", [file.id]),
    ),
  ).toHaveLength(0);
  const request = { request_key: randomUUID(), text: "İlk teslim", file_id: file.id };
  const submitted = await asUser(db, student.id, (tx) =>
    submitTraditional(tx, student, a.id, request),
  );
  expect(
    (await asUser(db, student.id, (tx) => submitTraditional(tx, student, a.id, request))).id,
  ).toBe(submitted.id);
  await expect(
    asUser(db, otherStudent.id, (tx) =>
      submitTraditional(tx, otherStudent, a.id, { ...request, request_key: randomUUID() }),
    ),
  ).rejects.toThrow("sana");
  await asUser(db, teacher.id, (tx) =>
    reviewSubmission(tx, teacher, course.id, submitted.id, {
      feedback: "Kaynak ekle.",
      returned: true,
    }),
  );
  const revised = await asUser(db, student.id, (tx) =>
    submitTraditional(tx, student, a.id, {
      request_key: randomUUID(),
      text: "Kaynak eklenmiş teslim",
      link: "https://example.edu/source",
    }),
  );
  expect(revised.current_revision).toBe(2);
  await asUser(db, teacher.id, (tx) =>
    reviewSubmission(tx, teacher, course.id, submitted.id, {
      feedback: "Kaynaklar uygun.",
      grade: 90,
    }),
  );
  const detail = await asUser(db, student.id, (tx) =>
    assignmentDetail(tx, student, course.id, a.id),
  );
  expect(detail.versions).toHaveLength(2);
  expect(detail.feedback).toHaveLength(2);
  expect(detail.submissions[0].status).toBe("reviewed");
  await expect(
    asUser(db, student.id, (tx) => withdrawSubmission(tx, student, a.id)),
  ).rejects.toThrow("inceleme");
  await expect(
    asUser(db, student.id, (tx) =>
      tx.query("update submission_versions set text='sil' where submission_id=$1 returning id", [
        submitted.id,
      ]),
    ),
  ).resolves.toHaveLength(0);
});
it("geç teslim, geri çekme ve ödev kapatma kuralları sunucuda uygulanır", async () => {
  const a = await asUser(db, teacher.id, (tx) =>
    saveAssignment(tx, teacher, course.id, {
      title: "Geç teslim",
      kind: "traditional",
      due_at: new Date(Date.now() - 86400000).toISOString(),
    }),
  );
  await asUser(db, teacher.id, (tx) => publishAssignment(tx, teacher, course.id, a.id));
  await expect(
    asUser(db, student.id, (tx) =>
      submitTraditional(tx, student, a.id, { request_key: randomUUID(), text: "Geç" }),
    ),
  ).rejects.toThrow("tarihi geçti");
  await asUser(db, teacher.id, (tx) =>
    manageAssignment(tx, teacher, course.id, a.id, { allow_late: true }),
  );
  await asUser(db, student.id, (tx) =>
    submitTraditional(tx, student, a.id, { request_key: randomUUID(), text: "Geç" }),
  );
  let detail = await asUser(db, student.id, (tx) => assignmentDetail(tx, student, course.id, a.id));
  expect(detail.versions[0].late).toBe(true);
  await asUser(db, student.id, (tx) => withdrawSubmission(tx, student, a.id));
  await asUser(db, student.id, (tx) =>
    submitTraditional(tx, student, a.id, { request_key: randomUUID(), text: "Yeniden" }),
  );
  detail = await asUser(db, student.id, (tx) => assignmentDetail(tx, student, course.id, a.id));
  expect(detail.versions).toHaveLength(2);
  await asUser(db, teacher.id, (tx) =>
    manageAssignment(tx, teacher, course.id, a.id, { status: "closed" }),
  );
  await expect(
    asUser(db, student.id, (tx) => withdrawSubmission(tx, student, a.id)),
  ).rejects.toThrow("kapalı");
});
