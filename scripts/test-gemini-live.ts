import { chromium } from "@playwright/test";
import { academicPdf } from "../src/tests/fixtures";
import fs from "node:fs";
import path from "node:path";
const base = "http://127.0.0.1:3000",
  out = path.resolve(".data/previews"),
  reportPath = path.resolve(".data/gemini-live-report.json");
const browser = await chromium.launch();
const state = path.join(out, "teacher-session.json");
const context = await browser.newContext(fs.existsSync(state) ? { storageState: state } : {});
const report: Record<string, unknown> = fs.existsSync(reportPath)
  ? JSON.parse(fs.readFileSync(reportPath, "utf8"))
  : {};
const save = () => fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
async function get(url: string) {
  const r = await context.request.get(base + "/api/" + url);
  if (!r.ok()) throw Error(url + " " + r.status());
  return r.json();
}
async function post(url: string, data: unknown) {
  const r = await context.request.post(base + "/api/" + url, { headers: { origin: base }, data });
  if (!r.ok()) throw Error(url + " " + r.status() + " " + (await r.text()));
  return r.json();
}
async function waitJob(course: string, id: string) {
  for (let i = 0; i < 300; i++) {
    const status = await get("courses/" + course + "/content");
    const job = status.jobs.find((j: { id: string }) => j.id === id);
    if (["completed", "failed", "needs_input"].includes(job?.status)) {
      if (job.status !== "completed") throw Error(job.kind + ": " + job.error_message);
      return status;
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw Error("Job still running");
}
try {
  const auth = await context.request.get(base + "/api/auth/me");
  const me = await auth.json();
  if (!me.user) {
    await post("auth/login", { email: "akademisyen@pusula.local", password: "PusulaDemo2026!" });
    await context.storageState({ path: state });
  }
  let course = report.course as { id: string } | undefined;
  if (!course) {
    course = await post("courses", {
      title: "Gemini PDF Denemesi",
      code: "GEMTEST",
      term: "2026–2027 Güz",
      description:
        "Gerçek Gemini bağlantısı ile PDF kaynaklı soru üretimi. İncelenecek test taslakları.",
    });
    report.course = course;
    save();
  }
  const courseId = course!.id;
  if (!report.document) {
    const bytes = academicPdf([
      "Algorithms - Week 1",
      "Learning objective: explain input, processing, output, conditions and loops.",
      "An algorithm is a finite sequence of clear steps to solve a problem.",
      "Algorithms can be written in ordinary language or as flowcharts.",
      "Input is data supplied before processing begins.",
      "Processing transforms input data into a result.",
      "Output is the result produced by the algorithm.",
      "A variable stores a value that can change during execution.",
      "A condition chooses a path based on whether a statement is true or false.",
      "A loop repeats a set of instructions while a condition holds.",
      "The sequence is: start, read input, process data, show output, stop.",
      "Example: read 4, multiply 4 by 4, and output 16.",
      "A loop needs a stopping condition to avoid running forever.",
    ]);
    const r = await context.request.post(base + "/api/uploads", {
      headers: { origin: base },
      multipart: {
        course_id: courseId,
        purpose: "document",
        file: {
          name: "algoritmalar-gemini-deneme.pdf",
          mimeType: "application/pdf",
          buffer: Buffer.from(bytes),
        },
      },
    });
    if (!r.ok()) throw Error("Upload " + r.status());
    report.document = await r.json();
    save();
  }
  const doc = report.document as { id: string };
  for (let i = 0; i < 40; i++) {
    const docs = await get("courses/" + courseId + "/documents");
    const current = docs.find((d: { id: string }) => d.id === doc.id);
    if (current?.status === "ready") {
      report.document = current;
      save();
      break;
    }
    if (i === 39) throw Error("PDF extraction timeout");
    await new Promise((r) => setTimeout(r, 2000));
  }
  console.log("PDF okundu; Gemini müfredat analizi başlıyor.");
  if (!report.analyzeJob) {
    report.analyzeJob = await post("courses/" + courseId + "/ai/analyze", {
      document_ids: [doc.id],
    });
    save();
  }
  const current = await get("courses/" + courseId + "/content");
  const prior = current.jobs.find(
    (j: { id: string }) => j.id === (report.analyzeJob as { id: string }).id,
  );
  if (["failed", "needs_input"].includes(prior?.status))
    await post("courses/" + courseId + "/jobs/" + prior.id + "/retry", {});
  const analysis = await waitJob(courseId, (report.analyzeJob as { id: string }).id);
  report.analysis = analysis;
  save();
  console.log("Gemini müfredat analizi tamamlandı; 5 soru üretilecek.");
  if (!report.objective) {
    report.objective = await post("courses/" + courseId + "/objectives", {
      title: "Girdi, işlem, çıktı, koşul ve döngü kavramlarını ayırt eder",
      topic_title: "Algoritmalar — Gemini denemesi",
      week: 1,
      scheduled_date: "2026-10-10",
    });
    save();
  }
  if (!report.generationJob) {
    report.generationJob = await post("courses/" + courseId + "/ai/generate", {
      document_ids: [doc.id],
      objective_id: (report.objective as { id: string }).id,
      count: 5,
    });
    save();
  }
  const generationStatus = await get("courses/" + courseId + "/content");
  const generationPrior = generationStatus.jobs.find(
    (j: { id: string }) => j.id === (report.generationJob as { id: string }).id,
  );
  if (["failed", "needs_input"].includes(generationPrior?.status))
    await post("courses/" + courseId + "/jobs/" + generationPrior.id + "/retry", {});
  report.result = await waitJob(courseId, (report.generationJob as { id: string }).id);
  report.activities = (await get("courses/" + courseId + "/activities")).filter(
    (activity: { status: string }) => activity.status !== "archived",
  );
  report.tested_at = new Date().toISOString();
  save();
  console.log(
    JSON.stringify({
      course: courseId,
      document: doc.id,
      questions: (report.activities as unknown[]).length,
      status: "completed",
      report: reportPath,
    }),
  );
} finally {
  await browser.close();
}
