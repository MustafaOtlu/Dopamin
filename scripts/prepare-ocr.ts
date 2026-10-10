import { createOcrWorker } from "../src/modules/documents/ocr";
const worker = await createOcrWorker();
await worker.terminate();
console.log("Türkçe ve İngilizce OCR dil dosyaları hazır.");
