import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { asUser, createDatabase, migrate, type RootDatabase } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { createLocalUser } from "@/modules/auth/service";
import { createCourse } from "@/modules/courses/service";
import { uploadSource, type Document } from "@/modules/documents/service";
import { scheduleUploadedCurriculum } from "@/modules/ai/service";
import { retryContentJob } from "@/modules/ai/queue";
import {
  applyAutomaticCurriculum,
  curriculumBatches,
  generateAutomaticCurriculum,
  type CurriculumCheckpoint,
} from "@/modules/ai/automatic-curriculum";
import type { CurriculumOutput, SourceChunk } from "@/modules/ai/contracts";
import type { Generate } from "@/modules/ai/provider";
import { runNextJob } from "@/workers/runner";
import type { Course, User } from "@/types/domain";
import { academicPdf } from "./fixtures";

const output = (sources: SourceChunk[]): CurriculumOutput => ({
  course_title: "Algoritmalar",
  term: null,
  questions: [],
  topics: [
    {
      title: "Algoritmalar",
      week: null,
      scheduled_date: null,
      date_is_inferred: false,
      objective_titles: ["Algoritmanın temel adımlarını açıklar"],
      sources: [
        {
          document_id: sources[0].document_id,
          page: sources[0].page,
          quote: sources[0].text.slice(0, 50),
        },
      ],
    },
  ],
});
const fake: Generate = async (_name, schema, _prompt, input) => ({
  data: schema.parse(output((input as { sources: SourceChunk[] }).sources)),
  model: "test",
  input_tokens: 100,
  output_tokens: 100,
});

describe("automatic curriculum batching", () => {
  const chunks: SourceChunk[] = Array.from({ length: 40 }, (_, i) => ({
    document_id: "00000000-0000-4000-8000-000000000001",
    page: i + 1,
    text: `Sayfa ${i + 1}: Algoritma sonlu adımlarla bir problemi çözer.`,
    heading: null,
  }));
  it("includes the last page and resumes paid sections after a provider outage", async () => {
    expect(curriculumBatches(chunks).flat()).toEqual(chunks);
    let saved: CurriculumCheckpoint | null = null;
    let calls = 0;
    const interrupted: Generate = async (...args) => {
      calls++;
      if (calls === 2) throw new AppError(503, "Geçici servis hatası", "AI_UNAVAILABLE");
      return fake(...args);
    };
    await expect(
      generateAutomaticCurriculum(interrupted, "Ders", chunks, null, async (value) => {
        saved = structuredClone(value);
      }),
    ).rejects.toThrow("Geçici");
    expect(calls).toBe(2);
    const pages: number[] = [];
    const resumed: Generate = async (...args) => {
      pages.push(...(args[3] as { sources: SourceChunk[] }).sources.map((s) => s.page));
      return fake(...args);
    };
    const result = await generateAutomaticCurriculum(
      resumed,
      "Ders",
      chunks,
      saved,
      async () => {},
    );
    expect(pages[0]).toBe(17);
    expect(pages.at(-1)).toBe(40);
    expect(result.topics).toHaveLength(3);
  });
  it("rejects fabricated citations without requesting teacher form input", async () => {
    let calls = 0;
    const invalid: Generate = async (_name, schema) => {
      calls++;
      const data = output(chunks);
      data.topics[0].sources[0].quote = "Bu alıntı kaynakta bulunmuyor.";
      return { data: schema.parse(data), model: "test", input_tokens: 100, output_tokens: 100 };
    };
    await expect(
      generateAutomaticCurriculum(invalid, "Ders", chunks, null, async () => {}),
    ).rejects.toMatchObject({ code: "AI_INVALID_OUTPUT" });
    expect(calls).toBe(2);
  });
});

describe("automatic curriculum pipeline", () => {
  let db: RootDatabase, teacher: User, course: Course, doc: Document, storage: string;
  beforeAll(async () => {
    await mkdir(path.resolve(".data"), { recursive: true });
    storage = await mkdtemp(path.resolve(".data/test-auto-curriculum-"));
    vi.stubEnv("STORAGE_PATH", storage);
    vi.stubEnv("AI_API_KEY", "test-key");
    vi.stubEnv("AI_MODEL", "test-model");
    vi.stubEnv("AI_DAILY_BUDGET_USD", "5");
    vi.stubEnv("AI_INPUT_USD_PER_MILLION", "0.1");
    vi.stubEnv("AI_OUTPUT_USD_PER_MILLION", "0.4");
    db = await createDatabase("memory://");
    await migrate(db);
    teacher = await createLocalUser(
      db,
      {
        email: "auto@test.edu",
        display_name: "Müfredat Öğretmeni",
        password: "TestPass2026!",
        role: "teacher",
      },
      true,
    );
    course = await asUser(db, teacher.id, (tx) =>
      createCourse(tx, teacher, { title: "Algoritmalar", term: "Güz" }),
    );
  });
  afterAll(async () => {
    await db.close();
    if (!path.resolve(storage).startsWith(path.resolve(".data/test-auto-curriculum-")))
      throw new Error("Beklenmeyen temizlik yolu");
    await rm(storage, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });
  it("PDF upload schedules AI and saves objectives without manual approval", async () => {
    doc = (await uploadSource(
      db,
      teacher,
      course.id,
      new File([academicPdf()], "curriculum.pdf"),
    )) as Document;
    await asUser(db, teacher.id, (tx) =>
      scheduleUploadedCurriculum(tx, teacher, course.id, doc.id),
    );
    await runNextJob(db, fake);
    const [job] = await db.query<{ payload: { auto_apply: boolean } }>(
      "select payload from background_jobs where kind='ai_analyze'",
    );
    expect(job.payload.auto_apply).toBe(true);
    await runNextJob(db, fake);
    const [completed] = await db.query<{
      status: string;
      result: { objectives_created: number; schedule_inferred: boolean };
    }>("select status,result from background_jobs where kind='ai_analyze'");
    expect(completed.status).toBe("completed");
    expect(completed.result).toMatchObject({ objectives_created: 1, schedule_inferred: true });
    expect(await db.query("select * from objectives where course_id=$1", [course.id])).toHaveLength(
      1,
    );
    expect(await db.query("select * from curriculum_drafts where status!='approved'")).toHaveLength(
      0,
    );
    expect(await db.query("select * from clarification_questions")).toHaveLength(0);
  });
  it("repeating an analysis does not duplicate topics or objectives", async () => {
    await asUser(db, teacher.id, (tx) =>
      scheduleUploadedCurriculum(tx, teacher, course.id, doc.id),
    );
    await runNextJob(db, fake);
    expect(await db.query("select * from objectives where course_id=$1", [course.id])).toHaveLength(
      1,
    );
    expect(await db.query("select * from topics where course_id=$1", [course.id])).toHaveLength(1);
    const [applied] = await db.query<{ job_id: string; data: CurriculumOutput }>(
      "select job_id,data from curriculum_drafts limit 1",
    );
    const again = await asUser(db, teacher.id, (tx) =>
      applyAutomaticCurriculum(tx, teacher, course.id, applied.job_id, applied.data, "2026-10-10"),
    );
    expect(again.objectives_created).toBe(1);
    expect(await db.query("select * from objectives")).toHaveLength(1);
  });
  it("preserves explicit dates and reuses topic names case-insensitively", async () => {
    const provider: Generate = async (_name, schema, _prompt, input) => {
      const data = output((input as { sources: SourceChunk[] }).sources);
      data.topics[0].title = "algoritmalar";
      data.topics[0].objective_titles = ["Girdi ve çıktı arasındaki ilişkiyi açıklar"];
      data.topics.push({
        ...data.topics[0],
        title: "Döngüler",
        week: 8,
        scheduled_date: "2026-12-01",
      });
      return { data: schema.parse(data), model: "test", input_tokens: 100, output_tokens: 100 };
    };
    await asUser(db, teacher.id, (tx) =>
      scheduleUploadedCurriculum(tx, teacher, course.id, doc.id),
    );
    await runNextJob(db, provider);
    const topics = await db.query<{ title: string; week: number; scheduled_date: string }>(
      "select title,week,scheduled_date::text from topics",
    );
    expect(topics).toHaveLength(2);
    expect(topics).toContainEqual({ title: "Döngüler", week: 8, scheduled_date: "2026-12-01" });
  });
  it("retries legacy analyses using the automatic workflow", async () => {
    const [legacy] = await db.query<{ id: string }>(
      "insert into background_jobs(course_id,created_by,kind,status,payload) values($1,$2,'ai_analyze','needs_input',$3) returning id",
      [course.id, teacher.id, JSON.stringify({ document_ids: [doc.id] })],
    );
    await asUser(db, teacher.id, (tx) => retryContentJob(tx, teacher, course.id, legacy.id));
    await runNextJob(db, fake);
    const [done] = await db.query<{ result: { automatic_curriculum: boolean } }>(
      "select result from background_jobs where id=$1",
      [legacy.id],
    );
    expect(done.result.automatic_curriculum).toBe(true);
    expect(await db.query("select * from curriculum_drafts where status!='approved'")).toHaveLength(
      0,
    );
  });
  it("does not apply AI output if the source is retired during generation", async () => {
    const before = await db.query("select id from objectives");
    await asUser(db, teacher.id, (tx) =>
      scheduleUploadedCurriculum(tx, teacher, course.id, doc.id),
    );
    const retiring: Generate = async (...args) => {
      const result = await fake(...args);
      await db.query("update documents set status='deleted' where id=$1", [doc.id]);
      return result;
    };
    await runNextJob(db, retiring);
    expect(await db.query("select id from objectives")).toEqual(before);
    expect(
      await db.query(
        "select id from background_jobs where kind='ai_analyze' and status='completed'",
      ),
    ).toHaveLength(4);
  });
});
