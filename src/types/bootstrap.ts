import type { User, Course, LearningSession } from "./domain";
import type { StoredActivity } from "@/modules/activities/schema";
import type { DailyView } from "@/modules/scheduling/service";
import type { Wallet } from "@/components/rewards-panel";

interface Mistake {
  id: string;
  course_id: string;
  title: string;
  course_title: string;
  topic_title: string;
  kind: StoredActivity["kind"];
  color: string;
  wrong_count: number;
}
export interface Bootstrap {
  user: User;
  courses: Course[];
  mistakes: Mistake[];
  sessions: LearningSession[];
  ai_configured: boolean;
  daily: DailyView | null;
  rewards: Wallet | null;
}
