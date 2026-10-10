import { test, expect, type Page } from "@playwright/test";
import { expectAccessible } from "./accessibility";

async function login(page: Page, teacher = false) {
  expect(
    (
      await page.request.post("/api/auth/login", {
        headers: { origin: "http://127.0.0.1:3001" },
        data: {
          email: teacher ? "akademisyen@pusula.local" : "ogrenci@pusula.local",
          password: "PusulaDemo2026!",
        },
      })
    ).ok(),
  ).toBe(true);
}

test("hesap ekranlarında erişilebilir etiketler ve kontrast", async ({ page }) => {
  for (const route of ["login", "register", "forgot-password"]) {
    await page.goto(`/${route}`);
    await page.locator("form").waitFor();
    await expectAccessible(page, route);
  }
});

test("akademisyen panelleri, ders sekmeleri ve modal klavye odağı", async ({ page }) => {
  await login(page, true);
  await page.goto("/app");
  const opener = page.getByRole("button", { name: "Yeni ders", exact: true });
  await opener.waitFor();
  await expectAccessible(page, "teacher-home");
  await opener.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Yeni ders oluştur" });
  await expect(dialog).toBeVisible();
  const close = dialog.getByRole("button", { name: "Kapat", exact: true });
  await expect(close).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "Dersi oluştur", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await expectAccessible(page, "new-course-dialog");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
  await page.getByRole("button", { name: "Derslerim", exact: true }).click();
  await page.getByRole("button", { name: "Programlamaya Giriş", exact: true }).click();
  for (const name of await page.getByRole("tab").allTextContents()) {
    await page.getByRole("tab", { name, exact: true }).click();
    await expect(page.getByRole("tabpanel")).toBeVisible();
    await expectAccessible(page, `teacher-${name}`);
  }
});

test("mobil öğrenci alt menüsü, konu seçenekleri ve beş panel",async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:"reduce"});await login(page);await page.goto("/app");
 await page.locator(".dp-topic-node").first().waitFor();await expect(page.getByRole("navigation",{name:"Ana menü"})).toBeVisible();
 await page.keyboard.press("Tab");await expect(page.getByRole("link",{name:"İçeriğe geç"})).toBeFocused();await page.keyboard.press("Enter");await expect(page.locator("#student-main")).toBeFocused();
 await expectAccessible(page,"student-mobile-learn");const opener=page.locator(".dp-topic-node").first();await opener.focus();await opener.press("Enter");await expectAccessible(page,"topic-options");
 await page.getByRole("button",{name:/Derse hazırlık/}).click();await expectAccessible(page,"preparation");await page.keyboard.press("Escape");await expect(opener).toBeFocused();
 const nav=await page.locator(".dp-nav-item").evaluateAll(items=>items.map(e=>({label:e.textContent?.trim(),left:e.getBoundingClientRect().left})).sort((a,b)=>a.left-b.left).map(e=>e.label));expect(nav).toEqual(["Görevler","Maç","Öğren","Mağaza","Profil"]);
 for(const width of [390,1440]){await page.setViewportSize({width,height:1000});for(const panel of ["learn","tasks","match","shop","profile"]){await page.goto(`/app?page=${panel}`);await page.locator(".dp-main h1").first().waitFor();await expect(page.getByRole("status").filter({hasText:"Yükleniyor"})).toHaveCount(0);await expectAccessible(page,`student-${panel}-${width}`);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)}}
});
