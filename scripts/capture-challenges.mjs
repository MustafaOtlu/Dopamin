import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
const base = "http://127.0.0.1:3000",
  headers = { origin: base },
  browser = await chromium.launch();
async function post(ctx, url, data) {
  const r = await ctx.request.post(`${base}/api/${url}`, { headers, data });
  if (!r.ok()) throw new Error(await r.text());
  return r.json();
}
async function get(ctx, url) {
  const r = await ctx.request.get(`${base}/api/${url}`);
  if (!r.ok()) throw new Error(await r.text());
  return r.json();
}
try {
  const teacher = await browser.newContext(),
    student = await browser.newContext(),
    friend = await browser.newContext();
  await post(teacher, "auth/login", {
    email: "akademisyen@pusula.local",
    password: "PusulaDemo2026!",
  });
  const signup = await friend.request.post(`${base}/api/auth/signup`, {
    headers,
    data: {
      email: "arda@pusula.local",
      display_name: "Arda Demir",
      role: "student",
      password: "PusulaDemo2026!",
    },
  });
  if (!signup.ok())
    await post(friend, "auth/login", { email: "arda@pusula.local", password: "PusulaDemo2026!" });
  await post(student, "auth/login", { email: "ogrenci@pusula.local", password: "PusulaDemo2026!" });
  const teacherData = await get(teacher, "bootstrap"),
    studentData = await get(student, "bootstrap"),
    c = teacherData.courses.find((c) => c.code === "BIL101");
  await post(friend, "courses/join", { code: c.invite_code });
  const challenges = await get(friend, "challenges");
  if (!challenges.some((ch) => ch.course_id === c.id && ch.status === "completed")) {
    const ch = await post(friend, "challenges", {
      course_id: c.id,
      recipient_id: studentData.user.id,
      request_key: crypto.randomUUID(),
    });
    await post(student, `challenges/${ch.id}/respond`, { action: "accept" });
    const keys = new Map((await get(teacher, `courses/${c.id}/activities`)).map((v) => [v.id, v]));
    for (const [ctx, win] of [
      [friend, false],
      [student, true],
    ]) {
      const session = await post(ctx, `challenges/${ch.id}/start`, {});
      while (true) {
        const view = await get(ctx, `sessions/${session.id}`);
        if (view.session.status === "completed") break;
        const a = keys.get(view.activity.id);
        let answer;
        if (a.kind === "true_false") answer = win ? a.answer_key.value : !a.answer_key.value;
        else if (a.kind === "matching") answer = win ? a.answer_key.pairs : {};
        else if (a.kind === "ordering")
          answer = win ? a.answer_key.order : [...a.answer_key.order].reverse();
        else throw new Error("Unexpected seeded demo type");
        await post(ctx, `sessions/${session.id}/answers`, {
          request_key: crypto.randomUUID(),
          activity_version_id: a.id,
          answer,
        });
      }
    }
  }
  if (
    !(await get(friend, "challenges")).some(
      (ch) => ch.course_id === c.id && ch.status === "pending",
    )
  )
    await post(friend, "challenges", {
      course_id: c.id,
      recipient_id: studentData.user.id,
      request_key: crypto.randomUUID(),
    });
  const page = await student.newPage();
  await page.goto(`${base}/app?page=challenges`);
  await page.getByRole("heading", { name: "Meydan okumalar." }).waitFor();
  await page.getByRole("button", { name: "Kabul et", exact: true }).waitFor();
  const out = path.resolve(".data/previews");
  await mkdir(out, { recursive: true });
  await page.screenshot({
    path: path.join(out, "student-challenges-m5.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.goto(`${base}/app?page=courses`);
  await page.getByRole("button", { name: c.title, exact: true }).click();
  await page.getByRole("tab", { name: "Sıralama", exact: true }).click();
  await page.getByRole("heading", { name: "Haftalık sınıf sıralaması" }).waitFor();
  await page.locator(".your-rank").waitFor();
  await page.screenshot({
    path: path.join(out, "student-class-ranking-m5.png"),
    fullPage: true,
    animations: "disabled",
  });
  console.log(out);
} finally {
  await browser.close();
}
