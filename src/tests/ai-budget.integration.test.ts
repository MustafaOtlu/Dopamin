import { beforeAll, beforeEach, afterAll, it, expect, vi } from "vitest";
import { z } from "zod";
import { createDatabase, migrate, asUser, type RootDatabase } from "@/lib/db";
import { createLocalUser } from "@/modules/auth/service";
import { createCourse } from "@/modules/courses/service";
import {
  reserveRequest,
  budgetedGenerate,
  budgetConfig,
  estimatedRequestCost,
} from "@/modules/ai/budget";
import { generate, type Generate } from "@/modules/ai/provider";
import type { User } from "@/types/domain";
let db: RootDatabase, teacher: User, other: User, scope: { course_id: string; job_id: string };
const keys = [
    "AI_API_KEY",
    "AI_MODEL",
    "AI_DAILY_BUDGET_USD",
    "AI_INPUT_USD_PER_MILLION",
    "AI_OUTPUT_USD_PER_MILLION",
  ] as const,
  original = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
beforeAll(async () => {
  db = await createDatabase("memory://");
  await migrate(db);
  teacher = await createLocalUser(
    db,
    {
      email: "budget@test.edu",
      display_name: "Akademisyen",
      role: "teacher",
      password: "TestPass2026!",
    },
    true,
  );
  other = await createLocalUser(db, {
    email: "budget-student@test.edu",
    display_name: "Öğrenci",
    role: "student",
    password: "TestPass2026!",
  });
  const c = await asUser(db, teacher.id, (tx) =>
    createCourse(tx, teacher, { title: "Bütçe dersi", term: "Güz" }),
  );
  const [job] = await db.query<{ id: string }>(
    "insert into background_jobs(course_id,created_by,kind,payload) values($1,$2,'ai_analyze','{}') returning id",
    [c.id, teacher.id],
  );
  scope = { course_id: c.id, job_id: job.id };
});
beforeEach(async () => {
  vi.restoreAllMocks();
  await db.query("truncate ai_usage,ai_cost_requests");
  process.env.AI_API_KEY = "test-key-no-network";
  process.env.AI_MODEL = "contract-model";
  process.env.AI_DAILY_BUDGET_USD = "1";
  process.env.AI_INPUT_USD_PER_MILLION = "1";
  process.env.AI_OUTPUT_USD_PER_MILLION = "2";
});
afterAll(async () => {
  vi.restoreAllMocks();
  await db.close();
  for (const k of keys) {
    if (original[k] === undefined) delete process.env[k];
    else process.env[k] = original[k];
  }
});
it("eşzamanlı rezervasyon günlük ortak bütçeyi aşamaz; fiyat yapılandırması zorunludur", async () => {
  const results = await Promise.allSettled(
    [1, 2].map(() => reserveRequest(db, scope, "test", 0.6, budgetConfig())),
  );
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  expect(await db.query("select * from ai_cost_requests")).toHaveLength(1);
  delete process.env.AI_INPUT_USD_PER_MILLION;
  expect(() => budgetConfig()).toThrow("yapılandırılmadı");
});
it("gerçek kullanım bir kez kaydedilir, kalan rezervasyon serbest kalır ve öğrenci okuyamaz", async () => {
  const fake: Generate = async (_name, schema, _instructions, _input, observe) => {
    await observe?.({ input_tokens: 100, output_tokens: 50 }, "contract-model");
    await observe?.({ input_tokens: 100, output_tokens: 50 }, "contract-model");
    return {
      data: schema.parse({ value: "tamam" }),
      model: "contract-model",
      input_tokens: 100,
      output_tokens: 50,
    };
  };
  await budgetedGenerate(db, scope, fake)("test", z.object({ value: z.string() }), "Üret", {
    text: "Kaynak",
  });
  const [request] = await db.query<{ status: string; actual_usd: string; reserved_usd: string }>(
    "select * from ai_cost_requests",
  );
  expect(request.status).toBe("settled");
  expect(Number(request.actual_usd)).toBeCloseTo(0.0002);
  expect(Number(request.reserved_usd)).toBeGreaterThan(Number(request.actual_usd));
  expect(await db.query("select * from ai_usage")).toHaveLength(1);
  expect(
    await asUser(db, other.id, (tx) => tx.query("select * from ai_cost_requests")),
  ).toHaveLength(0);
  await expect(
    asUser(db, teacher.id, (tx) => tx.query("update ai_cost_requests set actual_usd=0")),
  ).rejects.toThrow();
  await expect(asUser(db, teacher.id, (tx) => tx.query("delete from ai_usage"))).rejects.toThrow();
});
it("sözleşmeye uymayan yanıtın da maliyeti kaydedilir", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({
        status: "completed",
        model: "contract-model",
        usage: { input_tokens: 120, output_tokens: 30 },
        output: [{ type: "message", content: [{ type: "output_text", text: "invalid json" }] }],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    ),
  );
  await expect(
    budgetedGenerate(db, scope, generate)("test", z.object({ value: z.string() }), "Üret", {
      text: "Kaynak",
    }),
  ).rejects.toThrow("sözleşmesine");
  const [request] = await db.query<{ status: string; actual_usd: string }>(
    "select * from ai_cost_requests",
  );
  expect(request.status).toBe("settled");
  expect(Number(request.actual_usd)).toBeCloseTo(0.00018);
  expect(await db.query("select * from ai_usage")).toHaveLength(1);
});
it("ağ hatasında olası ücret rezervasyonu tutulur ve sonraki çağrı bütçeyi kontrol eder", async () => {
  const schema = z.object({ value: z.string() }),
    rates = budgetConfig(),
    cost = estimatedRequestCost(schema, "Üret", { text: "Kaynak" }, rates);
  const failing: Generate = async () => {
    throw new Error("Network timeout");
  };
  await expect(
    budgetedGenerate(db, scope, failing)("test", schema, "Üret", { text: "Kaynak" }),
  ).rejects.toThrow("timeout");
  const [request] = await db.query<{ status: string; actual_usd: string | null }>(
    "select * from ai_cost_requests",
  );
  expect(request).toMatchObject({ status: "unknown", actual_usd: null });
  process.env.AI_DAILY_BUDGET_USD = String(cost * 1.5);
  await expect(reserveRequest(db, scope, "next", cost, budgetConfig())).rejects.toThrow(
    "bütçesine",
  );
  expect(await db.query("select * from ai_cost_requests")).toHaveLength(1);
});
