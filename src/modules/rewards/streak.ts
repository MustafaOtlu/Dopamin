export interface LearningDay {
  date: string;
  actual_learning: boolean;
  goal_completed: boolean;
  makeup_completed: boolean;
  streak_protected: boolean;
  neutral: boolean;
}
export function streakSummary(days: LearningDay[], today: string) {
  let current = 0,
    best = 0;
  for (const day of days) {
    if (day.date > today) break;
    if (day.goal_completed || day.makeup_completed || day.streak_protected) {
      current++;
      best = Math.max(best, current);
    } else if (!day.neutral && day.date !== today) current = 0;
  }
  return { current, best };
}
