import { z } from "zod";
import { assert, AppError } from "@/lib/errors";
import { validateActivity, type ActivityInput } from "@/modules/activities/schema";
const source = z.object({
  document_id: z.uuid(),
  page: z.number().int().positive(),
  quote: z.string().min(5).max(500),
});
export const curriculumOutput = z.object({
  course_title: z.string(),
  term: z.string().nullable(),
  topics: z
    .array(
      z.object({
        title: z.string().min(2).max(200),
        week: z.number().int().min(1).max(52).nullable(),
        scheduled_date: z.iso.date().nullable(),
        date_is_inferred: z.boolean(),
        objective_titles: z.array(z.string().min(2).max(500)),
        sources: z.array(source).min(1),
      }),
    )
    .min(1)
    .max(100),
  questions: z
    .array(
      z.object({
        topic: z.string(),
        question: z.string(),
        reason: z.string(),
        options: z.array(z.string()),
        changes_field: z.enum(["scope", "week", "scheduled_date", "objectives"]),
      }),
    )
    .max(20),
});
export type CurriculumOutput = z.infer<typeof curriculumOutput>;
export const generatedOutput = z.object({
  kind: z.enum(["true_false", "matching", "ordering", "fill_blank", "categorize"]),
  title: z.string().min(1).max(200),
  instruction: z.string().min(1).max(500),
  explanation: z.string().min(1).max(2000),
  difficulty: z.number().int().min(1).max(3),
  statement: z.string().default(""),
  correct_boolean: z.boolean().default(false),
  items: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        match: z.string().default(""),
        category: z.string().default(""),
      }),
    )
    .max(20)
    .default([]),
  categories: z
    .array(z.object({ id: z.string(), label: z.string() }))
    .max(8)
    .default([]),
  blanks: z
    .array(
      z.object({ id: z.string(), label: z.string().default(""), accepted: z.array(z.string()) }),
    )
    .max(12)
    .default([]),
  sources: z.array(source).min(1).max(10),
});
export function generationSchema(index: number) {
  const kind =
    generatedOutput.shape.kind.options[index % generatedOutput.shape.kind.options.length];
  const common = generatedOutput
    .pick({
      title: true,
      instruction: true,
      explanation: true,
      difficulty: true,
      sources: true,
    })
    .extend({
      kind: z.enum([kind]),
      title: z.string().min(1).max(70),
      instruction: z.string().min(1).max(250),
      explanation: z.string().min(1).max(600),
    });
  const item = z.object({ id: z.string().min(1).max(40), label: z.string().min(1).max(100) });
  switch (kind) {
    case "true_false":
      return common.extend({ statement: z.string().min(5).max(500), correct_boolean: z.boolean() });
    case "matching":
      return common.extend({
        items: z
          .array(item.extend({ match: z.string().min(1).max(150) }))
          .min(2)
          .max(5),
      });
    case "ordering":
      return common.extend({ items: z.array(item).min(2).max(5) });
    case "fill_blank":
      return common.extend({
        statement: z.string().min(5).max(500),
        blanks: z
          .array(
            z.object({
              id: z.string().min(1).max(40),
              accepted: z.array(z.string().min(1).max(100)).min(1).max(6),
            }),
          )
          .min(1)
          .max(2),
      });
    case "categorize":
      return common.extend({
        items: z
          .array(item.extend({ category: z.string().min(1).max(40) }))
          .min(2)
          .max(4),
        categories: z.array(item).min(2).max(4),
      });
  }
}

export interface SourceChunk {
  document_id: string;
  page: number;
  text: string;
  heading?: string | null;
  source_kind?: "pdf" | "web";
  source_url?: string | null;
}
const normalized = (s: string) =>
  s.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase("tr-TR");
export function verifyCitations(sources: z.infer<typeof source>[], chunks: SourceChunk[]) {
  assert(sources.length > 0, "Üretilen içerik en az bir kaynak gerektirir.");
  for (const ref of sources) {
    assert(
      chunks.some(
        (c) =>
          c.document_id === ref.document_id &&
          c.page === ref.page &&
          normalized(c.text).includes(normalized(ref.quote)),
      ),
      "Kaynak alıntısı izin verilen belge/sayfa veya web bölümünde bulunamadı.",
    );
  }
}
export function toActivity(output: unknown, chunks: SourceChunk[]): ActivityInput {
  const data = generatedOutput.parse(output);
  verifyCitations(data.sources, chunks);
  // Defaults are for unused fields only; never invent a missing answer for the selected kind.
  generationSchema(generatedOutput.shape.kind.options.indexOf(data.kind)).parse(output);
  if (
    data.kind === "matching" &&
    data.items.some((item) => normalized(item.label) === normalized(item.match))
  )
    throw new AppError(
      422,
      "Eşleştirme kartının iki yüzü aynı olamaz. Yeni bir açıklama gerekli.",
      "AI_INVALID_OUTPUT",
    );
  const distinct = (values: string[]) => new Set(values.map(normalized)).size === values.length;
  if (
    data.kind === "matching" &&
    (!distinct(data.items.map((item) => item.label)) ||
      !distinct(data.items.map((item) => item.match)))
  )
    throw new AppError(
      422,
      "Eşleştirmede aynı kavram veya tanım birden fazla kullanılamaz.",
      "AI_INVALID_OUTPUT",
    );
  if (data.kind === "ordering" && !distinct(data.items.map((item) => item.label)))
    throw new AppError(422, "Sıralama adımları birbirinden farklı olmalı.", "AI_INVALID_OUTPUT");
  if (data.kind === "fill_blank") {
    const placeholders = [...data.statement.matchAll(/\{\{([^{}]+)\}\}/g)].map((match) => match[1]);
    if (
      placeholders.length !== data.blanks.length ||
      !distinct(placeholders) ||
      placeholders.some((id) => !data.blanks.some((blank) => blank.id === id))
    )
      throw new AppError(
        422,
        "Metindeki boşluklar cevap alanlarıyla birebir eşleşmeli.",
        "AI_INVALID_OUTPUT",
      );
  }
  const common = {
    kind: data.kind,
    title: data.title,
    instruction: data.instruction,
    explanation: data.explanation,
    difficulty: data.difficulty,
    source_refs: data.sources,
  };
  if (data.kind === "true_false")
    return validateActivity({
      ...common,
      content: { statement: data.statement },
      answer_key: { value: data.correct_boolean },
    });
  if (data.kind === "ordering")
    return validateActivity({
      ...common,
      content: { items: data.items.map(({ id, label }) => ({ id, label })) },
      answer_key: { order: data.items.map((i) => i.id) },
    });
  if (data.kind === "matching")
    return validateActivity({
      ...common,
      content: {
        left: data.items.map(({ id, label }) => ({ id, label })),
        right: data.items.map((i) => ({ id: `r_${i.id}`, label: i.match })),
      },
      answer_key: { pairs: Object.fromEntries(data.items.map((i) => [i.id, `r_${i.id}`])) },
    });
  if (data.kind === "fill_blank")
    return validateActivity({
      ...common,
      content: {
        text: data.statement,
        blanks: data.blanks.map(({ id }, index) => ({ id, label: `${index + 1}. boşluk` })),
      },
      answer_key: { accepted: Object.fromEntries(data.blanks.map((b) => [b.id, b.accepted])) },
    });
  return validateActivity({
    ...common,
    content: {
      items: data.items.map(({ id, label }) => ({ id, label })),
      categories: data.categories,
    },
    answer_key: { categories: Object.fromEntries(data.items.map((i) => [i.id, i.category])) },
  });
}
