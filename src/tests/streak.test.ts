import { expect, it } from "vitest";
import { streakSummary, type LearningDay } from "@/modules/rewards/streak";
function day(date: string, flags: Partial<LearningDay> = {}): LearningDay {
  return {
    date,
    actual_learning: false,
    goal_completed: false,
    makeup_completed: false,
    streak_protected: false,
    neutral: false,
    ...flags,
  };
}
it("hedef, telafi ve koruma seriyi sürdürür; içeriksiz gün sayıyı artırmaz", () => {
  expect(
    streakSummary(
      [
        day("2026-10-01", { goal_completed: true, actual_learning: true }),
        day("2026-10-02", { neutral: true }),
        day("2026-10-03", { makeup_completed: true }),
        day("2026-10-04", { streak_protected: true }),
        day("2026-10-05"),
      ],
      "2026-10-05",
    ),
  ).toEqual({ current: 3, best: 3 });
});
it("yalnız gerçek çalışma hedef yerine geçmez; kaçırılan gün seriyi keser", () => {
  expect(
    streakSummary(
      [
        day("2026-10-01", { goal_completed: true }),
        day("2026-10-02", { actual_learning: true }),
        day("2026-10-03", { goal_completed: true }),
      ],
      "2026-10-03",
    ),
  ).toEqual({ current: 1, best: 1 });
});
