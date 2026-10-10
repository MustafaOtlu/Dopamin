export type Role = "student" | "teacher";
export interface GenerationChecks {
  publication_method?: "teacher" | "automatic";
  automatic_review?: {
    source_supported: boolean;
    answer_valid: boolean;
    unambiguous: boolean;
    objective_covered: boolean;
    findings: string[];
  };
}
export interface User {
  id: string;
  email: string;
  display_name: string;
  role: Role;
  teacher_verified: boolean;
  university: string;
  public_profile: boolean;
  avatar: string;
}
export interface Course {
  id: string;
  owner_id: string;
  title: string;
  description: string;
  code: string;
  term: string;
  color: string;
  archived: boolean;
  publish_mode: "review" | "automatic";
  publication_policy_revision: number;
  student_count?: number;
  activity_count?: number;
  invite_code?: string;
  invite_expires_at?: string;
}
export interface Objective {
  id: string;
  course_id: string;
  topic_id: string;
  title: string;
  topic_title: string;
  week: number;
  scheduled_date: string;
  importance: number;
  estimated_minutes: number;
  prerequisite_id: string | null;
  accessible: boolean;
  mastery_state?: string;
  confidence?: number;
  gap_reported?: boolean;
}
export type SessionMode =
  "practice" | "daily" | "mistakes" | "advance" | "assignment" | "challenge";
export interface LearningSession {
  id: string;
  user_id: string;
  course_id: string | null;
  mode: SessionMode;
  status: "in_progress" | "reviewing" | "completed" | "interrupted";
  items: string[];
  cursor: number;
  review_items: string[];
  review_cursor: number;
  first_correct: number;
  created_at: string;
  completed_at: string | null;
  plan_item_id?: string | null;
  challenge_id?: string | null;
  curriculum_refs?: Record<string, string>;
  interrupted_from?: "in_progress" | "reviewing" | null;
}
