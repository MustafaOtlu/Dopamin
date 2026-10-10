import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
const base = "http://127.0.0.1:3000",
  out = path.resolve(".data/previews");
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1081, height: 719 },
  storageState: path.join(out, "dopamin-session.json"),
});
try {
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let res = await context.request.get(base + "/api/bootstrap");
  if (res.status() === 401) {
    const auth = await context.request.post(base + "/api/auth/login", {
      headers: { origin: base },
      data: { email: "ogrenci@pusula.local", password: "PusulaDemo2026!" },
    });
    if (!auth.ok()) throw Error("Login " + auth.status());
    await context.storageState({ path: path.join(out, "dopamin-session.json") });
    res = await context.request.get(base + "/api/bootstrap");
  }
  if (!res.ok()) throw Error("Bootstrap " + res.status());
  const data = await res.json();
  const course = data.courses.find((c) => c.code === "BIL101");
  const post = async (url, data) => {
    const r = await context.request.post(base + "/api/" + url, { headers: { origin: base }, data });
    if (!r.ok()) throw Error(url + " " + r.status() + " " + (await r.text()));
    return r.json();
  };
  const objectives = await (
    await context.request.get(base + "/api/courses/" + course.id + "/objectives")
  ).json();
  const session = await post("sessions", {
    course_id: course.id,
    topic_id: objectives.find((o) => o.week === 1).topic_id,
    mode: "practice",
  });
  await page.goto(base + "/learn/" + session.id);
  await page.getByRole("button", { name: "Doğru", exact: true }).waitFor();
  await page.getByRole("button", { name: "Doğru", exact: true }).click();
  await page.getByRole("button", { name: "Cevabımı kontrol et" }).click();
  await page.getByRole("button", { name: "Devam et", exact: true }).click();
  await page.getByRole("heading", { name: "Kavramları eşleştir", exact: true }).waitFor();
  await page.setViewportSize({ width: 794, height: 719 });
  await page.screenshot({
    path: path.join(out, "refinements-matching-desktop.png"),
    animations: "disabled",
  });
  const dimensions = await page.evaluate(() => ({
    viewport: innerHeight,
    document: document.documentElement.scrollHeight,
    button: document.querySelector(".submit-answer")?.getBoundingClientRect().bottom,
  }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: path.join(out, "refinements-matching-mobile.png"),
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Çalışmaya ara ver ve ana sayfaya dön" }).click();
  await page.getByRole("dialog").waitFor();
  await page.screenshot({ path: path.join(out, "refinements-exit.png"), animations: "disabled" });
  await page.getByRole("button", { name: "Derse devam et", exact: true }).click();
  await page.goto(base + "/app?page=learn&course=" + course.id);
  await page.locator(".dp-topic-node").first().click();
  await page.getByRole("button", { name: /Derse hazırlık/ }).click();
  await page.locator(".dp-prep-card").waitFor();
  await page.screenshot({
    path: path.join(out, "refinements-preparation.png"),
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Kapat", exact: true }).click();
  await page.setViewportSize({ width: 1081, height: 719 });
  await page.getByRole("button", { name: "Profil", exact: true }).click();
  await page.getByRole("heading", { name: "Günlük serin", exact: true }).waitFor();
  await page.screenshot({
    path: path.join(out, "refinements-profile.png"),
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Maç", exact: true }).click();
  await page.locator(".dp-duel-companion").waitFor();
  await page.getByRole("button", { name: /Seri.*Yan yanayken/ }).click();
  await page.screenshot({ path: path.join(out, "refinements-match.png"), animations: "disabled" });
  console.log(JSON.stringify({ errors, dimensions, session: session.id }));
} finally {
  await browser.close();
}
