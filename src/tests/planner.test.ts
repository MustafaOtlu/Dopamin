import { describe, it, expect } from "vitest";
import { planCandidates, type Candidate } from "@/modules/scheduling/planner";
const date = "2026-10-09";
function candidate(id: string, patch: Partial<Candidate> = {}): Candidate {
  return {
    objective_id: id,
    course_id: "a",
    course_title: "Ders",
    course_color: "violet",
    title: id,
    topic_title: "Konu",
    scheduled_date: date,
    curriculum_id: "v1",
    importance: 2,
    estimated_minutes: 8,
    prerequisite_id: null,
    mastery_state: null,
    next_review_date: null,
    gap_reported: false,
    activity_ids: [`${id}-1`, `${id}-2`, `${id}-3`],
    ...patch,
  };
}
describe("günlük plan seçimi", () => {
  it("kritik, ön koşul, eski tekrar, hazırlık ve haftalık öğrenme sırasını uygular", () => {
    const tasks = planCandidates(
      [
        candidate("week"),
        candidate("prep", { scheduled_date: "2026-10-13" }),
        candidate("old", {
          scheduled_date: "2026-09-01",
          mastery_state: "mastered",
          next_review_date: date,
        }),
        candidate("prereq", { scheduled_date: "2026-09-01" }),
        candidate("critical", { importance: 3, prerequisite_id: "prereq" }),
      ],
      date,
    );
    expect(tasks.map((c) => c.objective_id)).toEqual(["critical", "prereq", "old", "prep", "week"]);
  });
  it("tek dersteki yoğunluğu dersler arasında dengeler; sabit soru sınırı koymaz", () => {
    const tasks = planCandidates(
      Array.from({ length: 22 }, (_, i) => candidate(String(i).padStart(2, "0"))).concat(
        candidate("second", { course_id: "b" }),
      ),
      date,
    );
    expect(tasks[1].course_id).toBe("b");
    expect(tasks.flatMap((t) => t.selected_ids)).toHaveLength(69);
  });
  it("ileri öğrenilmiş konuya kısa pekiştirme verir, uzak gelecek ve içeriksiz kazanımı atlar", () => {
    const tasks = planCandidates(
      [
        candidate("mastered", { mastery_state: "mastered" }),
        candidate("future", { scheduled_date: "2027-01-01" }),
        candidate("empty", { activity_ids: [] }),
      ],
      date,
    );
    expect(tasks).toHaveLength(1);
    expect(tasks[0].selected_ids).toHaveLength(1);
    expect(tasks[0].reason).toContain("kısa pekiştirme");
  });
  it("hafta sonunda eksik tamamlama ve hazırlık çalışır", () => {
    const tasks = planCandidates(
      [
        candidate("old", { scheduled_date: "2026-09-01", mastery_state: "needs_review" }),
        candidate("next", { scheduled_date: "2026-10-13" }),
      ],
      "2026-10-11",
    );
    expect(tasks.map((c) => c.objective_id)).toEqual(["old", "next"]);
  });
});
