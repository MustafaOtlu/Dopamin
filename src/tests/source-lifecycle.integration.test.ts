import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { mkdtemp, mkdir, rm, readdir } from "node:fs/promises";
import path from "node:path";
import { createDatabase, migrate, asUser, type RootDatabase } from "@/lib/db";
import { createLocalUser } from "@/modules/auth/service";
import { createCourse, createObjective, joinCourse } from "@/modules/courses/service";
import {
  uploadSource,
  listDocuments,
  documentDetail,
  setDocumentAccess,
  deleteDocument,
  type Document,
} from "@/modules/documents/service";
import { purgeRemovedDocument } from "@/modules/documents/cleanup";
import { readStoredFile } from "@/modules/documents/storage";
import { loadSources } from "@/modules/ai/service";
import { saveActivity, publishActivity, listActivities } from "@/modules/activities/service";
import { runNextJob } from "@/workers/runner";
import { academicPdf } from "./fixtures";
import { today } from "@/lib/time";
import type { User, Course } from "@/types/domain";
let db: RootDatabase,
  teacher: User,
  other: User,
  student: User,
  course: Course,
  storage: string,
  old: Document,
  current: Document,
  activityId: string;
const previousStorage = process.env.STORAGE_PATH;
const firstPdf = academicPdf(),
  nextPdf = academicPdf([
    "Algorithms - Edition 2",
    "A finite algorithm reads input and returns output.",
  ]);
beforeAll(async () => {
  await mkdir(path.resolve(".data"), { recursive: true });
  storage = await mkdtemp(path.resolve(".data/test-lifecycle-"));
  process.env.STORAGE_PATH = storage;
  db = await createDatabase("memory://");
  await migrate(db);
  teacher = await createLocalUser(
    db,
    {
      email: "lifecycle@test.edu",
      password: "TestPass2026!",
      display_name: "Kaynak Öğretmeni",
      role: "teacher",
    },
    true,
  );
  other = await createLocalUser(
    db,
    {
      email: "lifecycle-other@test.edu",
      password: "TestPass2026!",
      display_name: "Diğer Öğretmen",
      role: "teacher",
    },
    true,
  );
  student = await createLocalUser(db, {
    email: "lifecycle-student@test.edu",
    password: "TestPass2026!",
    display_name: "Öğrenci",
    role: "student",
  });
  course = await asUser(db, teacher.id, (tx) =>
    createCourse(tx, teacher, { title: "Kaynak Sürümleri", term: "Güz" }),
  );
  await asUser(db, student.id, (tx) => joinCourse(tx, student, { code: course.invite_code }));
});
afterAll(async () => {
  await db.close();
  if (!storage.startsWith(path.resolve(".data/test-lifecycle-")))
    throw new Error("Unexpected cleanup path");
  await rm(storage, { recursive: true, force: true });
  if (previousStorage === undefined) delete process.env.STORAGE_PATH;
  else process.env.STORAGE_PATH = previousStorage;
});
describe("Kaynak sürümü ve dosya yaşam döngüsü", () => {
  it("eşzamanlı aynı PDF yüklemeleri tek kaynak/iş/dosya oluşturur", async () => {
    const results = await Promise.all([
      uploadSource(db, teacher, course.id, new File([firstPdf], "first.pdf")),
      uploadSource(db, teacher, course.id, new File([firstPdf], "same.pdf")),
    ]);
    expect(results[0].id).toBe(results[1].id);
    expect(results.filter((r) => r.duplicate)).toHaveLength(1);
    old = results[0] as Document;
    expect(await db.query("select id from files")).toHaveLength(1);
    expect(await readdir(path.join(storage, course.id))).toHaveLength(1);
    await runNextJob(db);
    const objective = await asUser(db, teacher.id, (tx) =>
      createObjective(tx, teacher, course.id, {
        title: "Algoritmayı tanımlama",
        topic_title: "Algoritmalar",
        week: 1,
        scheduled_date: today(),
      }),
    );
    const saved = await asUser(db, teacher.id, (tx) =>
      saveActivity(tx, teacher, course.id, {
        objective_id: objective.id,
        activity: {
          kind: "true_false",
          title: "Sonlu adımlar",
          instruction: "Doğru mu?",
          explanation: "Kaynak açıklar.",
          content: { statement: "Algoritma sonlu adımlardan oluşur." },
          answer_key: { value: true },
          source_refs: [
            {
              document_id: old.id,
              page: 1,
              quote: "An algorithm is a finite sequence of steps to solve a problem.",
            },
          ],
        },
      }),
    );
    activityId = saved.activity_id;
    await asUser(db, teacher.id, (tx) => publishActivity(tx, teacher, course.id, activityId));
    await asUser(db, teacher.id, (tx) =>
      setDocumentAccess(tx, teacher, course.id, old.id, { student_access: true }),
    );
  });
  it("yalnız ders sahibi güncel kaynağı yeniler; eski yayın/sayfa alıntısı değişmez", async () => {
    await expect(
      uploadSource(db, other, course.id, new File([nextPdf], "new.pdf"), "document", old.id),
    ).rejects.toThrow("erişim");
    current = (await uploadSource(
      db,
      teacher,
      course.id,
      new File([nextPdf], "new.pdf"),
      "document",
      old.id,
    )) as Document;
    await runNextJob(db);
    expect(current.source_id).toBe(old.source_id);
    expect(current.source_version).toBe(2);
    const docs = await asUser(db, teacher.id, (tx) => listDocuments(tx, teacher, course.id));
    expect(docs.map((d) => d.id)).toEqual([current.id]);
    const detail = await asUser(db, teacher.id, (tx) =>
      documentDetail(tx, teacher, course.id, current.id),
    );
    expect(detail.versions.map((d) => d.source_version)).toEqual([2, 1]);
    await expect(
      asUser(db, teacher.id, (tx) => loadSources(tx, course.id, [old.id])),
    ).rejects.toThrow("işlenmiş");
    expect(
      await asUser(db, student.id, (tx) =>
        tx.query("select id from files where id=$1", [old.file_id]),
      ),
    ).toHaveLength(0);
    const published = await asUser(db, student.id, (tx) => listActivities(tx, student, course.id));
    expect(published[0].source_refs[0]).toMatchObject({
      document_id: old.id,
      page: 1,
      quote: "An algorithm is a finite sequence of steps to solve a problem.",
    });
    await expect(
      uploadSource(
        db,
        teacher,
        course.id,
        new File(
          [academicPdf(["A third version with enough source text for analysis."])],
          "third.pdf",
        ),
        "document",
        old.id,
      ),
    ).rejects.toThrow("zaten yenilendi");
  });
  it("kaldırma tüm sürümlerin erişimini kapatır; aynı PDF yeniden yüklenebilir; 30 gün geçmeden fiziksel silme olmaz", async () => {
    await expect(
      asUser(db, other.id, (tx) => deleteDocument(tx, other, course.id, current.id)),
    ).rejects.toThrow("erişim");
    const result = await asUser(db, teacher.id, (tx) =>
      deleteDocument(tx, teacher, course.id, current.id),
    );
    expect(result.versions).toBe(2);
    expect(
      await asUser(db, teacher.id, (tx) => listDocuments(tx, teacher, course.id)),
    ).toHaveLength(0);
    await expect(purgeRemovedDocument(db, course.id, old.id)).rejects.toThrow("süresi");
    const again = (await uploadSource(
      db,
      teacher,
      course.id,
      new File([firstPdf], "again.pdf"),
    )) as Document;
    expect(again.id).not.toBe(old.id);
    expect(again.source_version).toBe(1);
    await runNextJob(db);
    await db.query(
      "update documents set purge_after=now()-interval '1 second' where id=any($1::uuid[])",
      [[old.id, current.id]],
    );
    await db.query(
      "update background_jobs set available_at=now()-interval '1 second' where kind='file_cleanup'",
    );
    // Cleanup remains authorized for removed files even if the course is archived later.
    await db.query("update courses set archived=true where id=$1", [course.id]);
    expect(await runNextJob(db)).toBe(true);
    expect(await runNextJob(db)).toBe(true);
    const files = await db.query<{ id: string; storage_key: string; purged_at: string | null }>(
      "select id,storage_key,purged_at from files",
    );
    for (const file of files.filter((f) => f.id === old.file_id || f.id === current.file_id)) {
      expect(file.purged_at).not.toBeNull();
      await expect(readStoredFile(file.storage_key)).rejects.toThrow();
    }
    const [active] = files.filter((f) => f.id === again.file_id);
    expect((await readStoredFile(active.storage_key)).length).toBeGreaterThan(0);
    expect(await purgeRemovedDocument(db, course.id, old.id)).toMatchObject({ purged: true });
    expect(
      await db.query("select id from document_chunks where document_id=any($1::uuid[])", [
        [old.id, current.id],
      ]),
    ).toHaveLength(0);
    const [version] = await db.query<{ source_refs: { document_id: string }[] }>(
      "select source_refs from activity_versions where activity_id=$1",
      [activityId],
    );
    expect(version.source_refs[0].document_id).toBe(old.id);
  });
});
