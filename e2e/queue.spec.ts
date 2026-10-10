import { test, expect } from "@playwright/test";
test("ders işlem merkezinden gerçek PDF yeniden işlenir; öğrenci yeniden deneyemez", async ({
  page,
  browser,
}) => {
  const headers = { origin: "http://127.0.0.1:3001" };
  expect(
    (
      await page.request.post("/api/auth/login", {
        headers,
        data: { email: "akademisyen@pusula.local", password: "PusulaDemo2026!" },
      })
    ).ok(),
  ).toBe(true);
  const course = (await (await page.request.get("/api/courses")).json()).find(
    (c: { code: string }) => c.code === "JOB101",
  );
  const content = await (await page.request.get(`/api/courses/${course.id}/content`)).json();
  expect(content.queue.attention).toBe(1);
  const student = await browser.newContext();
  try {
    expect(
      (
        await student.request.post("/api/auth/login", {
          headers,
          data: { email: "ogrenci@pusula.local", password: "PusulaDemo2026!" },
        })
      ).ok(),
    ).toBe(true);
    expect(
      (
        await student.request.post(`/api/courses/${course.id}/jobs/${content.jobs[0].id}/retry`, {
          headers,
          data: {},
        })
      ).ok(),
    ).toBe(false);
    await page.goto("/app?page=courses");
    await page.getByRole("button", { name: course.title, exact: true }).click();
    await page.getByRole("tab", { name: "Kaynaklar ve AI", exact: true }).click();
    await expect(page.getByRole("heading", { name: "İşlem merkezi", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Yeniden dene", exact: true }).click();
    await expect(page.locator(".jobs-list").getByText("Tamamlandı", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Yeniden dene", exact: true })).toBeHidden();
    await page
      .getByRole("button", { name: "Yeniden işlenecek kaynak.pdf metnini incele", exact: true })
      .click();
    await expect(page.locator(".document-text")).toContainText("finite sequence");
    const saved = await (await page.request.get(`/api/courses/${course.id}/content`)).json();
    expect(saved.jobs).toHaveLength(1);
    expect(saved.jobs[0].manual_retries).toBe(1);
    expect(saved.jobs[0].status).toBe("completed");
  } finally {
    await student.close();
  }
});
