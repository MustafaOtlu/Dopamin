import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import { gunzipSync, inflateSync, brotliDecompressSync } from "node:zlib";
import { loadBuffer } from "cheerio";
import ipaddr from "ipaddr.js";
import { AppError, assert } from "@/lib/errors";

const MAX_BYTES = 2 * 1024 * 1024;
export const WEB_TIMEOUT_MS = 20000;
export function canonicalWebUrl(input: string) {
  assert(
    input.length <= 2000 &&
      !Array.from(input).some(
        (char) => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127 || char === "\\",
      ),
    "Geçerli bir HTTPS kaynak adresi gir.",
  );
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new AppError(400, "Geçerli bir HTTPS kaynak adresi gir.");
  }
  assert(
    url.protocol === "https:" &&
      (!url.port || url.port === "443") &&
      !url.username &&
      !url.password,
    "Kaynak adresi kimlik bilgisi içermeyen, standart HTTPS adresi olmalı.",
  );
  const host = url.hostname.toLowerCase();
  assert(
    !isIP(host.replace(/^\[|\]$/g, "")) &&
      host.includes(".") &&
      !host.endsWith(".") &&
      !/(^|\.)(localhost|local|internal|invalid|test|example|onion)$/.test(host),
    "Yalnız herkese açık alan adları kaynak olarak eklenebilir.",
  );
  url.hash = "";
  return url.href;
}
export function isPublicAddress(address: string) {
  try {
    return ipaddr.process(address).range() === "unicast";
  } catch {
    return false;
  }
}
export interface WebPage {
  title: string;
  chunks: { page: number; chunk_index: number; text: string; heading: string | null }[];
  text: string;
}
export function extractWebText(bytes: Buffer, transportEncoding?: string): WebPage {
  assert(bytes.length <= MAX_BYTES, "Web kaynağı en fazla 2 MB olabilir.", 413);
  const $ = loadBuffer(bytes, {
    encoding: { transportLayerEncodingLabel: transportEncoding, defaultEncoding: "utf-8" },
  });
  const title = $("title").first().text().replace(/\s+/g, " ").trim().slice(0, 200);
  $(
    "script,style,noscript,template,iframe,object,embed,svg,canvas,nav,footer,header,form,aside,[hidden],[aria-hidden='true']",
  ).remove();
  const root = $("main").first().length
    ? $("main").first()
    : $("article").first().length
      ? $("article").first()
      : $("body");
  root.find("br").replaceWith("\n");
  // Preserve block and table-cell boundaries without running scripts or loading subresources.
  root
    .find("h1,h2,h3,h4,h5,h6,p,li,div,section,article,pre,tr,td,th,dt,dd,blockquote")
    .each((_, el) => {
      $(el).prepend("\n").append("\n");
    });
  const text = root
    .text()
    .replace(/\r/g, "")
    .split("\n")
    .map((s) => s.replace(/[\t \u00a0]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
  assert(
    text.length >= 100,
    "Bu sayfadan yeterli metin çıkarılamadı. Giriş gerektirmeyen bir makale veya ders sayfası seç.",
    422,
  );
  assert(
    text.length <= 500000,
    "Web kaynağının metni çok uzun. Daha dar kapsamlı bir sayfa seç.",
    413,
  );
  const chunks: WebPage["chunks"] = [];
  for (let offset = 0; offset < text.length; offset += 1800) {
    const index = chunks.length;
    chunks.push({
      page: index + 1,
      chunk_index: index,
      text: text.slice(offset, offset + 1800),
      heading: `${title || "Web kaynağı"} · Bölüm ${index + 1}`,
    });
  }
  return { title, chunks, text };
}

// Used only after a stored course permission is checked by the worker. No cookies,
// ambient proxy, JS execution, child-resource loading, or automatic redirects.
export async function fetchWebPage(
  input: string,
  resolve: typeof lookup = lookup,
): Promise<WebPage> {
  const url = new URL(canonicalWebUrl(input));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEB_TIMEOUT_MS);
  try {
    const addresses = await Promise.race([
      resolve(url.hostname, { all: true, verbatim: true }),
      new Promise<never>((_, reject) =>
        controller.signal.addEventListener(
          "abort",
          () => reject(new AppError(504, "Web kaynağı zamanında yanıt vermedi.")),
          { once: true },
        ),
      ),
    ]);
    assert(
      addresses.length > 0 && addresses.every((a) => isPublicAddress(a.address)),
      "Bu adresin ağ hedefi izinli değil.",
      403,
    );
    controller.signal.throwIfAborted();
    const pinned = addresses.find((a) => a.family === 4) || addresses[0];
    let transportEncoding: string | undefined;
    const bytes = await new Promise<Buffer>((resolveBody, reject) => {
      const req = request(
        url,
        {
          method: "GET",
          agent: false,
          signal: controller.signal,
          servername: url.hostname,
          maxHeaderSize: 16384,
          lookup: (_hostname, options, callback) => {
            if (options.all) callback(null, [pinned]);
            else callback(null, pinned.address, pinned.family);
          },
          headers: {
            accept: "text/html",
            "accept-encoding": "gzip, br, deflate",
            "user-agent": "PusulaSourceReader/1.0",
          },
        },
        (res) => {
          const fail = (error: Error) => {
            res.destroy();
            reject(error);
          };
          if ((res.statusCode || 0) >= 300 && (res.statusCode || 0) < 400)
            return fail(
              new AppError(
                422,
                "Adres başka bir sayfaya yönlendiriyor. Tarayıcıdaki son HTTPS adresini ayrıca ekle.",
              ),
            );
          if (res.statusCode !== 200)
            return fail(
              new AppError(
                res.statusCode === 429 || (res.statusCode || 0) >= 500 ? 503 : 422,
                "Web kaynağı okunamadı. Sayfanın herkese açık olduğunu kontrol et.",
              ),
            );
          if (!/^text\/html(?:;|$)/i.test(res.headers["content-type"] || ""))
            return fail(
              new AppError(
                415,
                "Bu kaynak bir HTML sayfası değil. PDF dosyalarını PDF yükle ile ekle.",
              ),
            );
          transportEncoding = /(?:^|;)\s*charset\s*=\s*["']?([^;"'\s]+)/i.exec(
            res.headers["content-type"] || "",
          )?.[1];
          if (Number(res.headers["content-length"]) > MAX_BYTES)
            return fail(new AppError(413, "Web kaynağı en fazla 2 MB olabilir."));
          const parts: Buffer[] = [];
          let size = 0;
          res.on("data", (chunk: Buffer) => {
            size += chunk.length;
            if (size > MAX_BYTES) fail(new AppError(413, "Web kaynağı en fazla 2 MB olabilir."));
            else parts.push(chunk);
          });
          res.on("error", reject);
          res.on("end", () => {
            try {
              let body = Buffer.concat(parts);
              const encoding = res.headers["content-encoding"]?.toLowerCase();
              const options = { maxOutputLength: MAX_BYTES };
              if (encoding === "gzip") body = gunzipSync(body, options);
              else if (encoding === "br") body = brotliDecompressSync(body, options);
              else if (encoding === "deflate") body = inflateSync(body, options);
              else
                assert(
                  !encoding || encoding === "identity",
                  "Web kaynağının sıkıştırma biçimi desteklenmiyor.",
                  415,
                );
              resolveBody(body);
            } catch {
              reject(
                new AppError(413, "Web kaynağının içeriği okunamadı veya boyut sınırını aşıyor."),
              );
            }
          });
        },
      );
      req.on("error", () =>
        reject(
          new AppError(
            503,
            "Web kaynağına güvenli bağlantı kurulamadı. Adresi kontrol edip yeniden dene.",
          ),
        ),
      );
      req.end();
    });
    return extractWebText(bytes, transportEncoding);
  } finally {
    clearTimeout(timeout);
  }
}
