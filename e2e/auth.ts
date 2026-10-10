import { expect, type BrowserContext } from "@playwright/test";
import { randomUUID } from "node:crypto";

export async function registerTeacher(context: BrowserContext) {
  const response = await context.request.post("/api/auth/signup", {
    headers: { origin: "http://127.0.0.1:3001" },
    data: {
      email: `teacher-${randomUUID()}@test.edu`,
      display_name: "Test Akademisyeni",
      password: "TeacherTest2026!",
      role: "teacher",
      invite_code: `e2e-${process.env.PUSULA_E2E_RUN_ID || "manual"}`,
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
  const result = await response.json();
  expect(result.user.teacher_verified).toBe(true);
  return result.user;
}

// Reuse a real session inside this test worker instead of consuming the demo
// account's login budget in every independent feature scenario.
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["cookies"]>>>();
export async function loginDemo(context: BrowserContext, role: "teacher" | "student" = "teacher") {
  const cached = sessions.get(role);
  if (cached) {
    await context.addCookies(cached);
    return;
  }
  const response = await context.request.post("/api/auth/login", {
    headers: { origin: "http://127.0.0.1:3001" },
    data: {
      email: role === "teacher" ? "akademisyen@pusula.local" : "ogrenci@pusula.local",
      password: "PusulaDemo2026!",
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
  sessions.set(role, await context.cookies());
}
