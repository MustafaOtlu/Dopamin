import { z } from "zod";

const text = z.string().trim().min(1).max(5000);
const item = z.object({ id: z.string().min(1).max(80), label: text });
const base = {
  title: text,
  instruction: text,
  explanation: text,
  difficulty: z.number().int().min(1).max(3).default(1),
  source_refs: z
    .array(
      z.object({
        document_id: z.uuid(),
        page: z.number().int().positive(),
        quote: z.string().max(1000),
      }),
    )
    .max(20)
    .default([]),
};
export const activitySchema = z.discriminatedUnion("kind", [
  z.object({
    ...base,
    kind: z.literal("true_false"),
    content: z.object({ statement: text }),
    answer_key: z.object({ value: z.boolean() }),
  }),
  z.object({
    ...base,
    kind: z.literal("matching"),
    content: z.object({ left: z.array(item).min(2).max(12), right: z.array(item).min(2).max(12) }),
    answer_key: z.object({ pairs: z.record(z.string(), z.string()) }),
  }),
  z.object({
    ...base,
    kind: z.literal("ordering"),
    content: z.object({ items: z.array(item).min(2).max(12) }),
    answer_key: z.object({ order: z.array(z.string()).min(2).max(12) }),
  }),
  z.object({
    ...base,
    kind: z.literal("fill_blank"),
    content: z.object({
      text: text,
      blanks: z
        .array(z.object({ id: z.string(), label: text }))
        .min(1)
        .max(12),
    }),
    answer_key: z.object({ accepted: z.record(z.string(), z.array(text).min(1).max(10)) }),
  }),
  z.object({
    ...base,
    kind: z.literal("categorize"),
    content: z.object({
      items: z.array(item).min(2).max(20),
      categories: z.array(item).min(2).max(8),
    }),
    answer_key: z.object({ categories: z.record(z.string(), z.string()) }),
  }),
  z.object({
    ...base,
    kind: z.literal("region"),
    content: z.object({
      image_url: z
        .string()
        .max(2000)
        .refine(
          (url) => /^\/api\/files\/[a-f0-9-]+$/.test(url),
          "Derse ait güvenli görsel kullanın.",
        ),
      alt: text,
      regions: z.array(item).min(1).max(12),
    }),
    answer_key: z.object({
      regions: z.record(
        z.string(),
        z.object({
          x: z.number().min(0).max(1),
          y: z.number().min(0).max(1),
          width: z.number().positive().max(1),
          height: z.number().positive().max(1),
        }),
      ),
    }),
  }),
]);
export type ActivityInput = z.infer<typeof activitySchema>;
export type PublicActivity = {
  id: string;
  activity_id: string;
  course_id: string;
  objective_id: string;
  version: number;
  kind: ActivityInput["kind"];
  title: string;
  instruction: string;
  content: ActivityInput["content"];
  difficulty: number;
  source_refs: ActivityInput["source_refs"];
};
export type StoredActivity = PublicActivity & {
  answer_key: ActivityInput["answer_key"];
  explanation: string;
  published_at: string | null;
};
export { kindLabels } from "./kinds";
export function validateActivity(input: unknown): ActivityInput {
  const a = activitySchema.parse(input);
  function unique(items: { id: string }[]) {
    return new Set(items.map((i) => i.id)).size === items.length;
  }
  function exactKeys(record: Record<string, unknown>, ids: string[]) {
    return Object.keys(record).length === ids.length && ids.every((id) => id in record);
  }
  let valid = true;
  if (a.kind === "matching") {
    valid =
      unique(a.content.left) &&
      unique(a.content.right) &&
      a.content.left.length === a.content.right.length &&
      exactKeys(
        a.answer_key.pairs,
        a.content.left.map((i) => i.id),
      ) &&
      new Set(Object.values(a.answer_key.pairs)).size === a.content.right.length &&
      Object.values(a.answer_key.pairs).every((id) => a.content.right.some((i) => i.id === id));
  } else if (a.kind === "ordering") {
    valid =
      unique(a.content.items) &&
      new Set(a.answer_key.order).size === a.content.items.length &&
      a.answer_key.order.length === a.content.items.length &&
      a.content.items.every((i) => a.answer_key.order.includes(i.id));
  } else if (a.kind === "fill_blank") {
    valid =
      unique(a.content.blanks) &&
      exactKeys(
        a.answer_key.accepted,
        a.content.blanks.map((i) => i.id),
      ) &&
      a.content.blanks.every((i) => a.content.text.includes(`{{${i.id}}}`));
  } else if (a.kind === "categorize") {
    valid =
      unique(a.content.items) &&
      unique(a.content.categories) &&
      exactKeys(
        a.answer_key.categories,
        a.content.items.map((i) => i.id),
      ) &&
      Object.values(a.answer_key.categories).every((id) =>
        a.content.categories.some((c) => c.id === id),
      );
  } else if (a.kind === "region") {
    valid =
      unique(a.content.regions) &&
      exactKeys(
        a.answer_key.regions,
        a.content.regions.map((i) => i.id),
      ) &&
      Object.values(a.answer_key.regions).every((r) => r.x + r.width <= 1 && r.y + r.height <= 1);
  }
  if (!valid) throw new Error("Etkinlikteki öğeler ve cevap anahtarı tutarlı olmalı.");
  return a;
}
export function publicActivity(a: StoredActivity): PublicActivity {
  return {
    id: a.id,
    activity_id: a.activity_id,
    course_id: a.course_id,
    objective_id: a.objective_id,
    version: a.version,
    kind: a.kind,
    title: a.title,
    instruction: a.instruction,
    content: a.content,
    difficulty: a.difficulty,
    source_refs: a.source_refs,
  };
}
