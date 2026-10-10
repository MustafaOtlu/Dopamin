import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "./errors";
import { randomUUID } from "node:crypto";

export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const allowed = process.env.APP_ORIGIN || "http://127.0.0.1:3000";
  if (!origin || origin !== allowed)
    throw new AppError(403, "İstek kaynağı doğrulanamadı.", "INVALID_ORIGIN");
}
export async function readJson(request: Request, limit = 256 * 1024) {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new AppError(415, "JSON içerik gerekiyor.");
  const reader = request.body?.getReader();
  if (!reader) throw new AppError(400, "İstek içeriği eksik.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new AppError(413, "İstek çok büyük.");
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new AppError(400, "İstek içeriği okunamadı.");
  }
}
export function apiError(error: unknown) {
  if (error instanceof AppError)
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  if (error instanceof z.ZodError)
    return NextResponse.json(
      {
        error: "Alanları kontrol et.",
        details: error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
      },
      { status: 400 },
    );
  const requestId = randomUUID();
  console.error(
    JSON.stringify({
      event: "api_error",
      request_id: requestId,
      message: error instanceof Error ? error.message : String(error),
    }),
  );
  return NextResponse.json(
    { error: "İşlem tamamlanamadı. Tekrar dene.", request_id: requestId },
    { status: 500 },
  );
}
export function json(value: unknown) {
  return NextResponse.json(value, { headers: { "Cache-Control": "no-store" } });
}
