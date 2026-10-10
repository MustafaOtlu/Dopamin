import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import type { ClientRequest, IncomingMessage, RequestOptions } from "node:http";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { gzipSync } from "node:zlib";
import {
  canonicalWebUrl,
  extractWebText,
  fetchWebPage,
  isPublicAddress,
  WEB_TIMEOUT_MS,
} from "@/modules/documents/web-reader";

vi.mock("node:https", () => ({ request: vi.fn() }));
const sentence = "Algoritma, bir problemi çözmek için belirli ve sonlu adımlardan oluşur. ";
const html = Buffer.from(
  `<title>Algoritmalar &amp; veri</title><main><h1>Algoritma</h1><p>${sentence.repeat(3)}</p></main>`,
);
const publicDns = vi.fn(async () => [
  { address: "93.184.215.14", family: 4 },
]) as unknown as typeof lookup;
let sent: { url: URL; options: RequestOptions }[];
function respond(
  body = html,
  status = 200,
  headers: Record<string, string> = { "content-type": "text/html; charset=utf-8" },
) {
  vi.mocked(request).mockImplementation(((
    url: URL,
    options: RequestOptions,
    callback: (res: IncomingMessage) => void,
  ) => {
    sent.push({ url, options });
    const req = new EventEmitter() as ClientRequest;
    req.end = (() => {
      queueMicrotask(() => {
        const response = Object.assign(new PassThrough(), { statusCode: status, headers });
        callback(response as unknown as IncomingMessage);
        response.end(body);
      });
      return req;
    }) as ClientRequest["end"];
    return req;
  }) as typeof request);
}
beforeEach(() => {
  vi.clearAllMocks();
  sent = [];
  respond();
});
afterEach(() => vi.useRealTimers());

describe("İzinli web kaynağının ağ sınırı", () => {
  it("yalnız standart HTTPS alan adını kabul eder; farklı IP yazımlarını ve kimlik bilgisini engeller", () => {
    for (const url of [
      "http://example.com/a",
      "https://user:pass@example.com",
      "https://example.com:8443",
      "https://127.0.0.1",
      "https://2130706433",
      "https://0x7f000001",
      "https://[::1]",
      "https://localhost",
      "https://app.internal",
      "https://app.local",
      "https://example.com.",
      "https://example.com/a\nb",
      "https://example.com\\@127.0.0.1",
    ]) {
      expect(() => canonicalWebUrl(url), url).toThrow();
    }
    expect(canonicalWebUrl("https://EXAMPLE.com:443/lesson?q=1#part")).toBe(
      "https://example.com/lesson?q=1",
    );
  });
  it("özel, geçiş, belge ve ayrılmış IP aralıklarını reddeder", () => {
    for (const address of [
      "127.0.0.1",
      "10.0.0.1",
      "172.16.1.1",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "192.0.2.1",
      "224.0.0.1",
      "255.255.255.255",
      "::1",
      "::",
      "fc00::1",
      "fe80::1",
      "2001:db8::1",
      "::ffff:127.0.0.1",
      "64:ff9b::7f00:1",
      "2002:7f00:1::",
      "not-ip",
    ])
      expect(isPublicAddress(address), address).toBe(false);
    expect(isPublicAddress("8.8.8.8")).toBe(true);
    expect(isPublicAddress("2606:4700:4700::1111")).toBe(true);
  });
  it("tek bir özel DNS yanıtı bile tüm isteği durdurur", async () => {
    const dns = vi.fn(async () => [
      { address: "8.8.8.8", family: 4 },
      { address: "10.1.2.3", family: 4 },
    ]) as unknown as typeof lookup;
    await expect(fetchWebPage("https://example.com/lesson", dns)).rejects.toMatchObject({
      status: 403,
    });
    expect(request).not.toHaveBeenCalled();
  });
  it("doğrulanmış IP'ye sabitlenir ve asıl alan adıyla TLS kullanır", async () => {
    const result = await fetchWebPage("https://example.com/lesson#x", publicDns);
    expect(result.text).toContain(sentence.trim());
    expect(sent).toHaveLength(1);
    expect(sent[0].url.href).toBe("https://example.com/lesson");
    const options = sent[0].options as RequestOptions & { servername: string };
    expect(options.servername).toBe("example.com");
    expect(options.agent).toBe(false);
    expect(options.headers).not.toHaveProperty("cookie");
    const pin = options.lookup!;
    const single = vi.fn(),
      all = vi.fn();
    pin("example.com", {}, single);
    pin("example.com", { all: true }, all);
    expect(single).toHaveBeenCalledWith(null, "93.184.215.14", 4);
    expect(all).toHaveBeenCalledWith(null, [{ address: "93.184.215.14", family: 4 }]);
    expect(publicDns).toHaveBeenCalledTimes(1);
  });
  it("yönlendirmeyi izlemez; yeni hedefe izin verilmesini ister", async () => {
    respond(Buffer.alloc(0), 302, { location: "https://private.internal" });
    await expect(fetchWebPage("https://example.com/lesson", publicDns)).rejects.toMatchObject({
      status: 422,
    });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("HTML dışı içerik, büyük gövde ve sıkıştırma bombasını durdurur", async () => {
    respond(Buffer.from("%PDF"), 200, { "content-type": "application/pdf" });
    await expect(fetchWebPage("https://example.com/lesson", publicDns)).rejects.toMatchObject({
      status: 415,
    });
    respond(Buffer.alloc(2 * 1024 * 1024 + 1));
    await expect(fetchWebPage("https://example.com/lesson", publicDns)).rejects.toMatchObject({
      status: 413,
    });
    respond(gzipSync(Buffer.alloc(3 * 1024 * 1024, 65)), 200, {
      "content-type": "text/html",
      "content-encoding": "gzip",
    });
    await expect(fetchWebPage("https://example.com/lesson", publicDns)).rejects.toMatchObject({
      status: 413,
    });
    respond(gzipSync(html), 200, { "content-type": "text/html", "content-encoding": "gzip" });
    expect((await fetchWebPage("https://example.com/lesson", publicDns)).title).toBe(
      "Algoritmalar & veri",
    );
  });
  it("DNS beklemesini de toplam süre sınırına alır", async () => {
    vi.useFakeTimers();
    const stalled = (() => new Promise(() => {})) as unknown as typeof lookup;
    const assertion = expect(
      fetchWebPage("https://example.com/lesson", stalled),
    ).rejects.toMatchObject({ status: 504 });
    await vi.advanceTimersByTimeAsync(WEB_TIMEOUT_MS);
    await assertion;
    expect(request).not.toHaveBeenCalled();
  });
});
describe("Güvenilmeyen HTML'den kayıtlı metin", () => {
  it("HTTP karakter kümesini HTML varsayımından önce kullanır", () => {
    const latin = Buffer.from(`<main>${"caf\u00e9 ".repeat(35)}</main>`, "latin1");
    expect(extractWebText(latin, "windows-1252").text).toContain("café");
    expect(
      extractWebText(
        Buffer.from(`<meta charset='utf-8'><main>${"Türkçe öğeler ".repeat(15)}</main>`),
      ).text,
    ).toContain("Türkçe öğeler");
  });
  it("script, gizli metin ve gezinmeyi çıkarır; tablo sınırları ve birebir bölüm alıntıları korunur", () => {
    const page = extractWebText(
      Buffer.from(
        `<title>Ders</title><nav>Gizli menü</nav><main><script>unsafe()</script><p hidden>Saklı</p><h1>Ders içeriği</h1><p>${sentence.repeat(35)}</p><table><tr><td>Girdi</td><td>Çıktı</td></tr></table><img src="https://127.0.0.1/private"></main>`,
      ),
    );
    expect(page.text).not.toMatch(/unsafe|Saklı|Gizli menü/);
    expect(page.text).toContain("Girdi\nÇıktı");
    expect(page.chunks.length).toBeGreaterThan(1);
    expect(page.chunks.map((c) => c.text).join("")).toBe(page.text);
    expect(page.chunks[1].page).toBe(2);
    expect(request).not.toHaveBeenCalled();
  });
  it("boş/giriş ekranı ve aşırı uzun metni kaynak saymaz", () => {
    expect(() => extractWebText(Buffer.from("<p>Giriş yap</p>"))).toThrow("yeterli metin");
    expect(() => extractWebText(Buffer.from(`<p>${"a".repeat(500001)}</p>`))).toThrow("çok uzun");
  });
});
