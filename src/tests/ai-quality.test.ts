import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { generationSchema, toActivity, type SourceChunk } from "@/modules/ai/contracts";
import { generateValidatedActivity } from "@/modules/ai/generation";
import { selectSourceContext } from "@/modules/ai/sources";
import type { Generate } from "@/modules/ai/provider";

const documentId = "10000000-0000-4000-8000-000000000001";
const quote = "Algoritma, sonlu ve sıralı adımlardan oluşur.";
const chunks: SourceChunk[] = [{ document_id: documentId, page: 80, text: quote }];
const common = {
  title: "Algoritmanın sonluluğu",
  instruction: "Önermeyi değerlendir.",
  explanation: "Kaynak algoritmanın sonlu adımlardan oluştuğunu belirtir.",
  difficulty: 1,
  sources: [{ document_id: documentId, page: 80, quote }],
};
const valid = {
  ...common,
  kind: "true_false",
  statement: "Algoritmanın adımları sonludur.",
  correct_boolean: true,
};
const outputs = [
  valid,
  {
    ...common,
    kind: "matching",
    items: [
      { id: "a", label: "Algoritma", match: "Sonlu adımlar bütünü" },
      { id: "b", label: "Döngü", match: "Tekrar işlemi" },
    ],
  },
  {
    ...common,
    kind: "ordering",
    items: [
      { id: "a", label: "Başla" },
      { id: "b", label: "Bitir" },
    ],
  },
  {
    ...common,
    kind: "fill_blank",
    statement: "Algoritmalar {{a}} adımlardan oluşur.",
    blanks: [{ id: "a", accepted: ["sonlu"] }],
  },
  {
    ...common,
    kind: "categorize",
    items: [
      { id: "a", label: "Oku", category: "input" },
      { id: "b", label: "Yaz", category: "output" },
    ],
    categories: [
      { id: "input", label: "Girdi" },
      { id: "output", label: "Çıktı" },
    ],
  },
];

describe("kaynak seçimi", () => {
  it("ilk 30 parçanın ötesindeki ilgili kazanımı ve komşu bağlamı bulur", () => {
    const all = Array.from({ length: 100 }, (_, i) => ({
      document_id: documentId,
      page: i + 1,
      text: `Dersin genel giriş bilgisi ${i}`,
      heading: i === 79 ? "Algoritmalar" : "Giriş",
    }));
    all[79].text = quote;
    const context = selectSourceContext(all, {
      title: "Algoritmayı açıklayabilme",
      topic_title: "Algoritmalar",
    });
    expect(context.sources.map((chunk) => chunk.page)).toEqual(
      expect.arrayContaining([79, 80, 81]),
    );
    expect(context.sources.length).toBeLessThanOrEqual(18);
    expect(context.coverage.partial).toBe(true);
    expect(context.sources.find((chunk) => chunk.page === 80)?.text).toBe(quote);
  });
  it("müfredat analizinde seçilen her belgeden ve son sayfalardan örnek alır", () => {
    const all = Array.from({ length: 3 }, (_, doc) =>
      Array.from({ length: 100 }, (_, i) => ({
        document_id: `document-${doc}`,
        page: i + 1,
        text: `Sayfa ${i}`,
      })),
    ).flat();
    const { sources } = selectSourceContext(all);
    expect(sources).toHaveLength(30);
    expect(new Set(sources.map((chunk) => chunk.document_id)).size).toBe(3);
    // Each document's sample should span its extent, even with more documents than one.
    expect(sources.some((chunk) => chunk.page > 80)).toBe(true);
  });
  it("metin bütçesini aşmaz ve kısa kaynakları kaybetmez", () => {
    const all = Array.from({ length: 40 }, (_, i) => ({
      document_id: documentId,
      page: i + 1,
      text: "a".repeat(4000),
    }));
    const { sources } = selectSourceContext(all);
    expect(sources.reduce((sum, chunk) => sum + chunk.text.length, 0)).toBeLessThanOrEqual(60_000);
    expect(selectSourceContext(chunks).sources).toEqual(chunks);
    expect(selectSourceContext([]).sources).toEqual([]);
  });
});

describe("üretim kalitesi kontrolleri", () => {
  it.each(outputs.map((output, index) => ({ output, index })))(
    "$output.kind için yalnız gereken alanları ister",
    ({ output, index }) => {
      const schema = generationSchema(index);
      const parsed = schema.parse(output);
      expect(toActivity(parsed, chunks).kind).toBe(output.kind);
      const json = z.toJSONSchema(schema);
      if (index !== 0) expect(json.properties).not.toHaveProperty("correct_boolean");
      if (index !== 3) expect(json.properties).not.toHaveProperty("blanks");
    },
  );
  it("eksik cevabı varsayılan yanlış cevaba dönüştürmez", () => {
    const { correct_boolean: _unused, ...missing } = valid;
    expect(() => toActivity(missing, chunks)).toThrow();
  });
  it("belirsiz eşleştirmeyi ve sahipsiz boşluğu reddeder", () => {
    expect(() =>
      toActivity(
        {
          ...outputs[1],
          items: [
            { id: "a", label: "Bir", match: "Aynı tanım" },
            { id: "b", label: "İki", match: "aynı tanım" },
          ],
        },
        chunks,
      ),
    ).toThrow("birden fazla");
    expect(() =>
      toActivity(
        { ...outputs[3], statement: "Algoritma {{a}} ve {{bilinmeyen}} adımlardan oluşur." },
        chunks,
      ),
    ).toThrow("birebir");
  });
  it("bozuk alıntıyı bir düzeltme çağrısıyla toparlar", async () => {
    const inputs: unknown[] = [];
    const provider: Generate = async (_name, _schema, _instructions, input) => {
      inputs.push(input);
      return {
        data: (inputs.length === 1
          ? {
              ...valid,
              sources: [{ document_id: documentId, page: 80, quote: "Uydurulmuş bir alıntı" }],
            }
          : valid) as never,
        model: "test",
        input_tokens: 1,
        output_tokens: 1,
      };
    };
    expect((await generateValidatedActivity(provider, 0, {}, chunks, [])).kind).toBe("true_false");
    expect(inputs).toHaveLength(2);
    expect(inputs[1]).toMatchObject({ repair_feedback: expect.stringContaining("alıntısı") });
  });
  it("başlığı değiştirilmiş aynı soruyu reddeder ve en fazla iki çağrı yapar", async () => {
    let calls = 0;
    const provider: Generate = async () => {
      calls++;
      return {
        data: { ...valid, title: "Farklı başlık" } as never,
        model: "test",
        input_tokens: 1,
        output_tokens: 1,
      };
    };
    await expect(
      generateValidatedActivity(provider, 0, {}, chunks, [toActivity(valid, chunks)]),
    ).rejects.toMatchObject({ code: "AI_INVALID_OUTPUT" });
    expect(calls).toBe(2);
  });
  it.each(["AI_RATE_LIMITED", "AI_AUTH_FAILED", "AI_UNAVAILABLE", "AI_DAILY_BUDGET_EXCEEDED"])(
    "%s için iç içe yeniden deneme yapmaz",
    async (code) => {
      let calls = 0;
      const provider: Generate = async () => {
        calls++;
        throw new AppError(503, "Hata", code);
      };
      await expect(generateValidatedActivity(provider, 0, {}, chunks, [])).rejects.toMatchObject({
        code,
      });
      expect(calls).toBe(1);
    },
  );
});
