import { test, expect } from "@playwright/test";
import { loginDemo } from "./auth";
test("günlük görev, tekrar, sabit tamamlama, ödül, mağaza ve sınıf sıralaması", async ({
  browser,
}) => {
  const teacher = await browser.newContext(),
    student = await browser.newContext();
  const headers = { origin: "http://127.0.0.1:3001" };
  await loginDemo(teacher);
  const c = await (
    await teacher.request.post("/api/courses", {
      headers,
      data: { title: `Günlük Plan ${Date.now()}`, term: "Güz" },
    })
  ).json();
  const o = await (
    await teacher.request.post(`/api/courses/${c.id}/objectives`, {
      headers,
      data: { topic_title: "Temeller", title: "Günlük temel kazanım", week: 1 },
    })
  ).json();
  const a = await (
    await teacher.request.post(`/api/courses/${c.id}/activities`, {
      headers,
      data: {
        objective_id: o.id,
        activity: {
          kind: "true_false",
          title: "Günlük önerme",
          instruction: "Doğru mu?",
          content: { statement: "Bir gün 24 saattir." },
          answer_key: { value: true },
          explanation: "Bir gün 24 saattir.",
        },
      },
    })
  ).json();
  expect(
    (
      await teacher.request.post(`/api/courses/${c.id}/activities/${a.activity_id}/publish`, {
        headers,
        data: {},
      })
    ).status(),
  ).toBe(200);
  await student.request.post("/api/auth/signup", {
    headers,
    data: {
      email: `daily-${Date.now()}@pusula.local`,
      password: "TestPassword2026!",
      display_name: "Günlük Öğrenci",
      role: "student",
    },
  });
  await student.request.post("/api/courses/join", { headers, data: { code: c.invite_code } });
  const page = await student.newPage();
  await page.goto("/app?page=tasks");
  await expect(page.getByRole("heading", { name: "Günlük temel kazanım" })).toBeVisible();
  await page.getByRole("button", { name: "Günlük çalışmaya başla", exact: true }).click();
  await page.getByRole("button", { name: "Yanlış", exact: true }).click();
  await page.getByRole("button", { name: "Cevabımı kontrol et" }).click();
  await page.getByRole("button", { name: "Devam et", exact: true }).click();
  await expect(page.getByText("Şimdi yanlışları birlikte pekiştirelim.")).toBeVisible();
  await page.getByRole("button", { name: "Çalışmaya ara ver ve ana sayfaya dön" }).click();
  await page.getByRole("button", { name: "Dersi terk et", exact: true }).click();
  await page.getByRole("button", { name: "Görevler", exact: true }).click();
  await page.getByRole("button", { name: "Günlük çalışmaya devam et", exact: true }).click();
  await expect(page.getByText("Şimdi yanlışları birlikte pekiştirelim.")).toBeVisible();
  await page.getByRole("button", { name: "Doğru", exact: true }).click();
  await page.getByRole("button", { name: "Cevabımı kontrol et" }).click();
  await page.getByRole("button", { name: "Sonucumu gör" }).click();
  await page.getByRole("link", { name: "Öğrenme alanına dön" }).click();
  await page.getByRole("button", { name: "Görevler", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Bugünün adımlarını tamamladın!" })).toBeVisible();
  const before = await (await student.request.get("/api/daily")).json();
  await page.reload();
  const after = await (await student.request.get("/api/daily")).json();
  expect(after.plan.status).toBe("completed");
  expect(after.items.map((i: { id: string }) => i.id)).toEqual(
    before.items.map((i: { id: string }) => i.id),
  );
  const rewards = await (await student.request.get("/api/rewards")).json();
  expect(rewards.wallet).toMatchObject({ xp: 40, tokens: 10 });
  expect(rewards.streak.current).toBe(1);
  expect(
    rewards.days.filter(
      (d: { goal_completed: boolean; actual_learning: boolean }) =>
        d.goal_completed && d.actual_learning,
    ),
  ).toHaveLength(1);
  await page.getByRole("button", { name: "Profil", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Günlük serin" })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Haftalık hedefler" })).toHaveCount(0);
  await page.getByRole("button", { name: "Görevler", exact: true }).click();
  await page.getByRole("button", { name: "Haftalık", exact: true }).click();
  await expect(page.getByRole("progressbar", { name: "Haftalık hedefler" })).toHaveAttribute(
    "aria-valuenow",
    "1",
  );
  await expect(page.getByRole("button", { name: "Sandığı aç", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Mağaza", exact: true }).click();
  const frame = page
    .locator("article")
    .filter({ has: page.getByRole("heading", { name: "Leylak çerçeve", exact: true }) });
  await frame.getByRole("button", { name: "Satın al", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Ürün envanterine eklendi." }),
  ).toBeVisible();
  await frame.getByRole("button", { name: "Etkinleştir", exact: true }).click();
  await expect(frame.getByRole("button", { name: "Etkin", exact: true })).toBeDisabled();
  await page.reload();
  await expect(page.locator(".dp-frame-lilac").first()).toBeVisible();
  const wallet = (await (await student.request.get("/api/rewards")).json()).wallet;
  expect(wallet).toMatchObject({ xp: 40, tokens: 0, cosmetics: { frame: "lilac" } });
  const ranking = await (await student.request.get(`/api/courses/${c.id}/ranking`)).json();
  expect(ranking.entries[0].xp).toBe(40);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app?page=profile");
  await expect(page.getByRole("heading", { name: "Günlük serin" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await teacher.close();
  await page.goto("/app?page=league");
  await expect(
    page.getByRole("button", { name: "Bu haftanın ligine katıl", exact: true }),
  ).toBeDisabled();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Bu haftanın ligine katıl", exact: true }).click();
  await expect(page.locator(".your-rank .rank-points")).toHaveText("40 XP");
  await student.request.post("/api/profile", {
    headers,
    data: { display_name: "Günlük Öğrenci", university: "", public_profile: false },
  });
  const league = await (await student.request.get("/api/league")).json();
  expect(league.membership.withdrawn).toBe(true);
  expect(league.entries).toHaveLength(0);
  await student.close();
});
