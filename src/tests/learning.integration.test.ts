import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { createDatabase, migrate, asUser, type RootDatabase } from "@/lib/db";
import { createLocalUser } from "@/modules/auth/service";
import {
  createCourse,
  createObjective,
  joinCourse,
  rotateInvite,
  updateCourse,
  archiveCourse,
  archivedCourses,
  studentCourse,
} from "@/modules/courses/service";
import { saveActivity, publishActivity, listActivities } from "@/modules/activities/service";
import {
  startPractice,
  submitAnswer,
  sessionView,
  listMistakes,
  startMistakes,
} from "@/modules/learning/service";
import { courseAnalytics } from "@/modules/analytics/service";
import type { User, Course } from "@/types/domain";
import { today } from "@/lib/time";
import { masteryState } from "@/modules/mastery/service";
import { exportPersonalData } from "@/modules/auth/export";

let db: RootDatabase,
  teacher: User,
  otherTeacher: User,
  student: User,
  otherStudent: User,
  pendingTeacher: User,
  course: Course;
const activityIds: string[] = [];
beforeAll(async () => {
  db = await createDatabase("memory://");
  await migrate(db);
  teacher = await createLocalUser(
    db,
    {
      email: "teacher@test.edu",
      password: "TestPass2026!",
      display_name: "Öğretmen Bir",
      role: "teacher",
    },
    true,
  );
  otherTeacher = await createLocalUser(
    db,
    {
      email: "teacher2@test.edu",
      password: "TestPass2026!",
      display_name: "Öğretmen İki",
      role: "teacher",
    },
    true,
  );
  student = await createLocalUser(db, {
    email: "student@test.edu",
    password: "TestPass2026!",
    display_name: "Öğrenci Bir",
    role: "student",
  });
  otherStudent = await createLocalUser(db, {
    email: "student2@test.edu",
    password: "TestPass2026!",
    display_name: "Öğrenci İki",
    role: "student",
  });
  pendingTeacher = await createLocalUser(db, {
    email: "pending@test.edu",
    password: "TestPass2026!",
    display_name: "Doğrulanmayan Öğretmen",
    role: "teacher",
  });
  course = await asUser(db, teacher.id, (tx) =>
    createCourse(tx, teacher, { title: "Test Dersi", term: "Güz" }),
  );
  await asUser(db, teacher.id, async (tx) => {
    const o = await createObjective(tx, teacher, course.id, {
      topic_title: "Test Konusu",
      title: "Test kazanımını gösterebilme",
      week: 1,
      scheduled_date: today(),
    });
    const base = { title: "Etkinlik", instruction: "Çöz", explanation: "Açıklama", difficulty: 1 };
    const inputs = [
      {
        ...base,
        kind: "true_false",
        content: { statement: "Doğru önerme" },
        answer_key: { value: true },
      },
      {
        ...base,
        kind: "matching",
        content: {
          left: [
            { id: "a", label: "A" },
            { id: "b", label: "B" },
          ],
          right: [
            { id: "x", label: "X" },
            { id: "y", label: "Y" },
          ],
        },
        answer_key: { pairs: { a: "x", b: "y" } },
      },
      {
        ...base,
        kind: "ordering",
        content: {
          items: [
            { id: "a", label: "Başla" },
            { id: "b", label: "Bitir" },
          ],
        },
        answer_key: { order: ["a", "b"] },
      },
    ];
    for (const activity of inputs) {
      const a = await saveActivity(tx, teacher, course.id, { objective_id: o.id, activity });
      activityIds.push(a.activity_id);
      await publishActivity(tx, teacher, course.id, a.activity_id);
    }
    await saveActivity(tx, teacher, course.id, {
      objective_id: o.id,
      activity: {
        ...base,
        kind: "true_false",
        content: { statement: "Taslak" },
        answer_key: { value: false },
      },
    });
  });
});
afterAll(async () => {
  await db.close();
});
describe("M1 gerçek PostgreSQL ve RLS", () => {
  it("migration idempotent; doğrulanmayan akademisyen ders açamaz", async () => {
    await migrate(db);
    await expect(
      asUser(db, pendingTeacher.id, (tx) =>
        createCourse(tx, pendingTeacher, { title: "X ders", term: "Güz" }),
      ),
    ).rejects.toThrow("doğrulanması");
    await expect(
      asUser(db, student.id, (tx) =>
        tx.query("insert into courses(owner_id,title,term) values($1,'Yetkisiz','Güz')", [
          student.id,
        ]),
      ),
    ).rejects.toThrow();
  });
  it("öğrenci kodla bir kez katılır; geçersiz kod reddedilir", async () => {
    await asUser(db, student.id, (tx) => joinCourse(tx, student, { code: course.invite_code }));
    await asUser(db, student.id, (tx) => joinCourse(tx, student, { code: course.invite_code }));
    expect(
      (
        await db.query("select * from enrollments where course_id=$1 and user_id=$2", [
          course.id,
          student.id,
        ])
      ).length,
    ).toBe(1);
    await expect(
      asUser(db, student.id, (tx) => joinCourse(tx, student, { code: "INVALID1" })),
    ).rejects.toThrow("geçersiz");
  });
  it("başka öğretmen/öğrenci dersi göremez; öğrenci taslağı ve cevap anahtarını alamaz", async () => {
    expect(
      await asUser(db, otherTeacher.id, (tx) =>
        tx.query("select * from courses where id=$1", [course.id]),
      ),
    ).toHaveLength(0);
    expect(
      await asUser(db, otherStudent.id, (tx) =>
        tx.query("select * from courses where id=$1", [course.id]),
      ),
    ).toHaveLength(0);
    const items = await asUser(db, student.id, (tx) => listActivities(tx, student, course.id));
    expect(items).toHaveLength(3);
    items.forEach((i) => expect(i).not.toHaveProperty("answer_key"));
    expect(
      await asUser(db, student.id, (tx) =>
        tx.query("select * from activities where status='draft'"),
      ),
    ).toHaveLength(0);
    await expect(
      asUser(db, student.id, (tx) =>
        tx.query("update profiles set role='teacher',teacher_verified=true where id=$1", [
          student.id,
        ]),
      ),
    ).rejects.toThrow();
    await expect(
      asUser(db, student.id, (tx) => tx.query("select * from local_credentials")),
    ).rejects.toThrow();
  });
  it("üç oyun çözülür, cevap idempotent kaydedilir, oturum tekrarı hatayı kapatmaz", async () => {
    const session = await asUser(db, student.id, (tx) =>
      startPractice(tx, student, { course_id: course.id }),
    );
    const view = await asUser(db, student.id, (tx) => sessionView(tx, student, session.id));
    expect(view.activity).not.toHaveProperty("answer_key");
    const request = {
      request_key: randomUUID(),
      activity_version_id: session.items[0],
      answer: false,
    };
    const result = await asUser(db, student.id, (tx) =>
      submitAnswer(tx, student, session.id, request),
    );
    expect(result.correct).toBe(false);
    const replay = await asUser(db, student.id, (tx) =>
      submitAnswer(tx, student, session.id, request),
    );
    expect(replay.replayed).toBe(true);
    expect(
      (await db.query("select * from attempts where session_id=$1", [session.id])).length,
    ).toBe(1);
    await expect(
      asUser(db, otherStudent.id, (tx) => sessionView(tx, otherStudent, session.id)),
    ).rejects.toThrow("bulunamadı");
    await asUser(db, student.id, (tx) =>
      submitAnswer(tx, student, session.id, {
        request_key: randomUUID(),
        activity_version_id: session.items[1],
        answer: { a: "x", b: "y" },
      }),
    );
    const last = await asUser(db, student.id, (tx) =>
      submitAnswer(tx, student, session.id, {
        request_key: randomUUID(),
        activity_version_id: session.items[2],
        answer: ["a", "b"],
      }),
    );
    expect(last.session.status).toBe("reviewing");
    const review = await asUser(db, student.id, (tx) =>
      submitAnswer(tx, student, session.id, {
        request_key: randomUUID(),
        activity_version_id: session.items[0],
        answer: true,
      }),
    );
    expect(review.session.status).toBe("completed");
    expect(await asUser(db, student.id, (tx) => listMistakes(tx, student))).toHaveLength(1);
    const teacherView = await asUser(db, teacher.id, (tx) =>
      courseAnalytics(tx, teacher, course.id),
    );
    expect(teacherView.attempts).toHaveLength(4);
    await expect(
      asUser(db, otherTeacher.id, (tx) => courseAnalytics(tx, otherTeacher, course.id)),
    ).rejects.toThrow("erişim");
  });
  it("yalnız Hatalarım'da doğru çözüm bekleyen hatayı kapatır", async () => {
    const s = await asUser(db, student.id, (tx) => startMistakes(tx, student));
    await asUser(db, student.id, (tx) =>
      submitAnswer(tx, student, s.id, {
        request_key: randomUUID(),
        activity_version_id: s.items[0],
        answer: true,
      }),
    );
    expect(await asUser(db, student.id, (tx) => listMistakes(tx, student))).toHaveLength(0);
    expect((await db.query("select * from attempts where user_id=$1", [student.id])).length).toBe(
      5,
    );
  });
  it("yayın sürümü değiştirilemez; yeni sürüm eski cevapları korur", async () => {
    const [old] = await db.query<{ id: string }>(
      "select id from activity_versions where activity_id=$1 and version=1",
      [activityIds[0]],
    );
    await expect(
      asUser(db, teacher.id, (tx) =>
        tx.query("update activity_versions set title='Bozuk' where id=$1", [old.id]),
      ),
    ).rejects.toThrow("IMMUTABLE");
    const [obj] = await db.query<{ id: string }>("select id from objectives where course_id=$1", [
      course.id,
    ]);
    await asUser(db, teacher.id, (tx) =>
      saveActivity(
        tx,
        teacher,
        course.id,
        {
          objective_id: obj.id,
          activity: {
            kind: "true_false",
            title: "Yeni sürüm",
            instruction: "Çöz",
            content: { statement: "Yeni önerme" },
            answer_key: { value: false },
            explanation: "Yeni açıklama",
          },
        },
        activityIds[0],
      ),
    );
    const attempts = await db.query<{ activity_version_id: string }>(
      "select activity_version_id from attempts where activity_version_id=$1",
      [old.id],
    );
    expect(attempts.length).toBeGreaterThan(0);
    const versions = await db.query("select id from activity_versions where activity_id=$1", [
      activityIds[0],
    ]);
    expect(versions).toHaveLength(2);
  });
  it("iptal edilmiş kodla yeni katılım olmaz", async () => {
    await asUser(db, teacher.id, (tx) => rotateInvite(tx, teacher, course.id, true));
    await expect(
      asUser(db, otherStudent.id, (tx) =>
        joinCourse(tx, otherStudent, { code: course.invite_code }),
      ),
    ).rejects.toThrow("geçersiz");
  });
  it("kişisel dışa aktarım yalnız kendi cevaplarını içerir; akademisyenin geniş sınıf yetkisi öğrenci verisini katmaz", async () => {
    const personal = await asUser(db, student.id, (tx) => exportPersonalData(tx, student));
    expect(personal.profile.id).toBe(student.id);
    expect(personal.attempts.length).toBeGreaterThan(0);
    expect(JSON.stringify(personal)).not.toContain(otherStudent.email);
    expect(JSON.stringify(personal)).not.toContain("password_hash");
    expect(JSON.stringify(personal)).not.toContain("token_hash");
    const own = await asUser(db, teacher.id, (tx) => exportPersonalData(tx, teacher));
    expect(own.profile.id).toBe(teacher.id);
    expect(own.attempts).toHaveLength(0);
    expect(own.sessions).toHaveLength(0);
    expect(JSON.stringify(own)).not.toContain(student.email);
    expect(own.courses.some((c) => c.id === course.id)).toBe(true);
  });
  it("ders ayarları yalnız sahibince değişir; arşiv ve geri açma üyelik/sonuçları korur ve eski kodu canlandırmaz", async () => {
    const attemptsBefore = (
      await db.query("select id from attempts where course_id=$1", [course.id])
    ).length;
    await expect(
      asUser(db, otherTeacher.id, (tx) => archiveCourse(tx, otherTeacher, course.id, true)),
    ).rejects.toThrow("erişim");
    await expect(
      asUser(db, student.id, (tx) =>
        updateCourse(tx, student, course.id, { title: "Changed", term: "Güz" }),
      ),
    ).rejects.toThrow("akademisyen");
    const updated = await asUser(db, teacher.id, (tx) =>
      updateCourse(tx, teacher, course.id, {
        title: "Güncellenmiş Ders",
        description: "Yeni açıklama",
        term: "Bahar",
        code: "NEW101",
        color: "teal",
      }),
    );
    expect(updated.title).toBe("Güncellenmiş Ders");
    await asUser(db, teacher.id, (tx) => archiveCourse(tx, teacher, course.id, true));
    expect(
      (await asUser(db, teacher.id, (tx) => archivedCourses(tx, teacher))).map((c) => c.id),
    ).toContain(course.id);
    expect(
      await asUser(db, otherTeacher.id, (tx) => archivedCourses(tx, otherTeacher)),
    ).toHaveLength(0);
    await expect(
      asUser(db, student.id, (tx) => studentCourse(tx, student, course.id)),
    ).rejects.toThrow("bulunamadı");
    await asUser(db, teacher.id, (tx) => archiveCourse(tx, teacher, course.id, false));
    expect(
      (await asUser(db, student.id, (tx) => studentCourse(tx, student, course.id))).title,
    ).toBe("Güncellenmiş Ders");
    expect((await db.query("select id from attempts where course_id=$1", [course.id])).length).toBe(
      attemptsBefore,
    );
    expect(
      await db.query("select id from class_invites where course_id=$1 and not revoked", [
        course.id,
      ]),
    ).toHaveLength(0);
    await Promise.all([
      asUser(db, teacher.id, (tx) => rotateInvite(tx, teacher, course.id)),
      asUser(db, teacher.id, (tx) => rotateInvite(tx, teacher, course.id)),
    ]);
    expect(
      await db.query("select id from class_invites where course_id=$1 and not revoked", [
        course.id,
      ]),
    ).toHaveLength(1);
  });
});
describe("öğrenme tahmini", () => {
  it("tek doğru cevap öğrenildi sayılmaz; gün ve farklı etkinlik gerekir", () => {
    expect(masteryState({ attempts: 1, correct: 1, days: 1, activities: 1 }, true).state).toBe(
      "reinforcing",
    );
    expect(masteryState({ attempts: 8, correct: 8, days: 1, activities: 1 }, true).state).toBe(
      "reinforcing",
    );
    expect(masteryState({ attempts: 4, correct: 4, days: 2, activities: 2 }, true).state).toBe(
      "mastered",
    );
    expect(
      masteryState({ attempts: 5, correct: 4, days: 3, activities: 2 }, false, "mastered").state,
    ).toBe("needs_review");
  });
});
