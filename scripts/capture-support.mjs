import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
const base = "http://127.0.0.1:3000",
  output = path.resolve(".data/previews");
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const note = "Algoritmanın sonlu olması ile hızlı çalışması arasındaki farkı karıştırıyorum.";
const reply =
  "Sonluluk, işlemin belirli sayıda adımda bitmesidir. Çalışma hızı ise bu adımların ne kadar sürdüğüyle ilgilidir. Küçük bir örneği adım adım izleyebilirsin.";
try {
  const student = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const teacher = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  for (const [context, email] of [
    [student, "ogrenci@pusula.local"],
    [teacher, "akademisyen@pusula.local"],
  ]) {
    const response = await context.request.post(`${base}/api/auth/login`, {
      headers: { origin: base },
      data: { email, password: "PusulaDemo2026!" },
    });
    if (!response.ok()) throw new Error(await response.text());
  }
  const course = (await (await student.request.get(`${base}/api/courses`)).json()).find(
    (c) => c.code === "BIL101",
  );
  const objective = (
    await (await student.request.get(`${base}/api/courses/${course.id}/objectives`)).json()
  )[0];
  const previous = await (
    await student.request.get(`${base}/api/courses/${course.id}/gaps/${objective.id}`)
  ).json();
  if (previous.report && !previous.report.resolved && previous.report.note !== note)
    throw new Error("Existing support note differs; leave it untouched.");
  const sp = await student.newPage();
  await sp.goto(`${base}/app?page=courses`);
  await sp.getByRole("button", { name: course.title, exact: true }).click();
  await sp.getByRole("tab", { name: "Öğrenme yolu", exact: true }).click();
  await sp
    .locator(".objective-row")
    .filter({ hasText: objective.title })
    .getByRole("button", { name: /Bu konuda eksiğim var|Destek bildirimini görüntüle/ })
    .click();
  await sp.getByLabel("Nerede zorlanıyorsun?", { exact: true }).fill(note);
  if (!previous.report || previous.report.resolved) {
    await sp
      .getByRole("button", {
        name: previous.report ? "Yeniden destek iste" : "Destek iste",
        exact: true,
      })
      .click();
    await sp.getByRole("dialog").getByText("Destek bekleniyor", { exact: true }).waitFor();
  }
  await sp
    .getByRole("dialog")
    .screenshot({ path: path.join(output, "student-support-m4.png"), animations: "disabled" });
  const tp = await teacher.newPage();
  await tp.goto(`${base}/app?page=courses`);
  await tp.getByRole("button", { name: course.title, exact: true }).click();
  await tp.getByRole("tab", { name: "Öğrenciler", exact: true }).click();
  await tp
    .getByRole("row")
    .filter({ hasText: "Ece Yılmaz" })
    .getByRole("button", { name: "İncele", exact: true })
    .click();
  await tp.getByLabel("Öğrenciye notun (isteğe bağlı)", { exact: true }).fill(reply);
  await tp
    .getByRole("dialog")
    .screenshot({ path: path.join(output, "teacher-support-m4.png"), animations: "disabled" });
  await tp.getByRole("button", { name: "Desteği tamamla", exact: true }).click();
  await tp.getByRole("dialog").getByText("Destek bildirimi kapatıldı", { exact: true }).waitFor();
  await sp.reload();
  await sp.getByRole("button", { name: course.title, exact: true }).click();
  await sp.getByRole("tab", { name: "Öğrenme yolu", exact: true }).click();
  await sp
    .locator(".objective-row")
    .filter({ hasText: objective.title })
    .getByRole("button", { name: "Bu konuda eksiğim var", exact: true })
    .click();
  await sp.locator(".support-reply").waitFor();
  await sp
    .getByRole("dialog")
    .screenshot({
      path: path.join(output, "student-support-reply-m4.png"),
      animations: "disabled",
    });
  console.log(output);
} finally {
  await browser.close();
}
