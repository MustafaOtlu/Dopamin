import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { generateGemini, geminiSchema } from "@/modules/ai/gemini";
import { curriculumOutput, generationSchema, toActivity } from "@/modules/ai/contracts";
beforeEach(() => {
  vi.stubEnv("AI_MODEL", "gemini-3.8-flash");
  vi.stubEnv("AI_API_KEY", "test-secret");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
it("sends a stateless schema request and includes thinking in billed output", async () => {
  const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({
        status: "completed",
        model: "gemini-3.8-flash",
        usage: { total_input_tokens: 80, total_output_tokens: 20, total_thought_tokens: 15 },
        steps: [
          { type: "thought", content: [{ type: "text", text: "not an answer" }] },
          { type: "model_output", content: [{ type: "text", text: '{"value":"ok"}' }] },
        ],
      }),
    ),
  );
  const observe = vi.fn();
  const result = await generateGemini(
    "test",
    z.object({ value: z.string() }),
    "Source only",
    { text: "source" },
    observe,
  );
  expect(result).toMatchObject({ data: { value: "ok" }, input_tokens: 80, output_tokens: 35 });
  expect(observe).toHaveBeenCalledWith({ input_tokens: 80, output_tokens: 35 }, "gemini-3.8-flash");
  const [url, options] = fetcher.mock.calls[0];
  expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/interactions");
  const body = JSON.parse(options!.body as string);
  expect(body).toMatchObject({
    store: false,
    generation_config: { max_output_tokens: 6000, thinking_level: "low" },
    response_format: { mime_type: "application/json" },
  });
  expect(options!.headers).toMatchObject({ "x-goog-api-key": "test-secret" });
  expect(JSON.stringify(body)).not.toContain("test-secret");
});
it("retains field names while converting grammar constraints to descriptions", () => {
  const schema = geminiSchema(z.toJSONSchema(curriculumOutput));
  expect(JSON.stringify(schema)).not.toContain('"pattern":');
  expect(JSON.stringify(schema)).not.toContain('"maxItems":');
  expect(JSON.stringify(schema)).toContain("maxItems: 100");
  expect((schema as { required: string[] }).required).toContain("topics");
  expect(
    geminiSchema({ type: "object", properties: { format: { type: "string" } } }),
  ).toMatchObject({ properties: { format: { type: "string" } } });
});
it("records charged usage even when full Zod validation rejects the output", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({
        status: "completed",
        usage: { total_input_tokens: 40, total_output_tokens: 8, total_thought_tokens: 3 },
        output_text: '{"value":"x"}',
      }),
    ),
  );
  const observe = vi.fn();
  await expect(
    generateGemini("test", z.object({ value: z.string().min(4) }), "", {}, observe),
  ).rejects.toMatchObject({ code: "AI_INVALID_OUTPUT" });
  expect(observe).toHaveBeenCalledWith({ input_tokens: 40, output_tokens: 11 }, "gemini-3.8-flash");
});
it("rejects truncated output after accounting for usage", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({
        status: "incomplete",
        usage: { total_input_tokens: 10, total_output_tokens: 1, total_thought_tokens: 5999 },
        output_text: '{"value":"ok"}',
      }),
    ),
  );
  const observe = vi.fn();
  await expect(
    generateGemini("test", z.object({ value: z.string() }), "", {}, observe),
  ).rejects.toMatchObject({ code: "AI_INCOMPLETE" });
  expect(observe).toHaveBeenCalledWith(
    { input_tokens: 10, output_tokens: 6000 },
    "gemini-3.8-flash",
  );
});
it("maps quota failures without echoing provider secrets or retrying inline", async () => {
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response("test-secret account details", { status: 429 }));
  await expect(generateGemini("test", z.object({}), "", {})).rejects.toMatchObject({
    code: "AI_RATE_LIMITED",
    status: 429,
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("blocks oversized context before contacting Google", async () => {
  const fetcher = vi.spyOn(globalThis, "fetch");
  await expect(
    generateGemini("test", z.object({}), "", { text: "x".repeat(500001) }),
  ).rejects.toMatchObject({ status: 413 });
  expect(fetcher).not.toHaveBeenCalled();
});

it("treats Google server errors as transient and never echoes its payload", async () => {
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("test-secret", { status: 503 }));
  await expect(generateGemini("test", z.object({}), "", {})).rejects.toMatchObject({
    code: "AI_UNAVAILABLE",
    status: 503,
  });
  expect(JSON.stringify(warning.mock.calls)).not.toContain("test-secret");
});

it("constrains successive generation requests to distinct activity types", () => {
  const candidate = {
    kind: "true_false",
    title: "Algoritma",
    instruction: "Değerlendir",
    explanation: "Sonlu adımlar",
    difficulty: 1,
    statement: "Algoritma sonlu adımlardan oluşur.",
    correct_boolean: true,
    items: [],
    categories: [],
    blanks: [],
    sources: [
      { document_id: "11111111-1111-4111-8111-111111111111", page: 1, quote: "finite steps" },
    ],
  };
  expect(generationSchema(0).safeParse(candidate).success).toBe(true);
  for (let index = 1; index < 5; index++)
    expect(generationSchema(index).safeParse(candidate).success).toBe(false);
  expect(generationSchema(5).safeParse(candidate).success).toBe(true);
});
it("rejects generated self-matching pairs even with a valid source citation", () => {
  const document_id = "11111111-1111-4111-8111-111111111111";
  expect(() =>
    toActivity(
      {
        kind: "matching",
        title: "Kavramlar",
        instruction: "Eşleştir",
        explanation: "Sonlu adımlar",
        difficulty: 1,
        statement: "",
        correct_boolean: false,
        items: [
          { id: "a", label: "Girdi", match: "Girdi", category: "" },
          { id: "b", label: "Çıktı", match: "Sonuç", category: "" },
        ],
        categories: [],
        blanks: [],
        sources: [{ document_id, page: 1, quote: "finite steps" }],
      },
      [{ document_id, page: 1, text: "finite steps" }],
    ),
  ).toThrow("iki yüzü aynı");
});

it("keeps generated accepted answers out of student-visible blank labels", () => {
  const document_id = "11111111-1111-4111-8111-111111111111";
  const activity = toActivity(
    {
      kind: "fill_blank",
      title: "Algoritma",
      instruction: "Tamamla",
      explanation: "Girdi işlenir.",
      difficulty: 1,
      statement: "İşlenecek veriye {{a}} denir.",
      correct_boolean: false,
      items: [],
      categories: [],
      blanks: [{ id: "a", label: "girdi", accepted: ["girdi"] }],
      sources: [{ document_id, page: 1, quote: "Input is data" }],
    },
    [{ document_id, page: 1, text: "Input is data" }],
  );
  expect(activity.content).toMatchObject({ blanks: [{ id: "a", label: "1. boşluk" }] });
  expect(activity.answer_key).toMatchObject({ accepted: { a: ["girdi"] } });
});
