import { z } from "zod";
import { generateGemini } from "./gemini";
import { AppError } from "@/lib/errors";
import { budgetConfig, maxOutputTokens } from "./budget";
export function aiConfigured() {
  if (!process.env.AI_API_KEY || !process.env.AI_MODEL) return false;
  try {
    budgetConfig();
    return true;
  } catch {
    return false;
  }
}
export function ensureAI() {
  if (!process.env.AI_API_KEY || !process.env.AI_MODEL)
    throw new AppError(
      503,
      "AI bağlantısı henüz yapılandırılmadı. Belgeleri inceleyip etkinlikleri elle hazırlayabilirsin.",
      "AI_NOT_CONFIGURED",
    );
  budgetConfig();
}
export interface Usage {
  input_tokens: number;
  output_tokens: number;
}
export interface GenerationResult<T> {
  data: T;
  model: string;
  input_tokens: number;
  output_tokens: number;
}
export type Generate = <T>(
  name: string,
  schema: z.ZodType<T>,
  instructions: string,
  input: unknown,
  observe?: (usage: Usage, model: string) => Promise<void>,
) => Promise<GenerationResult<T>>;
export const generate: Generate = async <T>(
  name: string,
  schema: z.ZodType<T>,
  instructions: string,
  input: unknown,
  observe?: (usage: Usage, model: string) => Promise<void>,
) => {
  ensureAI();
  if (process.env.AI_PROVIDER === "gemini")
    return generateGemini(name, schema, instructions, input, observe);
  const base = process.env.AI_BASE_URL || "https://api.openai.com/v1";
  if (!base.startsWith("https://")) throw new AppError(503, "AI bağlantısı HTTPS kullanmalı.");
  const jsonSchema = z.toJSONSchema(schema);
  delete jsonSchema.$schema;
  const response = await fetch(`${base.replace(/\/$/, "")}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.AI_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.AI_MODEL,
      store: false,
      max_output_tokens: maxOutputTokens,
      instructions,
      input: [{ role: "user", content: [{ type: "input_text", text: JSON.stringify(input) }] }],
      text: { format: { type: "json_schema", name, strict: true, schema: jsonSchema } },
    }),
    signal: AbortSignal.timeout(150000),
  });
  if (!response.ok)
    throw new AppError(
      503,
      response.status === 429
        ? "AI servisinin kullanım sınırına ulaşıldı. Daha sonra tekrar dene."
        : "AI servisi isteği tamamlayamadı.",
    );
  const payload = (await response.json()) as {
    status?: string;
    model?: string;
    usage?: { input_tokens: number; output_tokens: number };
    output?: { type: string; content?: { type: string; text?: string }[] }[];
  };
  if (payload.usage && observe)
    await observe(payload.usage, payload.model || process.env.AI_MODEL!);
  if (payload.status !== "completed")
    throw new AppError(422, "AI yanıtı tamamlanmadı. Kapsamı daraltıp yeniden dene.");
  const messages =
    payload.output?.filter((o) => o.type === "message").flatMap((o) => o.content || []) || [];
  if (messages.some((c) => c.type === "refusal"))
    throw new AppError(422, "AI bu içerik için üretim yapamadı. İçeriği elle hazırlayabilirsin.");
  const text = messages
    .filter((c) => c.type === "output_text")
    .map((c) => c.text || "")
    .join("");
  let data: T;
  try {
    data = schema.parse(JSON.parse(text));
  } catch {
    throw new AppError(422, "AI çıktısı veri sözleşmesine uymuyor. İnceleme gerekli.");
  }
  return {
    data,
    model: payload.model || process.env.AI_MODEL!,
    input_tokens: payload.usage?.input_tokens || 0,
    output_tokens: payload.usage?.output_tokens || 0,
  };
};
