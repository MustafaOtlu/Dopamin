import { asUser, type RootDatabase } from "@/lib/db";
import { randomUUID } from "node:crypto";
import { assert, AppError } from "@/lib/errors";
import type { User } from "@/types/domain";
import { readStoredFile } from "@/modules/documents/storage";
import { extractPdf } from "@/modules/documents/extractor";
import { purgeRemovedDocument } from "@/modules/documents/cleanup";
import { processWebSource } from "@/modules/documents/web-worker";
import { fetchWebPage, type WebPage } from "@/modules/documents/web-reader";
import {
  extractedDraft,
  saveDraft,
  loadSources,
  curriculumPrompt,
  scheduleUploadedCurriculum,
} from "@/modules/ai/service";
import {
  generateAutomaticCurriculum,
  applyAutomaticCurriculum,
  type CurriculumCheckpoint,
} from "@/modules/ai/automatic-curriculum";
import { today } from "@/lib/time";
import { curriculumOutput, verifyCitations } from "@/modules/ai/contracts";
import { selectSourceContext } from "@/modules/ai/sources";
import { generateValidatedActivity, type PreviousActivity } from "@/modules/ai/generation";
import { generate, type Generate } from "@/modules/ai/provider";
import { budgetedGenerate } from "@/modules/ai/budget";
import { reviewGeneratedActivities } from "@/modules/ai/review";
import { saveActivity } from "@/modules/activities/service";
import { closeExpiredLeagues } from "./maintenance";
import { assertJobLease, assertWritableJob, renewJobLease } from "./lease";
interface Job {
  id: string;
  course_id: string;
  created_by: string;
  kind: "pdf_extract" | "web_fetch" | "ai_analyze" | "ai_generate" | "file_cleanup";
  payload: {
    document_id?: string;
    auto_apply?: boolean;
    auto_curriculum?: boolean;
    document_ids?: string[];
    objective_id?: string;
    count?: number;
    publish_mode?: "review" | "automatic";
    publication_policy_revision?: number;
    permission_id?: string;
    permission_revision?: number;
    source_policy_revision?: number;
  };
  attempts: number;
  max_attempts: number;
  lease_token: string;
  created_at: string;
  result: Partial<CurriculumCheckpoint> | null;
}
const globalWorker = globalThis as typeof globalThis & { pusulaWorker?: Promise<void> };
export async function runNextJob(
  db: RootDatabase,
  provider: Generate = generate,
  fetchPage: (url: string) => Promise<WebPage> = fetchWebPage,
) {
  const [job] = await db.transaction(async (tx) => {
    await tx.query(`update background_jobs set status='failed',leased_until=null,
      error_message='İşleyici bağlantısı tekrar tekrar kesildi. Kaynağı ve işleyiciyi kontrol edip yeniden dene.'
      where status='processing' and leased_until<now() and attempts>=max_attempts`);
    const [candidate] = await tx.query<Job>(`select * from background_jobs where
      (status='queued' and available_at<=now()) or (status='processing' and leased_until<now())
      order by created_at for update skip locked limit 1`);
    if (!candidate) return [];
    return tx.query<Job>(
      "update background_jobs set status='processing',attempts=attempts+1,leased_until=now()+interval '10 minutes',heartbeat_at=now(),lease_token=$2,error_message=null where id=$1 returning *",
      [candidate.id, randomUUID()],
    );
  });
  if (!job) return false;
  const heartbeat = setInterval(() => {
    void renewJobLease(db, job.id, job.lease_token).catch(() =>
      console.error(JSON.stringify({ event: "job_heartbeat_failed", job_id: job.id })),
    );
  }, 60000);
  heartbeat.unref();
  try {
    await assertJobLease(db, job.id, job.lease_token);
    if (job.kind === "file_cleanup") {
      assert(job.payload.document_id, "Silinecek belge bulunamadı.");
      const result = await purgeRemovedDocument(db, job.course_id, job.payload.document_id);
      await db.query(
        "update background_jobs set status='completed',result=$2,leased_until=null,completed_at=now() where id=$1 and lease_token=$3 and status='processing'",
        [job.id, JSON.stringify(result), job.lease_token],
      );
      return true;
    }
    const [user] = await db.query<User>("select * from profiles where id=$1", [job.created_by]);
    const [course] = await db.query<{ title: string; owner_id: string; archived: boolean }>(
      "select title,owner_id,archived from courses where id=$1",
      [job.course_id],
    );
    assert(
      user && course && course.owner_id === user.id && !course.archived,
      "Bu dersteki işlem yetkisi artık geçerli değil.",
    );
    let result: unknown;
    if (job.kind === "web_fetch") {
      result = await processWebSource(db, user, job, fetchPage);
    } else if (job.kind === "pdf_extract") {
      const [doc] = await asUser(db, user.id, (tx) =>
        tx.query<{ id: string; title: string; status: string; storage_key: string }>(
          "select d.id,d.title,d.status,f.storage_key from documents d join files f on f.id=d.file_id where d.id=$1 and d.course_id=$2 and d.superseded_by is null",
          [job.payload.document_id, job.course_id],
        ),
      );
      assert(doc && doc.status !== "deleted", "İşlenecek belge bulunamadı.");
      await asUser(db, user.id, async (tx) => {
        await assertWritableJob(tx, job.id, job.lease_token, job.course_id, user.id);
        return tx.query("update documents set status='processing' where id=$1", [doc.id]);
      });
      const extraction = await extractPdf(await readStoredFile(doc.storage_key));
      result = await asUser(db, user.id, async (tx) => {
        await assertWritableJob(tx, job.id, job.lease_token, job.course_id, user.id);
        const [current] = await tx.query<{ status: string }>(
          "select status from documents where id=$1 and superseded_by is null for update",
          [doc.id],
        );
        assert(current && current.status !== "deleted", "Belge artık geçerli değil.");
        await tx.query("delete from document_chunks where document_id=$1", [doc.id]);
        for (const chunk of extraction.chunks)
          await tx.query(
            "insert into document_chunks(document_id,course_id,page,chunk_index,text,heading) values($1,$2,$3,$4,$5,$6)",
            [doc.id, job.course_id, chunk.page, chunk.chunk_index, chunk.text, chunk.heading],
          );
        await tx.query(
          "update documents set status=$2,page_count=$3,error_message=$4,ocr_pages=$5,ocr_confidence=$6 where id=$1",
          [
            doc.id,
            extraction.needs_ocr ? "needs_ocr" : "ready",
            extraction.page_count,
            extraction.needs_ocr
              ? "Bazı sayfalarda metin okunamadı. Taranmış sayfaları ve OCR ayarını kontrol et."
              : extraction.ocr_pages.length
                ? "OCR ile okundu. Kaynak metnini asıl belgeyle karşılaştırarak incele."
                : null,
            JSON.stringify(extraction.ocr_pages),
            extraction.ocr_confidence,
          ],
        );
        const [latest] = await tx.query<{ payload: { auto_curriculum?: boolean } }>(
          "select payload from background_jobs where id=$1",
          [job.id],
        );
        if (latest.payload.auto_curriculum && !extraction.needs_ocr)
          await scheduleUploadedCurriculum(tx, user, job.course_id, doc.id);
        const draft = extractedDraft(
          course.title,
          extraction.chunks.map((c) => ({ ...c, document_id: doc.id })),
        );
        const draftId =
          !latest.payload.auto_curriculum && draft.topics.length
            ? await saveDraft(tx, user, job.course_id, job.id, draft, "extracted")
            : null;
        return {
          document_id: doc.id,
          page_count: extraction.page_count,
          chunks: extraction.chunks.length,
          draft_id: draftId,
          needs_ocr: extraction.needs_ocr,
        };
      });
    } else {
      const budgeted = budgetedGenerate(db, { course_id: job.course_id, job_id: job.id }, provider);
      const requestAI: Generate = async (name, schema, instructions, input, observe) => {
        await assertJobLease(db, job.id, job.lease_token);
        await asUser(db, user.id, (tx) =>
          loadSources(tx, job.course_id, job.payload.document_ids || [], 0),
        );
        return budgeted(name, schema, instructions, input, observe);
      };
      const allChunks = await asUser(db, user.id, (tx) =>
        loadSources(tx, job.course_id, job.payload.document_ids || []),
      );
      // Bounded context, selected explicitly by the course owner; no network tools.
      if (job.kind === "ai_analyze" && job.payload.auto_apply) {
        const data = await generateAutomaticCurriculum(
          requestAI,
          course.title,
          allChunks,
          job.result,
          async (checkpoint) => {
            await asUser(db, user.id, async (tx) => {
              await assertWritableJob(tx, job.id, job.lease_token, job.course_id, user.id);
              await loadSources(tx, job.course_id, job.payload.document_ids || [], 0);
              await tx.query("update background_jobs set result=$2 where id=$1", [
                job.id,
                JSON.stringify(checkpoint),
              ]);
            });
          },
        );
        result = await asUser(db, user.id, async (tx) => {
          await assertWritableJob(tx, job.id, job.lease_token, job.course_id, user.id);
          await loadSources(tx, job.course_id, job.payload.document_ids || [], 0);
          return applyAutomaticCurriculum(
            tx,
            user,
            job.course_id,
            job.id,
            data,
            today(new Date(job.created_at)),
          );
        });
      } else if (job.kind === "ai_analyze") {
        const context = { course: course.title, ...selectSourceContext(allChunks) };
        const chunks = context.sources;
        const generated = await requestAI(
          "curriculum",
          curriculumOutput,
          curriculumPrompt(),
          context,
        );
        for (const t of generated.data.topics) verifyCitations(t.sources, chunks);
        result = await asUser(db, user.id, async (tx) => {
          await assertWritableJob(tx, job.id, job.lease_token, job.course_id, user.id);
          await loadSources(tx, job.course_id, job.payload.document_ids || [], 0);
          const id = await saveDraft(tx, user, job.course_id, job.id, generated.data, "ai");
          return { draft_id: id, source_coverage: context.coverage };
        });
      } else {
        const [objective] = await asUser(db, user.id, (tx) =>
          tx.query<{ title: string; topic_title: string }>(
            "select o.title,t.title topic_title from objectives o join topics t on t.id=o.topic_id where o.id=$1 and o.course_id=$2",
            [job.payload.objective_id, job.course_id],
          ),
        );
        assert(objective, "Kazanım bulunamadı.");
        const context = { course: course.title, ...selectSourceContext(allChunks, objective) };
        const chunks = context.sources;
        const clarification = await asUser(db, user.id, (tx) =>
          tx.query(
            "select topic,question,answer from clarification_questions where course_id=$1 and answer is not null",
            [job.course_id],
          ),
        );
        const previous = await asUser(db, user.id, (tx) =>
          tx.query<PreviousActivity>(
            "select v.title,v.kind,v.content from generation_reviews r join activities a on a.id=r.activity_id join activity_versions v on v.activity_id=a.id and v.version=a.current_version where r.job_id=$1",
            [job.id],
          ),
        );
        const recent = await asUser(db, user.id, (tx) =>
          tx.query<PreviousActivity & { total: number }>(
            `select v.title,v.kind,v.content,count(*) over()::int total
             from activities a join activity_versions v on v.activity_id=a.id and v.version=a.current_version
             where a.course_id=$1 and a.objective_id=$2 and a.status!='archived'
             and not exists(select 1 from generation_reviews r where r.activity_id=a.id and r.job_id=$3)
             order by a.created_at desc limit 20`,
            [job.course_id, job.payload.objective_id, job.id],
          ),
        );
        const activities = [...previous];
        for (let i = previous.length; i < (job.payload.count || 3); i++) {
          const activity = await generateValidatedActivity(
            requestAI,
            (recent[0]?.total || 0) + i,
            { ...context, objective, clarification, index: i },
            chunks,
            [...[...recent].reverse(), ...activities],
          );
          activities.push(activity);
          // Save each expensive generation before requesting another, so interrupted jobs retain drafts.
          await asUser(db, user.id, async (tx) => {
            await assertWritableJob(tx, job.id, job.lease_token, job.course_id, user.id);
            await loadSources(tx, job.course_id, job.payload.document_ids || [], 0);
            const saved = await saveActivity(tx, user, job.course_id, {
              objective_id: job.payload.objective_id,
              activity,
            });
            await tx.query("update activities set status='needs_review' where id=$1", [
              saved.activity_id,
            ]);
            await tx.query(
              "insert into generation_reviews(course_id,activity_id,job_id,checks,version_id) values($1,$2,$3,$4,$5)",
              [
                job.course_id,
                saved.activity_id,
                job.id,
                JSON.stringify({
                  schema: true,
                  answer_structure: true,
                  citations: true,
                  academic_accuracy: "requires_teacher_review",
                }),
                saved.id,
              ],
            );
          });
        }
        const review =
          job.payload.publish_mode === "automatic"
            ? await reviewGeneratedActivities(
                db,
                user,
                job.course_id,
                job.id,
                requestAI,
                chunks,
                objective,
                job.payload.publication_policy_revision ?? -1,
                (tx) => assertWritableJob(tx, job.id, job.lease_token, job.course_id, user.id),
              )
            : { published: 0, needs_review: activities.length };
        result = { generated: activities.length, ...review, source_coverage: context.coverage };
      }
    }
    await db.query(
      "update background_jobs set status='completed',result=$2,leased_until=null,completed_at=now() where id=$1 and lease_token=$3 and status='processing'",
      [job.id, JSON.stringify(result), job.lease_token],
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "İşlem tamamlanamadı.";
    if (err instanceof AppError && err.code === "JOB_LEASE_LOST") return true;
    if (err instanceof AppError && err.code === "AI_DAILY_BUDGET_EXCEEDED") {
      await db.query(
        "update background_jobs set status='queued',attempts=greatest(0,attempts-1),error_message=$2,leased_until=null,available_at=(date_trunc('day',now() at time zone 'Europe/Istanbul')+interval '1 day') at time zone 'Europe/Istanbul' where id=$1 and lease_token=$3 and status='processing'",
        [job.id, message, job.lease_token],
      );
      return true;
    }
    // Retry transient failures; validation/missing credentials need a human, not an endless loop.
    const needsInput =
      (job.kind === "web_fetch" && err instanceof AppError && err.status < 500) ||
      (err instanceof AppError &&
        ["AI_AUTH_FAILED", "AI_INVALID_OUTPUT", "AI_INCOMPLETE", "AI_PROVIDER_ERROR"].includes(
          err.code || "",
        )) ||
      /yapılandırılmadı|bulunamadı|sözleşmesine|alıntısı|geçerli değil|OCR/i.test(message);
    const retry = !needsInput && job.attempts < job.max_attempts;
    const owned = await db.query(
      "update background_jobs set status=$2,error_message=$3,leased_until=null,available_at=now()+make_interval(secs => least(300,30*power(2,greatest(0,attempts-1)))::int) where id=$1 and lease_token=$4 and status='processing' returning id",
      [
        job.id,
        needsInput ? "needs_input" : retry ? "queued" : "failed",
        message.slice(0, 300),
        job.lease_token,
      ],
    );
    if (owned.length && job.kind === "pdf_extract")
      await db.query(
        "update documents set status='failed',error_message=$2 where id=$1 and status!='deleted'",
        [
          job.payload.document_id,
          err instanceof AppError && /OCR/.test(message)
            ? message.slice(0, 300)
            : "Belge işlenemedi. Geçerli bir PDF ile yeniden deneyebilirsin.",
        ],
      );
    console.error(
      JSON.stringify({
        event: "job_failed",
        job_id: job.id,
        kind: job.kind,
        retry,
        message: message.slice(0, 300),
      }),
    );
  } finally {
    clearInterval(heartbeat);
  }
  return true;
}
export function drainJobs(db: RootDatabase) {
  globalWorker.pusulaWorker ||= (async () => {
    await closeExpiredLeagues(db).catch(() =>
      console.error(JSON.stringify({ event: "league_maintenance_failed" })),
    );
    while (await runNextJob(db)) {
      /* one job at a time per local process */
    }
  })().finally(() => {
    globalWorker.pusulaWorker = undefined;
  });
  return globalWorker.pusulaWorker;
}
