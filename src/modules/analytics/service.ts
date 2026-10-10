import type { Database } from "@/lib/db";
import type { User } from "@/types/domain";
import { ownCourse } from "@/modules/courses/service";
import { today, addDays } from "@/lib/time";
import { assert } from "@/lib/errors";

export async function courseAnalytics(tx: Database, user: User, courseId: string) {
  await ownCourse(tx, user, courseId);
  const students = await tx.query(
    `select p.id,p.display_name,p.email,e.joined_at,
    count(a.id) filter(where a.context='first')::int first_attempts,
    count(a.id) filter(where a.context='first' and a.correct)::int first_correct,
    count(a.id) filter(where a.context!='first')::int review_attempts,
    count(a.id) filter(where a.context!='first' and a.correct)::int review_correct,
    max(a.created_at) last_active
    from enrollments e join profiles p on p.id=e.user_id left join attempts a on a.user_id=e.user_id and a.course_id=e.course_id
    where e.course_id=$1 group by p.id,e.joined_at order by p.display_name`,
    [courseId],
  );
  const objectives = await tx.query(
    `select o.id,o.title,t.title topic_title,count(a.id)::int attempts,
    count(a.id) filter(where not a.correct)::int incorrect,
    (select count(*)::int from gap_reports g where g.objective_id=o.id and not g.resolved) reported_gaps
    from objectives o join topics t on t.id=o.topic_id left join attempts a on a.objective_id=o.id and a.context='first'
    where o.course_id=$1 group by o.id,t.title order by incorrect desc,o.title`,
    [courseId],
  );
  const attempts = await tx.query(
    `select a.id,a.user_id,a.context,a.correct,a.score,a.answer,a.created_at,a.activity_version_id,
    p.display_name,v.title,v.version,o.title objective_title,s.mode
    from attempts a join profiles p on p.id=a.user_id join activity_versions v on v.id=a.activity_version_id join objectives o on o.id=a.objective_id join learning_sessions s on s.id=a.session_id
    where a.course_id=$1 order by a.created_at desc limit 200`,
    [courseId],
  );
  const participation = await tx.query(
    `select (a.created_at at time zone 'Europe/Istanbul')::date::text date,count(distinct a.user_id)::int students,
    count(distinct a.user_id) filter(where s.mode='daily')::int daily_students
    from attempts a join learning_sessions s on s.id=a.session_id where a.course_id=$1 and a.created_at>=($2::date at time zone 'Europe/Istanbul') and s.mode not in ('assignment','challenge') group by date order by date`,
    [courseId, addDays(today(), -6)],
  );
  const plans = await tx.query(
    `select plan_date::text date,count(*)::int total_items,count(*) filter(where status='completed')::int completed_items,count(distinct user_id)::int students from plan_items where course_id=$1 and plan_date>=$2 group by plan_date order by plan_date`,
    [courseId, addDays(today(), -6)],
  );
  const [pending] = await tx.query<{ count: number }>(
    "select count(*)::int count from activities where course_id=$1 and status='needs_review'",
    [courseId],
  );
  return {
    students,
    objectives,
    attempts,
    participation,
    plans,
    pending_content: pending.count,
    date: today(),
  };
}

export async function studentAnalytics(
  tx: Database,
  user: User,
  courseId: string,
  studentId: string,
) {
  await ownCourse(tx, user, courseId);
  const [student] = await tx.query(
    "select p.id,p.display_name,p.email from profiles p join enrollments e on e.user_id=p.id where e.course_id=$1 and p.id=$2",
    [courseId, studentId],
  );
  assert(student, "Öğrenci bu sınıfta bulunamadı.", 404);
  const objectives = await tx.query(
    `select o.id,o.title,t.title topic_title,m.state,m.confidence,m.first_attempts,m.first_correct,m.distinct_days,m.next_review_date::text,
    g.note gap_note,g.created_at gap_reported_at,g.revision gap_revision,g.resolved gap_resolved,
    g.resolution_note,g.resolved_at from objectives o join topics t on t.id=o.topic_id left join objective_mastery m on m.objective_id=o.id and m.user_id=$2 left join gap_reports g on g.objective_id=o.id and g.user_id=$2 where o.course_id=$1 order by t.week,o.title`,
    [courseId, studentId],
  );
  const attempts = await tx.query(
    `select a.id,a.context,a.correct,a.score,a.created_at,v.title,v.version,s.mode from attempts a join activity_versions v on v.id=a.activity_version_id join learning_sessions s on s.id=a.session_id where a.course_id=$1 and a.user_id=$2 order by a.created_at desc limit 100`,
    [courseId, studentId],
  );
  const plans = await tx.query(
    "select id,snapshot,reason,status,plan_date::text from plan_items where course_id=$1 and user_id=$2 order by plan_date desc,position limit 50",
    [courseId, studentId],
  );
  const assignments = await tx.query(
    "select a.id,a.title,a.due_at,s.status,s.current_revision,s.submitted_at from assignments a join assignment_targets t on t.assignment_id=a.id and t.user_id=$2 left join submissions s on s.assignment_id=a.id and s.user_id=$2 where a.course_id=$1 order by a.due_at desc",
    [courseId, studentId],
  );
  return { student, objectives, attempts, plans, assignments };
}
