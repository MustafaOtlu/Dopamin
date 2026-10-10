import type { SourceChunk } from "./contracts";

const words = (text: string) =>
  text
    .normalize("NFKD")
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/\p{M}/gu, "")
    .match(/[\p{L}\p{N}]+/gu) || [];
const stopWords = new Set([
  "bir",
  "ve",
  "ile",
  "icin",
  "olan",
  "olarak",
  "gore",
  "ders",
  "konu",
  "aciklayabilme",
  "tanimlayabilme",
  "kavramlarini",
  "temel",
  "the",
  "and",
  "of",
]);

/** Rank locally: no extra model calls, embeddings service or source uploads. */
export function selectSourceContext(
  chunks: SourceChunk[],
  objective?: { title: string; topic_title: string },
) {
  const limit = objective ? 18 : 30;
  const terms = [
    ...new Set(words(objective ? `${objective.topic_title} ${objective.title}` : "")),
  ].filter((term) => term.length > 2 && !stopWords.has(term));
  const scores = chunks.map((chunk) => {
    const body = new Set(words(chunk.text));
    const heading = new Set(words(chunk.heading || ""));
    const matches = (set: Set<string>, term: string) =>
      set.has(term) ||
      (term.length >= 5 &&
        [...set].some(
          (word) => word.length >= 5 && (word.startsWith(term) || term.startsWith(word)),
        ));
    return terms.reduce(
      (sum, term) => sum + (matches(body, term) ? 1 : 0) + (matches(heading, term) ? 3 : 0),
      0,
    );
  });
  const chosen = new Set<number>();
  let remaining = 60_000;
  const add = (index: number) => {
    const chunk = chunks[index];
    if (!chunk || chosen.has(index) || chosen.size >= limit || !chunk.text.trim()) return;
    // Keep complete chunks so the quote remains verifiable against the actual source.
    if (chunk.text.length > remaining) return;
    chosen.add(index);
    remaining -= chunk.text.length;
  };
  const ranked = scores
    .map((score, index) => ({ score, index }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);
  if (objective) {
    for (const { index } of ranked.slice(0, 12)) add(index);
    // Adjacent chunks retain definitions/conditions split at extraction boundaries.
    for (const { index } of ranked.slice(0, 3)) {
      for (const neighbor of [index - 1, index + 1])
        if (chunks[neighbor]?.document_id === chunks[index].document_id) add(neighbor);
    }
  }
  // Round-robin documents and sample their whole extent, not just their first pages.
  const groups = new Map<string, number[]>();
  chunks.forEach((chunk, index) => {
    const group = groups.get(chunk.document_id) || [];
    group.push(index);
    groups.set(chunk.document_id, group);
  });
  const queues = [...groups.values()].map((group) => {
    const count = Math.min(group.length, Math.ceil(limit / groups.size));
    return Array.from(
      { length: count },
      (_, i) => group[count === 1 ? 0 : Math.round((i * (group.length - 1)) / (count - 1))],
    );
  });
  for (let i = 0; i < limit; i++) for (const queue of queues) if (i < queue.length) add(queue[i]);
  // Redistribute slots unused by short documents.
  for (let i = 0; i < limit; i++)
    for (const group of groups.values())
      add(group[Math.round((i * (group.length - 1)) / (limit - 1))]);
  const sources = [...chosen].sort((a, b) => a - b).map((index) => chunks[index]);
  return {
    sources,
    coverage: {
      total_chunks: chunks.length,
      selected_chunks: sources.length,
      partial: sources.length < chunks.length,
      selection: objective ? "objective_relevance_and_context" : "document_sampling",
    },
  };
}
