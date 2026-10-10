import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
const base = "http://127.0.0.1:3000",
  headers = { origin: base };
const browser = await chromium.launch();
async function post(context, url, data) {
  const response = await context.request.post(`${base}/api/${url}`, { headers, data });
  if (!response.ok()) throw new Error(await response.text());
  return response.json();
}
try {
  const teacher = await browser.newContext(),
    student = await browser.newContext();
  await post(teacher, "auth/login", {
    email: "akademisyen@pusula.local",
    password: "PusulaDemo2026!",
  });
  await post(student, "auth/login", { email: "ogrenci@pusula.local", password: "PusulaDemo2026!" });
  const daily = await (await student.request.get(`${base}/api/daily`)).json();
  for (const item of daily.items.filter((i) => i.status !== "completed")) {
    const activities = await (
      await teacher.request.get(`${base}/api/courses/${item.course_id}/activities`)
    ).json();
    const versions = new Map(activities.map((a) => [a.id, a]));
    const session = await post(student, `daily/${item.id}/start`, {});
    while (true) {
      const view = await (await student.request.get(`${base}/api/sessions/${session.id}`)).json();
      if (view.session.status === "completed") break;
      const a = versions.get(view.activity.id);
      if (!a) throw new Error("Demo activity version not found");
      let answer;
      if (a.kind === "true_false") answer = a.answer_key.value;
      else if (a.kind === "matching") answer = a.answer_key.pairs;
      else if (a.kind === "ordering") answer = a.answer_key.order;
      else if (a.kind === "fill_blank")
        answer = Object.fromEntries(
          Object.entries(a.answer_key.accepted).map(([id, values]) => [id, values[0]]),
        );
      else if (a.kind === "categorize") answer = a.answer_key.categories;
      else
        answer = Object.fromEntries(
          Object.entries(a.answer_key.regions).map(([id, r]) => [
            id,
            { x: r.x + r.width / 2, y: r.y + r.height / 2 },
          ]),
        );
      await post(student, `sessions/${session.id}/answers`, {
        request_key: crypto.randomUUID(),
        activity_version_id: a.id,
        answer,
      });
    }
  }
  const page = await student.newPage();
  await page.goto(`${base}/app?page=rewards`);
  await page.getByRole("heading", { name: "Keşif mağazası", exact: true }).waitFor();
  await page.getByRole("heading", { name: "Leylak çerçeve", exact: true }).waitFor();
  const output = path.resolve(".data/previews");
  await mkdir(output, { recursive: true });
  await page.screenshot({
    path: path.join(output, "student-rewards-m5.png"),
    fullPage: true,
    animations: "disabled",
  });
  console.log(path.join(output, "student-rewards-m5.png"));
  await page.locator(".streak-panel").screenshot({path:path.join(output,"student-streak-m5.png"),animations:"disabled"});
  await page.setViewportSize({width:390,height:844});
  await page.reload();
  await page.getByRole("heading",{name:"Günlük serin"}).waitFor();
  await page.screenshot({path:path.join(output,"student-rewards-mobile-m5.png"),animations:"disabled"});
} finally {
  await browser.close();
}
