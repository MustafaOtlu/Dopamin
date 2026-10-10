import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { mkdtemp, mkdir, rm, readdir } from "node:fs/promises";
import path from "node:path";
import { createDatabase, migrate, asUser, type RootDatabase } from "@/lib/db";
import { createLocalUser } from "@/modules/auth/service";
import { createCourse, createObjective, joinCourse } from "@/modules/courses/service";
import {
  listDocuments,
  documentDetail,
  setDocumentAccess,
  deleteDocument,
  type Document,
} from "@/modules/documents/service";
import {
  addWebSource,
  webSources,
  setSourcePolicy,
  setWebPermission,
  queueWebFetch,
  type WebPermission,
} from "@/modules/documents/web-sources";
import { extractWebText } from "@/modules/documents/web-reader";
import { readStoredFile } from "@/modules/documents/storage";
import { loadSources, saveDraft, approveCurriculum } from "@/modules/ai/service";
import { retryContentJob } from "@/modules/ai/queue";
import { saveActivity, publishActivity, listActivities } from "@/modules/activities/service";
import { saveAssignment, publishAssignment } from "@/modules/assignments/service";
import { runNextJob } from "@/workers/runner";
import { today } from "@/lib/time";
import type { User, Course } from "@/types/domain";
let db: RootDatabase, teacher: User, other: User, student: User, course: Course, storage: string;
let permission: WebPermission, doc: Document, activityId: string;
const previousStorage = process.env.STORAGE_PATH;
const quote = "Algoritma sonlu adımlardan oluşur.";
const page = extractWebText(
  Buffer.from(
    `<title>Algoritmalar</title><main><p>${quote} ${"Her adımın girdisi ve çıktısı açıkça tanımlanmalıdır. ".repeat(5)}</p></main>`,
  ),
);
const fetcher = vi.fn(async () => page);
const owner = <T>(fn: Parameters<typeof asUser<T>>[2]) => asUser(db, teacher.id, fn);
async function latest() {
  return (await owner((tx) => listDocuments(tx, teacher, course.id)))[0];
}
async function revision() {
  return (await owner((tx) => webSources(tx, teacher, course.id))).permissions.find(
    (p) => p.id === permission.id,
  )!;
}
async function toggle(enabled: boolean) {
  const p = await revision();
  return owner((tx) =>
    setWebPermission(tx, teacher, course.id, p.id, { enabled, expected_revision: p.revision }),
  );
}
beforeAll(async () => {
  await mkdir(path.resolve(".data"), { recursive: true });
  storage = await mkdtemp(path.resolve(".data/test-web-"));
  process.env.STORAGE_PATH = storage;
  db = await createDatabase("memory://");
  await migrate(db);
  const user = (name: string, role: "teacher" | "student") =>
    createLocalUser(
      db,
      { email: `${name}@test.edu`, password: "TestPass2026!", display_name: name, role },
      role === "teacher",
    );
  teacher = await user("web-teacher", "teacher");
  other = await user("web-other", "teacher");
  student = await user("web-student", "student");
  course = await owner((tx) => createCourse(tx, teacher, { title: "Web Kaynakları", term: "Güz" }));
  await asUser(db, student.id, (tx) => joinCourse(tx, student, { code: course.invite_code }));
});
afterAll(async () => {
  await db.close();
  if (!storage.startsWith(path.resolve(".data/test-web-")))
    throw new Error("Unexpected cleanup path");
  await rm(storage, { recursive: true, force: true });
  if (previousStorage === undefined) delete process.env.STORAGE_PATH;
  else process.env.STORAGE_PATH = previousStorage;
});
describe("Derse özel, sürümlü web izinleri", () => {
  it("varsayılan belgelerle sınırlıdır; yalnız sahibi tam adrese izin verebilir", async () => {
    expect(await owner((tx) => webSources(tx, teacher, course.id))).toMatchObject({
      source_mode: "documents_only",
      source_policy_revision: 0,
    });
    const input = { title: "Algoritmalar", url: "https://example.com/lesson#intro" };
    await expect(owner((tx) => addWebSource(tx, teacher, course.id, input))).rejects.toThrow(
      "etkinleştir",
    );
    for (const user of [other, student])
      await expect(
        asUser(db, user.id, (tx) =>
          setSourcePolicy(tx, user, course.id, { mode: "approved_web", expected_revision: 0 }),
        ),
      ).rejects.toThrow();
    await owner((tx) =>
      setSourcePolicy(tx, teacher, course.id, { mode: "approved_web", expected_revision: 0 }),
    );
    permission = await owner((tx) => addWebSource(tx, teacher, course.id, input));
    expect(permission.url).toBe("https://example.com/lesson");
    await expect(
      owner((tx) => queueWebFetch(tx, teacher, course.id, permission.id)),
    ).rejects.toThrow("zaten");
    expect(
      await asUser(db, student.id, (tx) => tx.query("select * from source_permissions")),
    ).toHaveLength(0);
    expect(
      await asUser(db, other.id, (tx) => tx.query("select * from source_permissions")),
    ).toHaveLength(0);
    const [job] = await db.query<{ payload: unknown }>(
      "select payload from background_jobs where kind='web_fetch'",
    );
    expect(job.payload).toEqual({
      permission_id: permission.id,
      permission_revision: 1,
      source_policy_revision: 1,
    });
  });
  it("gerçek worker özel metin ve bölüm alıntıları oluşturur; öğrenci paylaşılmadan okuyamaz", async () => {
    expect(await runNextJob(db, undefined, fetcher)).toBe(true);
    expect(fetcher).toHaveBeenCalledWith("https://example.com/lesson");
    doc = await latest();
    expect(doc).toMatchObject({
      source_kind: "web",
      source_url: permission.url,
      source_version: 1,
      allowed: true,
      status: "ready",
      student_access: false,
    });
    const [file] = await db.query<{ storage_key: string; mime_type: string }>(
      "select storage_key,mime_type from files where id=$1",
      [doc.file_id],
    );
    expect(file.mime_type).toBe("text/plain; charset=utf-8");
    expect(Buffer.from(await readStoredFile(file.storage_key)).toString()).toBe(page.text);
    expect((await owner((tx) => loadSources(tx, course.id, [doc.id])))[0]).toMatchObject({
      page: 1,
      text: page.text,
    });
    expect(await asUser(db, student.id, (tx) => tx.query("select * from documents"))).toHaveLength(
      0,
    );
    await owner((tx) =>
      setDocumentAccess(tx, teacher, course.id, doc.id, { student_access: true }),
    );
    expect(
      await asUser(db, student.id, (tx) =>
        tx.query("select * from files where id=$1", [doc.file_id]),
      ),
    ).toHaveLength(1);
    const objective = await owner((tx) =>
      createObjective(tx, teacher, course.id, {
        title: "Sonlu adımlar",
        topic_title: "Algoritmalar",
        week: 1,
        scheduled_date: today(),
      }),
    );
    const activity = await owner((tx) =>
      saveActivity(tx, teacher, course.id, {
        objective_id: objective.id,
        activity: {
          kind: "true_false",
          title: "Algoritma sonludur",
          instruction: "Doğru mu?",
          content: { statement: quote },
          answer_key: { value: true },
          explanation: quote,
          source_refs: [{ document_id: doc.id, page: 1, quote }],
        },
      }),
    );
    activityId = activity.activity_id;
    await owner((tx) => publishActivity(tx, teacher, course.id, activityId));
    await expect(
      owner((tx) =>
        saveAssignment(tx, teacher, course.id, {
          title: "Web ekini dene",
          kind: "traditional",
          due_at: new Date(Date.now() + 86400000).toISOString(),
          file_ids: [doc.file_id],
        }),
      ),
    ).rejects.toThrow("PDF");
  });
  it("aynı metin aynı izinle tekrar dosya oluşturmaz; değişen metin yeni sürümdür", async () => {
    const failed = await owner((tx) => queueWebFetch(tx, teacher, course.id, permission.id));
    await db.query("update background_jobs set status='failed',attempts=3 where id=$1", [
      failed.id,
    ]);
    await owner((tx) => retryContentJob(tx, teacher, course.id, String(failed.id)));
    await runNextJob(db, undefined, fetcher);
    expect(await db.query("select id from documents")).toHaveLength(1);
    expect(await readdir(path.join(storage, course.id))).toHaveLength(1);
    await owner((tx) => queueWebFetch(tx, teacher, course.id, permission.id));
    await runNextJob(db, undefined, async () =>
      extractWebText(
        Buffer.from(`<main>${page.text} Yeni örnekte işlem süresi de açıklanır.</main>`),
      ),
    );
    const newer = await latest();
    expect(newer.id).not.toBe(doc.id);
    expect(newer.source_version).toBe(2);
    expect(
      (await owner((tx) => documentDetail(tx, teacher, course.id, newer.id))).versions,
    ).toHaveLength(2);
    expect(
      await asUser(db, student.id, (tx) =>
        tx.query("select * from files where id=$1", [doc.file_id]),
      ),
    ).toHaveLength(0);
    const published = await asUser(db, student.id, (tx) => listActivities(tx, student, course.id));
    expect(published[0].source_refs[0]).toEqual({ document_id: doc.id, page: 1, quote });
    doc = newer;
  });
  it("izni kapatmak paylaşımı ve bekleyen üretimi keser; açmak eski kaydı yeniden yetkilendirmez", async () => {
    const assignment = await owner((tx) =>
      saveAssignment(tx, teacher, course.id, {
        title: "Eski kaynak bağlantısı",
        kind: "traditional",
        due_at: new Date(Date.now() + 86400000).toISOString(),
      }),
    );
    await owner((tx) => publishAssignment(tx, teacher, course.id, assignment.id));
    // Simulate a legacy/corrupt association bypassing the PDF-only API validation.
    // The independent assignment RLS grant must still not expose revoked web text.
    await db.query(
      "insert into assignment_resources(assignment_id,course_id,file_id) values($1,$2,$3)",
      [assignment.id, course.id, doc.file_id],
    );
    await owner((tx) =>
      setDocumentAccess(tx, teacher, course.id, doc.id, { student_access: true }),
    );
    const [ai] = await db.query<{ id: string }>(
      "insert into background_jobs(course_id,created_by,kind,payload) values($1,$2,'ai_analyze',$3) returning id",
      [course.id, teacher.id, JSON.stringify({ document_ids: [doc.id] })],
    );
    const queued = await owner((tx) => queueWebFetch(tx, teacher, course.id, permission.id));
    const curriculum = {
      course_title: course.title,
      term: null,
      questions: [],
      topics: [
        {
          title: "Algoritmalar",
          week: 1,
          scheduled_date: today(),
          date_is_inferred: false,
          objective_titles: ["Algoritmayı açıklar"],
          sources: [{ document_id: doc.id, page: 1, quote }],
        },
      ],
    };
    const draftId = await owner((tx) => saveDraft(tx, teacher, course.id, ai.id, curriculum, "ai"));
    await toggle(false);
    expect(
      (
        await db.query<{ status: string }>("select status from curriculum_drafts where id=$1", [
          draftId,
        ])
      )[0].status,
    ).toBe("rejected");
    await expect(
      owner((tx) => approveCurriculum(tx, teacher, course.id, { id: draftId, data: curriculum })),
    ).rejects.toThrow("işlenmiş");
    expect(await asUser(db, student.id, (tx) => tx.query("select * from documents"))).toHaveLength(
      0,
    );
    expect(await asUser(db, student.id, (tx) => tx.query("select * from files"))).toHaveLength(0);
    expect(
      (
        await db.query<{ status: string }>("select status from background_jobs where id=$1", [
          ai.id,
        ])
      )[0].status,
    ).toBe("needs_input");
    await expect(owner((tx) => loadSources(tx, course.id, [doc.id]))).rejects.toThrow("işlenmiş");
    await expect(
      owner((tx) =>
        setWebPermission(tx, teacher, course.id, permission.id, {
          enabled: true,
          expected_revision: 1,
        }),
      ),
    ).rejects.toMatchObject({ status: 409 });
    await toggle(true);
    expect((await latest()).allowed).toBe(false);
    await expect(
      owner((tx) => retryContentJob(tx, teacher, course.id, String(queued.id))),
    ).rejects.toThrow("geçerli değil");
    await expect(
      owner((tx) => setDocumentAccess(tx, teacher, course.id, doc.id, { student_access: true })),
    ).rejects.toThrow("güncel izni");
    await owner((tx) => queueWebFetch(tx, teacher, course.id, permission.id));
    await runNextJob(db, undefined, fetcher);
    doc = await latest();
    expect(doc).toMatchObject({ source_version: 3, allowed: true, student_access: false });
    expect(
      await asUser(db, student.id, (tx) => listActivities(tx, student, course.id)),
    ).toHaveLength(1);
  });
  it("ağ isteği sürerken izin kapatılırsa veya işleyici değişirse dosya ve belge sızmaz", async () => {
    const before = (await readdir(path.join(storage, course.id))).length;
    for (const action of ["revoke", "lease"] as const) {
      await owner((tx) => queueWebFetch(tx, teacher, course.id, permission.id));
      const started = Promise.withResolvers<void>();
      const release = Promise.withResolvers<typeof page>();
      const running = runNextJob(db, undefined, async () => {
        started.resolve();
        return release.promise;
      });
      await started.promise;
      if (action === "revoke") await toggle(false);
      else
        await db.query(
          "update background_jobs set lease_token=gen_random_uuid() where course_id=$1 and status='processing'",
          [course.id],
        );
      release.resolve(page);
      await running;
      expect(await db.query("select id from documents")).toHaveLength(3);
      expect(await readdir(path.join(storage, course.id))).toHaveLength(before);
      if (action === "revoke") await toggle(true);
      else
        await db.query(
          "update background_jobs set status='failed',leased_until=null where course_id=$1 and status='processing'",
          [course.id],
        );
    }
  });
  it("ders kapsamı kapatılıp açılınca eski izin sürümü kullanılamaz; kaynak kaldırma izin ve tüm sürümleri kapatır", async () => {
    await owner((tx) =>
      setSourcePolicy(tx, teacher, course.id, { mode: "documents_only", expected_revision: 1 }),
    );
    await expect(
      owner((tx) => queueWebFetch(tx, teacher, course.id, permission.id)),
    ).rejects.toThrow("izni açık");
    await owner((tx) =>
      setSourcePolicy(tx, teacher, course.id, { mode: "approved_web", expected_revision: 2 }),
    );
    await owner((tx) => queueWebFetch(tx, teacher, course.id, permission.id));
    await runNextJob(db, undefined, fetcher);
    doc = await latest();
    expect(doc).toMatchObject({ source_version: 4, allowed: true });
    expect(await owner((tx) => deleteDocument(tx, teacher, course.id, doc.id))).toMatchObject({
      versions: 4,
      retention_days: 30,
    });
    expect((await revision()).enabled).toBe(false);
    await db.query("update courses set archived=true where id=$1", [course.id]);
    await expect(
      owner((tx) => queueWebFetch(tx, teacher, course.id, permission.id)),
    ).rejects.toThrow("Arşivdeki");
    expect(await owner((tx) => listDocuments(tx, teacher, course.id))).toHaveLength(0);
    expect(
      await db.query(
        "select id from background_jobs where kind='file_cleanup' and available_at>now() + interval '29 days'",
      ),
    ).toHaveLength(4);
  });
});
