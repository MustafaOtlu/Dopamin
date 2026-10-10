import { describe, it, expect } from "vitest";
import { gradeActivity } from "./grader";
import { validateActivity, publicActivity, type StoredActivity } from "./schema";
const common = {
  title: "Örnek",
  instruction: "Yanıtla",
  explanation: "Açıklama",
  difficulty: 1,
  source_refs: [],
};
describe("ders bağımsız etkinlik sözleşmesi", () => {
  it("boolean dışında doğru/yanlış cevabını reddeder", () => {
    const a = validateActivity({
      ...common,
      kind: "true_false",
      content: { statement: "Önerme" },
      answer_key: { value: false },
    });
    expect(gradeActivity(a, false).correct).toBe(true);
    expect(gradeActivity(a, true).correct).toBe(false);
    expect(() => gradeActivity(a, "false")).toThrow();
  });
  it("eşleştirmede eksik, fazla ve yinelenen öğeleri doğru saymaz", () => {
    const a = validateActivity({
      ...common,
      kind: "matching",
      content: {
        left: [
          { id: "a", label: "A" },
          { id: "b", label: "B" },
        ],
        right: [
          { id: "x", label: "X" },
          { id: "y", label: "Y" },
        ],
      },
      answer_key: { pairs: { a: "x", b: "y" } },
    });
    expect(gradeActivity(a, { a: "x", b: "y" }).correct).toBe(true);
    expect(gradeActivity(a, { a: "x" }).score).toBe(0.5);
    expect(gradeActivity(a, { a: "x", b: "x" }).correct).toBe(false);
    expect(gradeActivity(a, { a: "x", b: "y", z: "extra" }).correct).toBe(false);
  });
  it("sıralamada doğru permütasyon gerekir", () => {
    const a = validateActivity({
      ...common,
      kind: "ordering",
      content: {
        items: [
          { id: "a", label: "A" },
          { id: "b", label: "B" },
        ],
      },
      answer_key: { order: ["a", "b"] },
    });
    expect(gradeActivity(a, ["a", "b"]).correct).toBe(true);
    expect(gradeActivity(a, ["b", "a"]).correct).toBe(false);
    expect(gradeActivity(a, ["a", "a"]).score).toBe(0);
    expect(() => validateActivity({ ...a, answer_key: { order: ["a", "a"] } })).toThrow();
  });
  it("boşluk cevapları Türkçe ve Unicode ile normalize edilir", () => {
    const a = validateActivity({
      ...common,
      kind: "fill_blank",
      content: { text: "{{b1}}", blanks: [{ id: "b1", label: "Kavram" }] },
      answer_key: { accepted: { b1: ["İşlem sırası"] } },
    });
    expect(gradeActivity(a, { b1: "  İŞLEM   SIRASI " }).correct).toBe(true);
    expect(gradeActivity(a, {}).correct).toBe(false);
  });
  it("kategori ve görsel bölge sınırlarını denetler", () => {
    const a = validateActivity({
      ...common,
      kind: "categorize",
      content: {
        items: [
          { id: "a", label: "A" },
          { id: "b", label: "B" },
        ],
        categories: [
          { id: "x", label: "X" },
          { id: "y", label: "Y" },
        ],
      },
      answer_key: { categories: { a: "x", b: "y" } },
    });
    expect(gradeActivity(a, { a: "x", b: "y" }).correct).toBe(true);
    const r = validateActivity({
      ...common,
      kind: "region",
      content: {
        image_url: "/api/files/00000000-0000-0000-0000-000000000000",
        alt: "Şema",
        regions: [{ id: "r1", label: "Hedef" }],
      },
      answer_key: { regions: { r1: { x: 0.2, y: 0.2, width: 0.3, height: 0.3 } } },
    });
    expect(gradeActivity(r, { r1: { x: 0.3, y: 0.3 } }).correct).toBe(true);
    expect(gradeActivity(r, { r1: { x: 0.6, y: 0.3 } }).correct).toBe(false);
  });
  it("öğrenci payload'ında anahtar ve açıklama yoktur", () => {
    const a = validateActivity({
      ...common,
      kind: "true_false",
      content: { statement: "Önerme" },
      answer_key: { value: true },
    });
    const view = publicActivity({
      ...a,
      id: "1",
      activity_id: "1",
      course_id: "1",
      objective_id: "1",
      version: 1,
      published_at: null,
    } as StoredActivity);
    expect(view).not.toHaveProperty("answer_key");
    expect(view).not.toHaveProperty("explanation");
  });
});
