import type { Database } from "@/lib/db";
import type { User } from "@/types/domain";

export async function exportPersonalData(tx: Database, user: User) {
  const ownTables = [
    "daily_plans",
    "plan_items",
    "mistake_items",
    "objective_mastery",
    "gap_reports",
    "gap_events",
    "submissions",
    "submission_versions",
    "reward_accounts",
    "xp_transactions",
    "token_transactions",
    "inventory",
    "purchases",
    "profile_cosmetics",
    "learning_days",
    "achievements",
    "weekly_rewards",
    "weekly_makeups",
    "league_members",
  ] as const;
  const records = {} as Record<(typeof ownTables)[number], Record<string, unknown>[]>;
  for (const table of ownTables)
    records[table] = await tx.query(`select * from ${table} where user_id=$1`, [user.id]);
  const [profile] = await tx.query(
    "select id,email,display_name,role,teacher_verified,university,public_profile,avatar,created_at from profiles where id=$1",
    [user.id],
  );
  const courses = await tx.query(
    "select c.id,c.title,c.description,c.code,c.term,c.color,c.archived,e.joined_at from courses c left join enrollments e on e.course_id=c.id and e.user_id=$1 where c.owner_id=$1 or e.user_id=$1 order by c.created_at",
    [user.id],
  );
  // Pending challenge grading stays hidden even in an export; the user's own answers are included.
  const attempts = await tx.query(
    `select a.id,a.session_id,a.course_id,a.activity_version_id,a.objective_id,a.context,a.answer,a.created_at,a.curriculum_id,
    case when s.mode='challenge' and ch.status is distinct from 'completed' then null else a.correct end correct,
    case when s.mode='challenge' and ch.status is distinct from 'completed' then null else a.score end score,
    (s.mode='challenge' and ch.status is distinct from 'completed') pending_feedback
    from attempts a join learning_sessions s on s.id=a.session_id left join challenges ch on ch.id=s.challenge_id where a.user_id=$1 order by a.created_at,a.id`,
    [user.id],
  );
  const sessions = await tx.query(
    `select s.id,s.course_id,s.mode,s.status,s.items,s.cursor,s.review_items,s.review_cursor,s.created_at,s.completed_at,s.plan_item_id,s.challenge_id,s.curriculum_refs,s.interrupted_from,
    case when s.mode='challenge' and ch.status is distinct from 'completed' then null else s.first_correct end first_correct
    from learning_sessions s left join challenges ch on ch.id=s.challenge_id where s.user_id=$1 order by s.created_at,s.id`,
    [user.id],
  );
  const feedback = await tx.query(
    "select f.submission_id,f.revision,f.grade,f.feedback,f.returned,f.created_at from assignment_feedback f join submissions s on s.id=f.submission_id where s.user_id=$1 order by f.created_at",
    [user.id],
  );
  const challenges = await tx.query(
    `select ch.id,ch.course_id,ch.status,ch.created_at,ch.expires_at,ch.completed_at,p.session_id,p.completed_at personal_completed_at,
    case when ch.status='completed' then p.score else null end personal_score,
    case when ch.status='completed' then p.correct_count else null end personal_correct_count,
    case when ch.status='completed' then ch.winner_id=$1 else null end won
    from challenges ch left join challenge_participants p on p.challenge_id=ch.id and p.user_id=$1 where ch.creator_id=$1 or ch.recipient_id=$1 order by ch.created_at`,
    [user.id],
  );
  const files = await tx.query(
    "select id,course_id,purpose,original_name,mime_type,byte_size,created_at,purged_at from files where uploaded_by=$1 order by created_at",
    [user.id],
  );
  return {
    schema_version: 1,
    exported_at: new Date().toISOString(),
    profile,
    courses,
    sessions,
    attempts,
    assignment_feedback: feedback,
    challenges,
    uploaded_file_metadata: files,
    ...records,
  };
}
