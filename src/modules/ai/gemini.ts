import { z } from "zod";
import { AppError } from "@/lib/errors";
import { maxOutputTokens } from "./budget";
import type { Generate } from "./provider";

export function geminiThinkingLevel() {
  const level = process.env.AI_GEMINI_THINKING_LEVEL || "medium";
  if (!["minimal", "low", "medium", "high"].includes(level))
    throw new AppError(
      503,
      "Gemini düşünme düzeyi minimal, low, medium veya high olmalı.",
      "AI_PROVIDER_ERROR",
    );
  return level;
}

// Gemini accepts a subset of JSON Schema. Zod still validates the full contract on return.
export function geminiSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(geminiSchema);
  if (!value || typeof value !== "object") return value;
  const schema = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(schema)) {
    if (
      [
        "$schema",
        "pattern",
        "format",
        "minLength",
        "maxLength",
        "minimum",
        "maximum",
        "minItems",
        "maxItems",
      ].includes(key)
    )
      continue;
    if (key === "properties" && item && typeof item === "object")
      result[key] = Object.fromEntries(
        Object.entries(item).map(([name, child]) => [name, geminiSchema(child)]),
      );
    else result[key] = geminiSchema(item);
  }
  const bounds = ["format", "minimum", "maximum", "minItems", "maxItems", "minLength", "maxLength"]
    .filter((key) => key in schema)
    .map((key) => key + ": " + schema[key]);
  if (bounds.length)
    result.description = [result.description, ...bounds].filter(Boolean).join(". ");
  return result;
}

// Stateless Interactions requests: no conversation persistence or tool execution.
export const generateGemini: Generate = async (name, schema, instructions, input, observe) => {
  const model = process.env.AI_MODEL!;
  const jsonSchema = geminiSchema(z.toJSONSchema(schema));
  const body = JSON.stringify({
    model,
    store: false,
    system_instruction: instructions,
    input: JSON.stringify({ task: name, data: input }),
    generation_config: {
      max_output_tokens: maxOutputTokens,
      thinking_level: geminiThinkingLevel(),
    },
    response_format: { type: "text", mime_type: "application/json", schema: jsonSchema },
  });
  if (Buffer.byteLength(body, "utf8") > 500_000)
    throw new AppError(413, "Kaynak bağlamı çok büyük. Daha az belge seç.");
  let response: Response;
  try {
    response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.AI_API_KEY! },
      body,
      signal: AbortSignal.timeout(150_000),
    });
  } catch {
    throw new AppError(
      503,
      "Gemini bağlantısı zamanında tamamlanamadı. İşlem kuyruğundan yeniden deneyebilirsin.",
      "AI_UNAVAILABLE",
    );
  }
  if (!response.ok) {
    console.warn(
      JSON.stringify({
        event: "gemini_request_failed",
        status: response.status,
        model,
        task: name,
      }),
    );
    // Never return provider payloads: they may contain request or account details.
    if (response.status === 429)
      throw new AppError(
        429,
        "Gemini proje kotasına ulaşıldı. AI Studio kullanım sınırını kontrol edip daha sonra yeniden dene.",
        "AI_RATE_LIMITED",
      );
    if (response.status >= 500)
      throw new AppError(
        503,
        "Gemini geçici olarak yanıt veremiyor. Kuyruk kısa bir beklemenin ardından yeniden deneyecek.",
        "AI_UNAVAILABLE",
      );
    if (response.status === 401 || response.status === 403)
      throw new AppError(
        503,
        "Gemini anahtarının model erişimini ve proje yetkisini kontrol et.",
        "AI_AUTH_FAILED",
      );
    throw new AppError(
      503,
      "Gemini isteği tamamlayamadı. Model ve üretim ayarlarını kontrol et.",
      "AI_PROVIDER_ERROR",
    );
  }
  const payload = (await response.json()) as {
    status?: string;
    model?: string;
    output_text?: string;
    steps?: { type: string; content?: { type: string; text?: string }[] }[];
    usage?: {
      total_input_tokens?: number;
      total_output_tokens?: number;
      total_thought_tokens?: number;
    };
  };
  const usage = {
    input_tokens: payload.usage?.total_input_tokens || 0,
    output_tokens:
      (payload.usage?.total_output_tokens || 0) + (payload.usage?.total_thought_tokens || 0),
  };
  if (observe && payload.usage) await observe(usage, payload.model || model);
  if (payload.status !== "completed")
    throw new AppError(
      422,
      "Gemini yanıtı tamamlanmadı. Daha dar bir kapsamla yeniden dene.",
      "AI_INCOMPLETE",
    );
  const last = payload.steps?.filter((step) => step.type === "model_output").at(-1);
  const text =
    payload.output_text ??
    last?.content
      ?.filter((part) => part.type === "text")
      .map((part) => part.text || "")
      .join("") ??
    "";
  try {
    return { data: schema.parse(JSON.parse(text)), model: payload.model || model, ...usage };
  } catch {
    throw new AppError(
      422,
      "Gemini çıktısı beklenen soru biçimine uymuyor. İnceleme gerekli.",
      "AI_INVALID_OUTPUT",
    );
  }
};
