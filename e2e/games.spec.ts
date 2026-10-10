import { test, expect } from "@playwright/test";
import { loginDemo } from "./auth";
import { expectAccessible } from "./accessibility";
test("boşluk, kategori ve görsel bölge oyunları; görsel editörü dokunma ve klavye", async ({
  browser,
}) => {
  const tc = await browser.newContext(),
    sc = await browser.newContext();
  const headers = { origin: "http://127.0.0.1:3001" };
  await loginDemo(tc);
  const c = await (
    await tc.request.post("/api/courses", {
      headers,
      data: { title: `Oyun Türleri ${Date.now()}`, term: "Güz" },
    })
  ).json();
  const o = await (
    await tc.request.post(`/api/courses/${c.id}/objectives`, {
      headers,
      data: { title: "Yapıları tanımlar", topic_title: "Hücre", week: 1 },
    })
  ).json();
  for (const activity of [
    {
      kind: "fill_blank",
      title: "Boşluk oyunu",
      content: {
        text: "Hücrenin yönetim merkezi {{b1}}.",
        blanks: [{ id: "b1", label: "Yönetim merkezi" }],
      },
      answer_key: { accepted: { b1: ["çekirdek"] } },
    },
    {
      kind: "categorize",
      title: "Kategori oyunu",
      content: {
        items: [
          { id: "a", label: "Mitokondri" },
          { id: "b", label: "Kloroplast" },
        ],
        categories: [
          { id: "c", label: "Enerji" },
          { id: "d", label: "Fotosentez" },
        ],
      },
      answer_key: { categories: { a: "c", b: "d" } },
    },
  ]) {
    const a = await (
      await tc.request.post(`/api/courses/${c.id}/activities`, {
        headers,
        data: {
          objective_id: o.id,
          activity: {
            ...activity,
            instruction: "Doğru cevabı belirle.",
            explanation: "Hücre yapılarını incele.",
          },
        },
      })
    ).json();
    expect(
      (
        await tc.request.post(`/api/courses/${c.id}/activities/${a.activity_id}/publish`, {
          headers,
          data: {},
        })
      ).status(),
    ).toBe(200);
  }
  const t = await tc.newPage();
  await t.goto("/app?page=courses");
  await t.getByRole("button", { name: c.title, exact: true }).click();
  await t.getByRole("button", { name: "Etkinlik hazırla" }).click();
  const dialog = t.getByRole("dialog");
  await dialog.getByLabel("Etkinlik türü").selectOption("region");
  await dialog.getByLabel("Başlık", { exact: true }).fill("Bölge oyunu");
  await dialog.getByLabel("Görsel açıklaması").fill("Merkezde işaretlenmiş hücre yapısı");
  await dialog.getByLabel("Öğrencinin bulacağı yapı").fill("Çekirdek");
  await dialog.getByLabel("Öğrenme açıklaması").fill("Seçtiğin bölge hücrenin çekirdeğidir.");
  const png = await t.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 300;
    canvas.height = 200;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#dfeef0";
    ctx.fillRect(0, 0, 300, 200);
    ctx.fillStyle = "#7953ee";
    ctx.fillRect(75, 50, 75, 50);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await dialog.getByLabel("Ders görseli (PNG veya JPEG)").setInputFiles({
    name: "hucre.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await expect(dialog.locator(".region-edit-preview img")).toBeVisible();
  await dialog.getByRole("button", { name: "Taslağı kaydet" }).click();
  await t
    .locator(".activity-row")
    .filter({ has: t.getByRole("heading", { name: "Bölge oyunu", exact: true }) })
    .getByRole("button", { name: "Yayımla", exact: true })
    .click();
  await sc.request.post("/api/auth/signup", {
    headers,
    data: {
      email: `games-${Date.now()}@pusula.local`,
      display_name: "Oyun Öğrenci",
      password: "TestPassword2026!",
      role: "student",
    },
  });
  await sc.request.post("/api/courses/join", { headers, data: { code: c.invite_code } });
  const s = await sc.newPage();
  await s.goto("/app?page=courses");
  await s.locator(".dp-topic-node").first().click();
  await s.getByRole("button", {name:/^Tekrar/}).click();
  await s.getByLabel("Yönetim merkezi").fill("ÇEKİRDEK");
  await expectAccessible(s, "fill-blank");
  await s.getByRole("button", { name: "Cevabımı kontrol et" }).click();
  await expect(s.getByText("Güzel, doğru cevap!", { exact: true })).toBeVisible();
  await s.getByRole("button", { name: "Devam et", exact: true }).click();
  await s.getByLabel("Mitokondri kategorisi", { exact: true }).selectOption("c");
  await s.getByLabel("Kloroplast kategorisi", { exact: true }).selectOption("d");
  await expectAccessible(s, "categorize");
  await s.getByRole("button", { name: "Cevabımı kontrol et" }).click();
  await s.getByRole("button", { name: "Devam et", exact: true }).click();
  const image = s.getByRole("button", { name: "Çekirdek için görselde bir nokta seç" });
  await expect
    .poll(() =>
      image
        .locator("img")
        .evaluate((img: HTMLImageElement) => img.complete && img.naturalHeight > 0),
    )
    .toBe(true);
  await image.scrollIntoViewIfNeeded();
  const box = await image.boundingBox();
  await image.click({ position: { x: box!.width * 0.375, y: box!.height * 0.375 } });
  await expect(s.getByLabel("Yatay (%)")).toHaveValue("37.5");
  expect(Number(await s.getByLabel("Dikey (%)").inputValue())).toBeCloseTo(37.5, 0);
  await s.getByLabel("Yatay (%)").fill("37");
  await s.getByLabel("Yatay (%)").press("ArrowUp");
  await expect(s.getByLabel("Yatay (%)")).toHaveValue("38");
  await expectAccessible(s, "region");
  await s.getByRole("button", { name: "Cevabımı kontrol et" }).click();
  await expect(s.getByText("Güzel, doğru cevap!", { exact: true })).toBeVisible();
  await s.getByRole("button", { name: "Sonucumu gör" }).click();
  await expect(s.getByText("3/3", { exact: true })).toBeVisible();
  await s.getByRole("link", { name: "Öğrenme alanına dön" }).click();
  await s.getByRole("button", { name: "Profil", exact: true }).click();
  await s.getByRole("button", { name: "Geçmişim", exact: true }).click();
  await expect(s.locator(".history-card")).toHaveCount(3);
  await t.getByRole("tab", { name: "Öğrenciler", exact: true }).click();
  await t.getByRole("button", { name: "İncele", exact: true }).click();
  await expect(dialog.getByText("İlk denemeler: 3/3")).toBeVisible();
  await dialog.getByRole("button", { name: "Özel çalışma ata", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Yeni ödev", exact: true })).toBeVisible();
  await expect(dialog.getByLabel("Oyun Öğrenci", { exact: true })).toBeChecked();
  await tc.close();
  await sc.close();
});
