import { weekStart, addDays } from "@/lib/time";
export interface Candidate {
  objective_id: string;
  course_id: string;
  course_title: string;
  course_color: string;
  title: string;
  topic_title: string;
  scheduled_date: string;
  curriculum_id: string;
  importance: number;
  estimated_minutes: number;
  prerequisite_id: string | null;
  mastery_state: string | null;
  next_review_date: string | null;
  gap_reported: boolean;
  activity_ids: string[];
}
export interface Planned extends Candidate {
  priority: number;
  reason: string;
  selected_ids: string[];
}
export function planCandidates(candidates: Candidate[], date: string): Planned[] {
  const start = weekStart(date),
    end = addDays(start, 6),
    upcoming = addDays(date, 7);
  const neededPrerequisites = new Set(
    candidates
      .filter((c) => c.scheduled_date >= start && c.scheduled_date <= end && c.prerequisite_id)
      .map((c) => c.prerequisite_id),
  );
  const planned: Planned[] = [];
  for (const c of candidates) {
    if (!c.activity_ids.length) continue;
    const current = c.scheduled_date >= start && c.scheduled_date <= end;
    const mastered = c.mastery_state === "mastered";
    let priority: number, reason: string;
    if (current && c.importance === 3 && !mastered) {
      priority = 0;
      reason = "Bu haftanın kritik kazanımı";
    } else if (
      c.gap_reported ||
      (neededPrerequisites.has(c.objective_id) && !mastered) ||
      c.mastery_state === "needs_review"
    ) {
      priority = 1;
      reason = c.gap_reported
        ? "Bildirdiğin eksiği tamamla"
        : "Ön koşulu ve eksik bilgini pekiştir";
    } else if (c.next_review_date && c.next_review_date <= date) {
      priority = 2;
      reason = "Aralıklı tekrar zamanı";
    } else if (c.scheduled_date > date && c.scheduled_date <= upcoming && !current) {
      priority = 3;
      reason = "Yaklaşan derse hazırlık";
    } else if (current && !mastered) {
      priority = 4;
      reason = "Bu haftanın öğrenme kazanımı";
    } else if (current && mastered) {
      priority = 5;
      reason = "Önceden öğrendin: kısa pekiştirme";
    } else if (c.scheduled_date < start && !mastered) {
      priority = 4;
      reason = "Önceki konudaki eksiği tamamla";
    } else continue;
    const selected_ids = mastered
      ? c.activity_ids.slice(0, 1)
      : c.mastery_state === "reinforcing"
        ? c.activity_ids.slice(0, 2)
        : c.activity_ids;
    planned.push({ ...c, priority, reason, selected_ids });
  }
  // Round-robin inside each priority keeps one busy course from hiding the others.
  const result: Planned[] = [];
  for (const priority of [...new Set(planned.map((c) => c.priority))].sort((a, b) => a - b)) {
    const level = planned
      .filter((c) => c.priority === priority)
      .sort(
        (a, b) =>
          b.importance - a.importance ||
          a.scheduled_date.localeCompare(b.scheduled_date) ||
          a.objective_id.localeCompare(b.objective_id),
      );
    const courses = [...new Set(level.map((c) => c.course_id))];
    while (level.length) {
      for (const course of courses) {
        const index = level.findIndex((c) => c.course_id === course);
        if (index >= 0) result.push(level.splice(index, 1)[0]);
      }
    }
  }
  return result;
}
