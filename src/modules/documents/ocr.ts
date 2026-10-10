import { mkdir } from "node:fs/promises";
import path from "node:path";
import { createWorker, OEM, type Worker } from "tesseract.js";
import { AppError } from "@/lib/errors";
export const maxOcrPages = 20;
export async function createOcrWorker(): Promise<Worker> {
  // Runtime model cache is provisioned by ocr:prepare, outside the server bundle.
  const cachePath = path.resolve(
    /* turbopackIgnore: true */ process.env.OCR_CACHE_PATH || ".data/ocr",
  );
  await mkdir(cachePath, { recursive: true });
  try {
    return await createWorker(["tur", "eng"], OEM.LSTM_ONLY, {
      cachePath,
      errorHandler: () => {
        /* Worker errors reject the active job. */
      },
    });
  } catch {
    throw new AppError(
      503,
      "OCR dil dosyaları yüklenemedi. OCR ön hazırlığını tamamlayıp yeniden dene.",
      "OCR_NOT_READY",
    );
  }
}
export async function recognizePage(worker: Worker, image: Buffer) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      worker.recognize(image),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new AppError(
                422,
                "OCR sayfası zaman sınırını aştı. Daha küçük bir belgeyle yeniden dene.",
              ),
            ),
          30000,
        );
      }),
    ]);
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError(422, "OCR sayfası okunamadı. Belge kalitesini kontrol edip yeniden dene.");
  } finally {
    if (timer) clearTimeout(timer);
  }
}
