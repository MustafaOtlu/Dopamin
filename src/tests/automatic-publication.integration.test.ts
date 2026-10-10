import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { createDatabase, migrate, asUser, type RootDatabase } from "@/lib/db";
import { createLocalUser } from "@/modules/auth/service";
import {
  createCourse,
  createObjective,
  updatePublicationPolicy,
  joinCourse,
} from "@/modules/courses/service";
import { queueAI } from "@/modules/ai/service";
import { passesAutomaticReview } from "@/modules/ai/review";
import { retryContentJob } from "@/modules/ai/queue";
import { assertJobLease, renewJobLease } from "@/workers/lease";
import { listActivities, saveActivity } from "@/modules/activities/service";
import { runNextJob } from "@/workers/runner";
import type { Generate } from "@/modules/ai/provider";
import type { User } from "@/types/domain";

let db: RootDatabase, teacher: User, other: User, student: User;
const keys = [
  "AI_API_KEY",
  "AI_MODEL",
  "AI_DAILY_BUDGET_USD",
  "AI_INPUT_USD_PER_MILLION",
  "AI_OUTPUT_USD_PER_MILLION",
];
const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
const quote = "An algorithm is a finite sequence of steps to solve a problem.";
const approved = {
  source_supported: true,
  answer_valid: true,
  unambiguous: true,
  objective_covered: true,
  findings: [],
};
beforeAll(async () => {
  process.env.AI_API_KEY = "test-provider-only";
  process.env.AI_MODEL = "test-model";
  process.env.AI_DAILY_BUDGET_USD = "5";
  process.env.AI_INPUT_USD_PER_MILLION = "1";
  process.env.AI_OUTPUT_USD_PER_MILLION = "2";
  db = await createDatabase("memory://");
  await migrate(db);
  const user = (email: string, role: "teacher" | "student") =>
    createLocalUser(
      db,
      {
        email,
        display_name: "Yayın Testi",
        password: "TestPass2026!",
        role,
      },
      role === "teacher",
    );
  teacher = await user("publish-teacher@test.edu", "teacher");
  other = await user("publish-other@test.edu", "teacher");
  student = await user("publish-student@test.edu", "student");
});
afterAll(async () => {
  await db.close();
  for (const key of keys) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});
it("yeniden deneme yalnız ders sahibine açıktır ve eşzamanlı istekler tek yeniden deneme oluşturur", async () => {
  const c = await setup(false);
  await db.query("update background_jobs set status='failed',attempts=3 where id=$1", [c.job.id]);
  for (const actor of [other, student])
    await expect(
      asUser(db, actor.id, (tx) => retryContentJob(tx, actor, c.course.id, String(c.job.id))),
    ).rejects.toThrow();
  const retries = await Promise.allSettled(
    [1, 2].map(() =>
      asUser(db, teacher.id, (tx) => retryContentJob(tx, teacher, c.course.id, String(c.job.id))),
    ),
  );
  expect(retries.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  const [job] = await db.query<{ attempts: number; manual_retries: number; status: string }>(
    "select * from background_jobs where id=$1",
    [c.job.id],
  );
  expect(job.attempts).toBe(0);
  expect(job.manual_retries).toBe(1);
  expect(job.status).toBe("queued");
  await expect(
    asUser(db, teacher.id, (tx) => retryContentJob(tx, teacher, c.course.id, String(c.job.id))),
  ).rejects.toThrow("tamamlanamayan");
  await runNextJob(db, c.provider());
  await db.query("update background_jobs set status='failed',manual_retries=5 where id=$1", [
    c.job.id,
  ]);
  await expect(
    asUser(db, teacher.id, (tx) => retryContentJob(tx, teacher, c.course.id, String(c.job.id))),
  ).rejects.toThrow("beş yeniden");
  await db.query("update background_jobs set manual_retries=0 where id=$1", [c.job.id]);
  await db.query("update documents set status='deleted' where id=$1", [c.doc.id]);
  await expect(
    asUser(db, teacher.id, (tx) => retryContentJob(tx, teacher, c.course.id, String(c.job.id))),
  ).rejects.toThrow("işlenmiş belgeler");
});
it("kontrol isteği kesildiğinde manuel deneme kaydedilmiş soruyu yeniden üretmez", async () => {
  const c = await setup();
  await db.query("update background_jobs set max_attempts=1 where id=$1", [c.job.id]);
  await runNextJob(
    db,
    c.provider(approved, async (phase) => {
      if (phase === "activity_review") throw new Error("Test sağlayıcı bağlantısı kesildi.");
    }),
  );
  expect((await c.read()).status).toBe("needs_review");
  await asUser(db, teacher.id, (tx) => retryContentJob(tx, teacher, c.course.id, String(c.job.id)));
  await runNextJob(db, c.provider());
  expect(c.calls).toEqual(["learning_activity", "activity_review", "activity_review"]);
  expect((await c.read()).status).toBe("published");
});
it("lease yenileme yalnız geçerli sahibince yapılır; süresi dolanı veya başkasınınkini canlandırmaz", async () => {
  const c = await setup(false),
    token = randomUUID(),
    replacement = randomUUID();
  await db.query(
    "update background_jobs set status='processing',lease_token=$2,leased_until=now()+interval '2 minutes' where id=$1",
    [c.job.id, token],
  );
  expect(await renewJobLease(db, String(c.job.id), replacement)).toBe(false);
  expect(await renewJobLease(db, String(c.job.id), token)).toBe(true);
  await db.query("update background_jobs set leased_until=now()-interval '1 second' where id=$1", [
    c.job.id,
  ]);
  expect(await renewJobLease(db, String(c.job.id), token)).toBe(false);
  await expect(assertJobLease(db, String(c.job.id), token)).rejects.toThrow("başka bir işleyiciye");
  await db.query(
    "update background_jobs set lease_token=$2,leased_until=now()+interval '10 minutes' where id=$1",
    [c.job.id, replacement],
  );
  expect(await renewJobLease(db, String(c.job.id), token)).toBe(false);
  await expect(assertJobLease(db, String(c.job.id), replacement)).resolves.toBeUndefined();
  await db.query("update background_jobs set status='completed' where id=$1", [c.job.id]);
});
it("yavaş eski işleyici lease devrinden sonra taslak veya iş sonucunu yazamaz; crash denemeleri sınırlıdır", async () => {
  const c = await setup(false),
    replacement = randomUUID();
  await runNextJob(
    db,
    c.provider(approved, async (phase) => {
      if (phase === "learning_activity")
        await db.query(
          "update background_jobs set lease_token=$2,attempts=attempts+1,leased_until=now()+interval '10 minutes' where id=$1",
          [c.job.id, replacement],
        );
    }),
  );
  expect(await c.read()).toBeUndefined();
  const [saved] = await db.query<{ status: string; lease_token: string }>(
    "select * from background_jobs where id=$1",
    [c.job.id],
  );
  expect(saved.status).toBe("processing");
  expect(saved.lease_token).toBe(replacement);
  await db.query(
    "update background_jobs set attempts=max_attempts,leased_until=now()-interval '1 second' where id=$1",
    [c.job.id],
  );
  expect(await runNextJob(db, c.provider())).toBe(false);
  expect(
    (
      await db.query<{ status: string }>("select status from background_jobs where id=$1", [
        c.job.id,
      ])
    )[0].status,
  ).toBe("failed");
});
async function setup(automatic = true) {
  const course = await asUser(db, teacher.id, (tx) =>
    createCourse(tx, teacher, { title: "Yayın Test Dersi", term: "Güz" }),
  );
  const objective = await asUser(db, teacher.id, (tx) =>
    createObjective(tx, teacher, course.id, {
      title: "Algoritmayı tanımlayabilme",
      topic_title: "Algoritmalar",
      week: 1,
    }),
  );
  await asUser(db, student.id, (tx) => joinCourse(tx, student, { code: course.invite_code }));
  const [file] = await db.query<{ id: string }>(
    `insert into files(course_id,uploaded_by,purpose,storage_key,original_name,mime_type,byte_size,sha256)
    values($1,$2,'document',$3,'kaynak.pdf','application/pdf',100,$3) returning id`,
    [course.id, teacher.id, randomUUID()],
  );
  const [doc] = await db.query<{ id: string }>(
    `insert into documents(course_id,file_id,sha256,title,status,page_count)
    values($1,$2,$3,'İzinli Kaynak','ready',1) returning id`,
    [course.id, file.id, randomUUID()],
  );
  await db.query(
    "insert into document_chunks(document_id,course_id,page,chunk_index,text) values($1,$2,1,0,$3)",
    [doc.id, course.id, quote],
  );
  if (automatic)
    await asUser(db, teacher.id, (tx) =>
      updatePublicationPolicy(tx, teacher, course.id, {
        publish_mode: "automatic",
        automatic_consent: true,
      }),
    );
  const job = await asUser(db, teacher.id, (tx) =>
    queueAI(
      tx,
      teacher,
      course.id,
      {
        document_ids: [doc.id],
        objective_id: objective.id,
        count: 1,
        publish_mode: automatic ? "review" : "automatic", // Caller cannot override server policy.
      },
      "ai_generate",
    ),
  );
  const calls: string[] = [];
  const provider =
    (review: unknown = approved, hook?: (phase: string) => Promise<void>): Generate =>
    async (name, schema) => {
      calls.push(name);
      await hook?.(name);
      return {
        data: schema.parse(
          name === "activity_review"
            ? review
            : {
                kind: "true_false",
                title: "Algoritma Sonludur",
                instruction: "Önermeyi değerlendir.",
                explanation: "Kaynak sonlu adımları belirtir.",
                difficulty: 1,
                statement: "Algoritma sonlu adımlardan oluşur.",
                correct_boolean: true,
                items: [],
                categories: [],
                blanks: [],
                sources: [{ document_id: doc.id, page: 1, quote }],
              },
        ),
        model: "test-model",
        input_tokens: 100,
        output_tokens: 50,
      };
    };
  const read = async () =>
    (
      await db.query<{
        status: string;
        published_version: number | null;
        current_version: number;
        id: string;
      }>("select * from activities where course_id=$1", [course.id])
    )[0];
  return { course, objective, doc, job, calls, provider, read };
}
it("açık onay ve ders sahibi yetkisi gerekir; istemci yayın biçimini değiştiremez", async () => {
  const c = await setup(false);
  for (const actor of [other, student])
    await expect(
      asUser(db, actor.id, (tx) =>
        updatePublicationPolicy(tx, actor, c.course.id, {
          publish_mode: "automatic",
          automatic_consent: true,
        }),
      ),
    ).rejects.toThrow();
  await expect(
    asUser(db, teacher.id, (tx) =>
      updatePublicationPolicy(tx, teacher, c.course.id, { publish_mode: "automatic" }),
    ),
  ).rejects.toThrow("açık onay");
  await asUser(db, teacher.id, (tx) =>
    updatePublicationPolicy(tx, teacher, c.course.id, {
      publish_mode: "automatic",
      automatic_consent: true,
    }),
  );
  await runNextJob(db, c.provider());
  expect(c.calls).toEqual(["learning_activity"]);
  expect((await c.read()).status).toBe("needs_review");
});
it("ayrı ücretli kontrol geçen değişmez soruyu yayımlar; insan onayı olarak kaydetmez", async () => {
  const c = await setup();
  await runNextJob(db, c.provider());
  expect(c.calls).toEqual(["learning_activity", "activity_review"]);
  expect((await c.read()).status).toBe("published");
  expect(
    await asUser(db, student.id, (tx) => listActivities(tx, student, c.course.id)),
  ).toHaveLength(1);
  const [review] = await db.query<{
    status: string;
    reviewed_by: string | null;
    checks: Record<string, unknown>;
  }>("select * from generation_reviews where job_id=$1", [c.job.id]);
  expect(review.status).toBe("approved");
  expect(review.reviewed_by).toBeNull();
  expect(review.checks.publication_method).toBe("automatic");
  expect(await db.query("select id from ai_usage where job_id=$1", [c.job.id])).toHaveLength(2);
});
it("tek bir başarısız kontrol, belirsizlik veya bulgu yayını durdurur", async () => {
  for (const review of [
    ...["source_supported", "answer_valid", "unambiguous", "objective_covered"].map((key) => ({
      ...approved,
      [key]: false,
    })),
    { ...approved, findings: ["İkinci bir cevap da geçerli."] },
  ]) {
    expect(passesAutomaticReview(review)).toBe(false);
    const c = await setup();
    await runNextJob(db, c.provider(review));
    expect((await c.read()).status).toBe("needs_review");
    expect(
      await asUser(db, student.id, (tx) => listActivities(tx, student, c.course.id)),
    ).toHaveLength(0);
  }
  expect(passesAutomaticReview({ source_supported: true })).toBe(false);
});
it("kontrol sırasında kapatıp yeniden açmak eski işin yayın yetkisini geri getirmez", async () => {
  const c = await setup();
  await runNextJob(
    db,
    c.provider(approved, async (phase) => {
      if (phase !== "activity_review") return;
      await asUser(db, teacher.id, (tx) =>
        updatePublicationPolicy(tx, teacher, c.course.id, { publish_mode: "review" }),
      );
      await asUser(db, teacher.id, (tx) =>
        updatePublicationPolicy(tx, teacher, c.course.id, {
          publish_mode: "automatic",
          automatic_consent: true,
        }),
      );
    }),
  );
  expect((await c.read()).published_version).toBeNull();
});
it("kontrol sırasında hoca değiştirirse yeni soru sürümü otomatik yayımlanmaz", async () => {
  const c = await setup();
  await runNextJob(
    db,
    c.provider(approved, async (phase) => {
      if (phase !== "activity_review") return;
      const [activity] = await asUser(db, teacher.id, (tx) =>
        listActivities(tx, teacher, c.course.id),
      );
      await asUser(db, teacher.id, (tx) =>
        saveActivity(
          tx,
          teacher,
          c.course.id,
          {
            objective_id: c.objective.id,
            activity: { ...activity, title: "Hoca Düzenlemesi" },
          },
          activity.activity_id,
        ),
      );
    }),
  );
  const saved = await c.read();
  expect(saved.current_version).toBe(2);
  expect(saved.published_version).toBeNull();
});
it("kontrol bütçesi dolarsa taslak korunur; sonraki deneme soruyu yeniden üretmez", async () => {
  const c = await setup();
  await runNextJob(
    db,
    c.provider(approved, async (phase) => {
      if (phase === "learning_activity") process.env.AI_DAILY_BUDGET_USD = "0.0000001";
    }),
  );
  const [saved] = await db.query<{ status: string; attempts: number }>(
    "select status,attempts from background_jobs where id=$1",
    [c.job.id],
  );
  expect(saved.status).toBe("queued");
  expect(saved.attempts).toBe(0);
  expect((await c.read()).status).toBe("needs_review");
  expect(c.calls).toEqual(["learning_activity"]);
  process.env.AI_DAILY_BUDGET_USD = "5";
  await db.query("update background_jobs set available_at=now() where id=$1", [c.job.id]);
  await runNextJob(db, c.provider());
  expect(c.calls).toEqual(["learning_activity", "activity_review"]);
  expect((await c.read()).status).toBe("published");
  expect(
    await db.query("select id from activities where course_id=$1", [c.course.id]),
  ).toHaveLength(1);
});
