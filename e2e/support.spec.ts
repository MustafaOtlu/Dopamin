import { test, expect } from "@playwright/test";
import { registerTeacher } from "./auth";
test("öğrenci destek notu, eski ekran çatışması, akademisyen yanıtı ve yeniden açma", async ({
  page,
  browser,
}) => {
  const headers = { origin: "http://127.0.0.1:3001" },
    suffix = Date.now();
  const teacher = await browser.newContext();
  try {
    await registerTeacher(teacher);
    const courseResponse = await teacher.request.post("/api/courses", {
      headers,
      data: { title: `Destek Dersi ${suffix}`, term: "Güz" },
    });
    expect(courseResponse.ok()).toBe(true);
    const course = await courseResponse.json();
    const objectiveResponse = await teacher.request.post(`/api/courses/${course.id}/objectives`, {
      headers,
      data: { topic_title: "Algoritmalar", title: "Sonluluk koşulunu açıklayabilme", week: 1 },
    });
    expect(objectiveResponse.ok()).toBe(true);
    const objective = await objectiveResponse.json();
    expect(
      (
        await page.request.post("/api/auth/signup", {
          headers,
          data: {
            email: `support-${suffix}@pusula.local`,
            password: "SupportTest2026!",
            display_name: "Destek Öğrencisi",
            role: "student",
          },
        })
      ).ok(),
    ).toBe(true);
    expect(
      (
        await page.request.post("/api/courses/join", {
          headers,
          data: { code: course.invite_code },
        })
      ).ok(),
    ).toBe(true);
    await page.goto("/app?page=courses");
    await page.locator(".dp-topic-node").first().click();
    await page.getByText("Bu konuda desteğe ihtiyacım var",{exact:true}).click();
    await page.getByRole("button",{name:"Sonluluk koşulunu açıklayabilme",exact:true}).click();
    await page.getByLabel("Nerede zorlanıyorsun?", { exact: true }).fill("Döngü ne zaman durur?");
    await page.getByRole("button", { name: "Destek iste", exact: true }).click();
    await expect(page.getByRole("dialog").getByRole("status")).toContainText(
      "Bildirimin akademisyenine ulaştı",
    );
    const tp = await teacher.newPage();
    await tp.goto("/app?page=courses");
    await tp.getByRole("button", { name: course.title, exact: true }).click();
    await tp.getByRole("tab", { name: "Öğrenciler", exact: true }).click();
    await tp
      .getByRole("row")
      .filter({ hasText: "Destek Öğrencisi" })
      .getByRole("button", { name: "İncele", exact: true })
      .click();
    await expect(tp.locator(".gap-teacher-card")).toContainText("Döngü ne zaman durur?");
    await page
      .getByLabel("Nerede zorlanıyorsun?", { exact: true })
      .fill("İç içe döngülerde hangi koşulu önce kontrol etmeliyim?");
    await page.getByRole("button", { name: "Notu güncelle", exact: true }).click();
    const current = await page.request.get(`/api/courses/${course.id}/gaps/${objective.id}`);
    await expect
      .poll(async () => (await (await page.request.get(current.url())).json()).report.revision)
      .toBe(2);
    const feedback =
      "Her döngünün koşulunu kendi başlangıcında kontrol et; küçük bir örneği adım adım izle.";
    await tp.getByLabel("Öğrenciye notun (isteğe bağlı)", { exact: true }).fill(feedback);
    await tp.getByRole("button", { name: "Desteği tamamla", exact: true }).click();
    await expect(tp.getByRole("dialog").getByRole("alert")).toContainText(
      "başka bir yerde güncellendi",
    );
    await expect(tp.locator(".gap-teacher-card")).toContainText("İç içe döngülerde");
    await tp.getByRole("button", { name: "Desteği tamamla", exact: true }).click();
    await expect(tp.getByRole("dialog")).toContainText("Destek bildirimi kapatıldı");
    await page.reload();
    await page.locator(".dp-topic-node").first().click();
    await page.getByText("Bu konuda desteğe ihtiyacım var",{exact:true}).click();
    await page.getByRole("button",{name:"Sonluluk koşulunu açıklayabilme",exact:true}).click();
    await expect(page.locator(".support-reply")).toContainText(feedback);
    await page.getByRole("button", { name: "Yeniden destek iste", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText("Destek bekleniyor");
    await page.getByRole("button", { name: "Artık desteğe ihtiyacım yok", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText("Bildirim kapalı");
    const detail = await (
      await page.request.get(`/api/courses/${course.id}/gaps/${objective.id}`)
    ).json();
    expect(detail.history).toHaveLength(5);
  } finally {
    await teacher.close().catch(() => {});
  }
});
