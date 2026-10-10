import { z } from "zod";
import type { ActivityInput } from "./schema";

const normalize = (text: string) =>
  text.trim().normalize("NFKC").toLocaleLowerCase("tr-TR").replace(/\s+/g, " ");
export interface Grade {
  correct: boolean;
  score: number;
  wrongIds: string[];
}
export function gradeActivity(a: ActivityInput, answer: unknown): Grade {
  let total = 1,
    count = 0;
  const wrongIds: string[] = [];
  if (a.kind === "true_false") {
    const value = z.boolean().parse(answer);
    count = value === a.answer_key.value ? 1 : 0;
  } else if (a.kind === "matching" || a.kind === "categorize" || a.kind === "fill_blank") {
    const values = z.record(z.string().max(80), z.string().max(5000)).parse(answer);
    const keys =
      a.kind === "matching"
        ? a.answer_key.pairs
        : a.kind === "categorize"
          ? a.answer_key.categories
          : a.answer_key.accepted;
    total = Object.keys(keys).length;
    // Extra keys cannot turn a partial or malformed answer into a complete correct answer.
    if (Object.keys(values).some((key) => !(key in keys)))
      return { correct: false, score: 0, wrongIds: Object.keys(values) };
    for (const [id, expected] of Object.entries(keys)) {
      const ok = Array.isArray(expected)
        ? expected.some((s) => normalize(s) === normalize(values[id] || ""))
        : values[id] === expected;
      if (ok) count++;
      else wrongIds.push(id);
    }
  } else if (a.kind === "ordering") {
    const values = z.array(z.string().max(80)).max(12).parse(answer);
    total = a.answer_key.order.length;
    if (values.length !== total || new Set(values).size !== total)
      return { correct: false, score: 0, wrongIds: values };
    a.answer_key.order.forEach((id, i) => {
      if (values[i] === id) count++;
      else wrongIds.push(id);
    });
  } else {
    const values = z
      .record(
        z.string().max(80),
        z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }),
      )
      .parse(answer);
    total = Object.keys(a.answer_key.regions).length;
    if (Object.keys(values).some((id) => !(id in a.answer_key.regions)))
      return { correct: false, score: 0, wrongIds: Object.keys(values) };
    for (const [id, r] of Object.entries(a.answer_key.regions)) {
      const p = values[id];
      if (p && p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height) count++;
      else wrongIds.push(id);
    }
  }
  return { correct: count === total, score: count / total, wrongIds };
}

export function answerSummary(a: ActivityInput): string {
  if (a.kind === "true_false") return a.answer_key.value ? "Doğru" : "Yanlış";
  if (a.kind === "ordering")
    return a.answer_key.order
      .map((id) => a.content.items.find((i) => i.id === id)?.label)
      .join(" → ");
  if (a.kind === "matching")
    return a.content.left
      .map(
        (i) =>
          `${i.label}: ${a.content.right.find((r) => r.id === a.answer_key.pairs[i.id])?.label}`,
      )
      .join(" · ");
  if (a.kind === "fill_blank")
    return a.content.blanks
      .map((i) => `${i.label}: ${a.answer_key.accepted[i.id].join(" / ")}`)
      .join(" · ");
  if (a.kind === "categorize")
    return a.content.items
      .map(
        (i) =>
          `${i.label}: ${a.content.categories.find((c) => c.id === a.answer_key.categories[i.id])?.label}`,
      )
      .join(" · ");
  return "İşaretlenen hedef bölgeleri incele.";
}
