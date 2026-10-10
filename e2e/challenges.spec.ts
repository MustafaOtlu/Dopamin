import { test, expect } from "@playwright/test";
import { loginDemo } from "./auth";
for (const mode of ["classic", "rapid"] as const)
  test(`${mode}: süreli ortak paket, gizli sonuç ve iki oyuncuya ödül`, async ({ browser }) => {
    const teacher = await browser.newContext(),
      one = await browser.newContext(),
      two = await browser.newContext();
    const headers = { origin: "http://127.0.0.1:3001" };
    async function post(ctx: typeof one, url: string, data: unknown) {
      const r = await ctx.request.post(`/api/${url}`, { headers, data });
      expect(r.ok(), await r.text()).toBe(true);
      return r.json();
    }
    await loginDemo(teacher);
    const c = await post(teacher, "courses", { title: `Meydan okuma ${Date.now()}`, term: "Güz" });
    const o = await post(teacher, `courses/${c.id}/objectives`, {
      topic_title: "Temel",
      title: "Kazanım",
      week: 1,
    });
    for (let i = 0; i < 2; i++) {
      const a = await post(teacher, `courses/${c.id}/activities`, {
        objective_id: o.id,
        activity: {
          kind: "true_false",
          title: `Ortak önerme ${i}`,
          instruction: "Seç",
          content: { statement: "Bir gün 24 saattir." },
          answer_key: { value: true },
          explanation: "Bir gün 24 saattir.",
        },
      });
      await post(teacher, `courses/${c.id}/activities/${a.activity_id}/publish`, {});
    }
    for (const [ctx, name] of [
      [one, "Davet eden"],
      [two, "Davet alan"],
    ] as const) {
      await post(ctx, "auth/signup", {
        email: `duel-${name.replaceAll(" ", "")}-${Date.now()}@test.edu`,
        display_name: name,
        role: "student",
        password: "TestPassword2026!",
      });
      await post(ctx, "courses/join", { code: c.invite_code });
    }
    const first = await one.newPage(),
      second = await two.newPage();
    await first.goto("/app?page=challenges");
    if (mode === "rapid") await first.getByRole("button", { name: /Seri.*Yan yanayken/ }).click();
    await first
      .getByLabel("Sınıf arkadaşın", { exact: true })
      .selectOption({ label: "Davet alan" });
    await first
      .getByRole("button", {
        name: mode === "classic" ? "Davet et ve turunu oyna" : "Odayı aç",
        exact: true,
      })
      .click();
    await expect(first).toHaveURL(/\/learn\//);
    if (mode === "rapid") {
      await expect(first.getByRole("heading", { name: "Rakibin bekleniyor" })).toBeVisible();
      await expect(first.getByRole("button", { name: "Doğru", exact: true })).toHaveCount(0);
      await second.goto("/app?page=challenges");
      await second.getByRole("button", { name: "Odaya katıl", exact: true }).click();
      await expect(first.getByRole("button", { name: "Doğru", exact: true })).toBeVisible();
      await expect(second.getByRole("button", { name: "Doğru", exact: true })).toBeVisible();
      const sessionOne = first.url().split("/").pop(),
        sessionTwo = second.url().split("/").pop();
      const before = await (await one.request.get(`/api/sessions/${sessionOne}`)).json();
      const peer = await (await two.request.get(`/api/sessions/${sessionTwo}`)).json();
      expect(before.timing.deadline).toEqual(peer.timing.deadline);
      await first.reload();
      await expect(first.locator(".dp-match-timer")).toBeVisible();
      expect(
        (await (await one.request.get(`/api/sessions/${sessionOne}`)).json()).timing.deadline,
      ).toBe(before.timing.deadline);
    }
    for (let i = 0; i < 2; i++) {
      await first.getByRole("button", { name: "Yanlış", exact: true }).click();
      await first.getByRole("button", { name: "Cevabımı kontrol et" }).click();
      await expect(first.getByRole("heading", { name: "Cevabın kaydedildi." })).toBeVisible();
      await expect(first.getByText("Doğru cevap:", { exact: true })).toHaveCount(0);
      const next = first.getByRole("button", {
        name: i === 1 ? "Sonucumu gör" : "Devam et",
        exact: true,
      });
      if (i === 0) {
        let release!: () => void;
        let requested!: () => void;
        const held = new Promise<void>((resolve) => {
          release = resolve;
        });
        const seen = new Promise<void>((resolve) => {
          requested = resolve;
        });
        await first.route(
          "**/api/sessions/*",
          async (route) => {
            requested();
            await held;
            await route.continue();
          },
          { times: 1 },
        );
        try {
          await next.click();
          await seen;
          await expect(next).toBeDisabled();
          await expect(
            first.getByRole("button", { name: "Yanlış", exact: true, includeHidden: true }),
          ).toBeDisabled();
          await expect(first.getByRole("heading", { name: "Cevabın kaydedildi." })).toBeVisible();
        } finally {
          release();
        }
      } else await next.click();
    }
    await first.getByRole("link", { name: "Meydan okumalara dön", exact: true }).click();
    await expect(
      first.getByText("Turun kaydedildi. Arkadaşının tamamlaması bekleniyor."),
    ).toBeVisible();
    expect((await (await one.request.get("/api/history")).json()).items).toHaveLength(0);
    if (mode === "classic") {
      await second.goto("/app?page=challenges");
      await second.getByRole("button", { name: "Kabul et ve turunu oyna", exact: true }).click();
    }
    for (let i = 0; i < 2; i++) {
      await second.getByRole("button", { name: "Doğru", exact: true }).click();
      await second.getByRole("button", { name: "Cevabımı kontrol et" }).click();
      await second
        .getByRole("button", { name: i === 1 ? "Sonucumu gör" : "Devam et", exact: true })
        .click();
    }
    await second.getByRole("link", { name: "Meydan okumalara dön", exact: true }).click();
    await expect(second.getByText("Bu turu sen kazandın!", { exact: true })).toBeVisible();
    await expect(second.getByText("100 / 100", { exact: true })).toBeVisible();
    await first.reload();
    await expect(first.getByText("Davet alan bu turu kazandı.", { exact: true })).toBeVisible();
    const rewards = (await (await one.request.get("/api/rewards")).json()).wallet;
    expect(rewards).toMatchObject({ xp: 15, tokens: 0 });
    expect((await (await two.request.get("/api/rewards")).json()).wallet).toMatchObject({
      xp: 30,
      tokens: 5,
    });
    expect(await (await one.request.get("/api/mistakes")).json()).toHaveLength(0);
    expect((await (await one.request.get("/api/history")).json()).items).toHaveLength(2);
    await second.setViewportSize({ width: 390, height: 844 });
    await second.reload();
    await expect(second.getByText("Bu turu sen kazandın!", { exact: true })).toBeVisible();
    expect(
      await second.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await teacher.close();
    await one.close();
    await two.close();
  });
