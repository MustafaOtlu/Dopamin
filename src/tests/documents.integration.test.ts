import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { createDatabase, migrate, asUser, type RootDatabase } from "@/lib/db";
import { createLocalUser } from "@/modules/auth/service";
import { createCourse, createObjective, joinCourse } from "@/modules/courses/service";
import {
  uploadSource,
  detectType,
  documentDetail,
  type Document,
} from "@/modules/documents/service";
import {
  queueAI,
  contentStatus,
  answerClarification,
  approveCurriculum,
} from "@/modules/ai/service";
import { verifyCitations, toActivity } from "@/modules/ai/contracts";
import type { Generate } from "@/modules/ai/provider";
import { runNextJob } from "@/workers/runner";
import { publishActivity, listActivities } from "@/modules/activities/service";
import type { User, Course, Objective } from "@/types/domain";
import { academicPdf } from "./fixtures";
import { today } from "@/lib/time";
let db: RootDatabase,
  teacher: User,
  other: User,
  student: User,
  course: Course,
  objective: Objective,
  doc: Document,
  storage: string;
const originalStorage = process.env.STORAGE_PATH,
  originalKey = process.env.AI_API_KEY,
  originalModel = process.env.AI_MODEL;
const costKeys = [
  "AI_DAILY_BUDGET_USD",
  "AI_INPUT_USD_PER_MILLION",
  "AI_OUTPUT_USD_PER_MILLION",
] as const;
const originalCosts = Object.fromEntries(costKeys.map((key) => [key, process.env[key]]));
beforeAll(async () => {
  await mkdir(path.resolve(".data"), { recursive: true });
  storage = await mkdtemp(path.resolve(".data/test-source-"));
  process.env.STORAGE_PATH = storage;
  db = await createDatabase("memory://");
  await migrate(db);
  teacher = await createLocalUser(
    db,
    {
      email: "doc-teacher@test.edu",
      display_name: "Kaynak Öğretmeni",
      password: "TestPass2026!",
      role: "teacher",
    },
    true,
  );
  other = await createLocalUser(
    db,
    {
      email: "doc-other@test.edu",
      display_name: "Diğer Öğretmen",
      password: "TestPass2026!",
      role: "teacher",
    },
    true,
  );
  student = await createLocalUser(db, {
    email: "doc-student@test.edu",
    display_name: "Kaynak Öğrencisi",
    password: "TestPass2026!",
    role: "student",
  });
  course = await asUser(db, teacher.id, (tx) =>
    createCourse(tx, teacher, { title: "Kaynak Dersi", term: "Güz" }),
  );
  objective = await asUser(db, teacher.id, (tx) =>
    createObjective(tx, teacher, course.id, {
      topic_title: "Algoritmalar",
      title: "Algoritmayı tanımlayabilme",
      week: 1,
      scheduled_date: today(),
    }),
  );
  await asUser(db, student.id, (tx) => joinCourse(tx, student, { code: course.invite_code }));
});
afterAll(async () => {
  await db.close();
  if (!path.resolve(storage).startsWith(path.resolve(".data/test-source-")))
    throw new Error("Beklenmeyen temizlik yolu.");
  await rm(storage, { recursive: true, force: true });
  if (originalStorage === undefined) delete process.env.STORAGE_PATH;
  else process.env.STORAGE_PATH = originalStorage;
  if (originalKey === undefined) delete process.env.AI_API_KEY;
  else process.env.AI_API_KEY = originalKey;
  if (originalModel === undefined) delete process.env.AI_MODEL;
  else process.env.AI_MODEL = originalModel;
  for (const key of costKeys) {
    if (originalCosts[key] === undefined) delete process.env[key];
    else process.env[key] = originalCosts[key];
  }
});
describe("M2 belge ve üretim hattı", () => {
  it("uzantıya güvenmez; başka ders sahibi ve öğrenci kaynak yükleyemez", async () => {
    expect(detectType(new TextEncoder().encode("not a PDF"))).toBeNull();
    await expect(
      uploadSource(
        db,
        teacher,
        course.id,
        new File(["not a PDF"], "fake.pdf", { type: "application/pdf" }),
      ),
    ).rejects.toThrow("Desteklenen");
    await expect(
      uploadSource(db, other, course.id, new File([academicPdf()], "source.pdf")),
    ).rejects.toThrow("erişim");
    await expect(
      uploadSource(db, student, course.id, new File([academicPdf()], "source.pdf")),
    ).rejects.toThrow("akademisyen");
  });
  it("PDF kalıcı ve özel saklanır; aynı hash ikinci bir iş oluşturmaz", async () => {
    doc = (await uploadSource(
      db,
      teacher,
      course.id,
      new File([academicPdf()], "curriculum.pdf", { type: "application/pdf" }),
    )) as Document;
    const duplicate = await uploadSource(
      db,
      teacher,
      course.id,
      new File([academicPdf()], "another-name.pdf", { type: "application/pdf" }),
    );
    expect(duplicate.duplicate).toBe(true);
    expect(await db.query("select * from background_jobs")).toHaveLength(1);
    expect(
      await asUser(db, student.id, (tx) =>
        tx.query("select * from files where id=$1", [doc.file_id]),
      ),
    ).toHaveLength(0);
  });
  it("worker gerçek PDF metnini sayfa referansıyla çıkarır", async () => {
    expect(await runNextJob(db)).toBe(true);
    const detail = await asUser(db, teacher.id, (tx) =>
      documentDetail(tx, teacher, course.id, doc.id),
    );
    expect(detail.status).toBe("ready");
    expect(detail.page_count).toBe(1);
    expect(detail.chunks.length).toBeGreaterThan(0);
    expect(detail.chunks[0]).toMatchObject({ page: 1 });
    expect(String(detail.chunks[0].text)).toContain("finite sequence");
    expect(await runNextJob(db)).toBe(false);
  });
  it("bağlantı yoksa sahte AI sonucu üretmez; uydurma alıntı ve belge kimliğini reddeder", async () => {
    delete process.env.AI_API_KEY;
    delete process.env.AI_MODEL;
    await expect(
      asUser(db, teacher.id, (tx) =>
        queueAI(tx, teacher, course.id, { document_ids: [doc.id] }, "ai_analyze"),
      ),
    ).rejects.toThrow("yapılandırılmadı");
    expect(() =>
      verifyCitations(
        [{ document_id: doc.id, page: 2, quote: "invented content" }],
        [{ document_id: doc.id, page: 1, text: "real content" }],
      ),
    ).toThrow();
    expect(() =>
      toActivity(
        {
          kind: "true_false",
          title: "Q",
          instruction: "Answer",
          explanation: "Explanation",
          difficulty: 1,
          statement: "A",
          correct_boolean: true,
          items: [],
          categories: [],
          blanks: [],
          sources: [{ document_id: other.id, page: 1, quote: "finite sequence" }],
        },
        [{ document_id: doc.id, page: 1, text: "finite sequence" }],
      ),
    ).toThrow("alıntısı");
  });
  it("sağlayıcı sözleşmesiyle kapsam diyaloğu, onay ve incelemeli üretim çalışır", async () => {
    process.env.AI_API_KEY = "test-provider-only";
    process.env.AI_MODEL = "test-model";
    process.env.AI_DAILY_BUDGET_USD = "5";
    process.env.AI_INPUT_USD_PER_MILLION = "1";
    process.env.AI_OUTPUT_USD_PER_MILLION = "2";
    const quote = "An algorithm is a finite sequence of steps to solve a problem.";
    const fake: Generate = async (name, schema) => ({
      data: schema.parse(
        name === "curriculum"
          ? {
              course_title: course.title,
              term: null,
              topics: [
                {
                  title: "Algoritmalar",
                  week: null,
                  scheduled_date: null,
                  date_is_inferred: false,
                  objective_titles: ["Algoritmayı açıklayabilme"],
                  sources: [{ document_id: doc.id, page: 1, quote }],
                },
              ],
              questions: [
                {
                  topic: "Algoritmalar",
                  question: "Hangi hafta?",
                  reason: "Belgede takvim tarihi yok.",
                  options: ["İlk hafta"],
                  changes_field: "week",
                },
              ],
            }
          : {
              kind: "true_false",
              title: "AI inceleme örneği",
              instruction: "Önermeyi değerlendir.",
              explanation: "Kaynak algoritmaların sonlu olduğunu açıklar.",
              difficulty: 1,
              statement: "Algoritmalar sonlu adımlardan oluşur.",
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
    });
    await asUser(db, teacher.id, (tx) =>
      queueAI(tx, teacher, course.id, { document_ids: [doc.id] }, "ai_analyze"),
    );
    await runNextJob(db, fake);
    const status = await asUser(db, teacher.id, (tx) => contentStatus(tx, teacher, course.id));
    const questions = status.questions as { id: string; draft_id: string }[];
    expect(questions).toHaveLength(1);
    const drafts = status.drafts as { id: string; origin: string; data: Record<string, unknown> }[];
    const draft = drafts.find((d) => d.origin === "ai")!;
    const data = {
      ...draft.data,
      topics: [
        {
          title: "Algoritmalar",
          week: 1,
          scheduled_date: today(),
          date_is_inferred: false,
          objective_titles: ["Algoritmayı açıklayabilme"],
          sources: [{ document_id: doc.id, page: 1, quote }],
        },
      ],
    };
    await expect(
      asUser(db, teacher.id, (tx) =>
        approveCurriculum(tx, teacher, course.id, { id: draft.id, data }),
      ),
    ).rejects.toThrow("kapsam sorularını");
    await asUser(db, teacher.id, (tx) =>
      answerClarification(tx, teacher, course.id, { id: questions[0].id, answer: "İlk hafta" }),
    );
    await asUser(db, teacher.id, (tx) =>
      approveCurriculum(tx, teacher, course.id, { id: draft.id, data }),
    );
    await asUser(db, teacher.id, (tx) =>
      queueAI(
        tx,
        teacher,
        course.id,
        { document_ids: [doc.id], objective_id: objective.id, count: 1 },
        "ai_generate",
      ),
    );
    await runNextJob(db, fake);
    expect(
      await asUser(db, student.id, (tx) => listActivities(tx, student, course.id)),
    ).toHaveLength(0);
    const [activity] = await db.query<{ id: string; status: string }>(
      "select id,status from activities where created_by=$1",
      [teacher.id],
    );
    expect(activity.status).toBe("needs_review");
    await asUser(db, teacher.id, (tx) => publishActivity(tx, teacher, course.id, activity.id));
    expect(
      await asUser(db, student.id, (tx) => listActivities(tx, student, course.id)),
    ).toHaveLength(1);
    expect(await db.query("select * from ai_usage")).toHaveLength(2);
  });
  it("bütçe dolunca iş ertesi güne ertelenir ve sağlayıcı çağrılmaz", async () => {
    process.env.AI_DAILY_BUDGET_USD = "0.0000001";
    const job = await asUser(db, teacher.id, (tx) =>
      queueAI(tx, teacher, course.id, { document_ids: [doc.id] }, "ai_analyze"),
    );
    let called = false;
    const provider: Generate = async () => {
      called = true;
      throw new Error("Should not be called");
    };
    await runNextJob(db, provider);
    const [saved] = await db.query<{ status: string; attempts: number; available_at: Date }>(
      "select status,attempts,available_at from background_jobs where id=$1",
      [job.id],
    );
    expect(called).toBe(false);
    expect(saved.status).toBe("queued");
    expect(saved.attempts).toBe(0);
    expect(new Date(saved.available_at).getTime()).toBeGreaterThan(Date.now());
    const content = await asUser(db, teacher.id, (tx) => contentStatus(tx, teacher, course.id));
    expect(content.jobs.find((candidate) => candidate.id === job.id)).toMatchObject({
      scheduled: true,
      poll_soon: false,
    });
    expect(content.queue).toMatchObject({ ready: 0, scheduled: 1 });
  });
});
