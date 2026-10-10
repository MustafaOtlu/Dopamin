import type { Database } from "@/lib/db";
import { assert } from "@/lib/errors";
import type { User, LearningSession } from "@/types/domain";
import { today } from "@/lib/time";
import { requireStudent } from "@/modules/auth/service";
import { newSession } from "@/modules/learning/service";
import { planCandidates, type Candidate } from "./planner";
export interface DailyPlan {
  id: string;
  user_id: string;
  date: string;
  status: "ready" | "in_progress" | "completed" | "no_content" | "invalidated";
  revision: number;
  estimated_minutes: number;
  completed_at: string | null;
}
export interface PlanItem {
  id: string;
  plan_id: string;
  user_id: string;
  course_id: string;
  objective_id: string;
  curriculum_id: string;
  position: number;
  reason: string;
  snapshot: {
    title: string;
    topic_title: string;
    course_title: string;
    color: string;
    estimated_minutes: number;
  };
  activity_version_ids: string[];
  status: "ready" | "in_progress" | "completed";
  session_id: string | null;
}
export interface DailyView {
  plan: DailyPlan;
  items: PlanItem[];
}
export async function ensureDailyPlan(
  tx: Database,
  user: User,
  date = today(),
): Promise<DailyView> {
  requireStudent(user);
  await tx.query("select pg_advisory_xact_lock(hashtext($1))", [`plan:${user.id}:${date}`]);
  let [plan] = await tx.query<DailyPlan>(
    "select *,date::text from daily_plans where user_id=$1 and date=$2 for update",
    [user.id, date],
  );
  if (plan && plan.status !== "invalidated") {
    await tx.query("select record_plan_day($1)", [plan.id]);
    return {
      plan,
      items: await tx.query<PlanItem>(
        "select * from plan_items where plan_id=$1 order by position",
        [plan.id],
      ),
    };
  }
  const candidates = await tx.query<Candidate>(
    `select o.id objective_id,o.course_id,o.title,o.importance,o.estimated_minutes,o.prerequisite_id,
    t.title topic_title,t.scheduled_date::text,t.curriculum_id,c.title course_title,c.color course_color,
    m.state mastery_state,m.next_review_date::text,exists(select 1 from gap_reports g where g.user_id=$1 and g.objective_id=o.id and not g.resolved) gap_reported,
    array_agg(v.id order by v.created_at) activity_ids
    from objectives o join topics t on t.id=o.topic_id join curriculum_versions cv on cv.id=t.curriculum_id
    join courses c on c.id=o.course_id join enrollments e on e.course_id=c.id and e.user_id=$1
    join activity_versions v on v.objective_id=o.id join activities a on a.id=v.activity_id and v.version=a.published_version
    left join objective_mastery m on m.objective_id=o.id and m.user_id=$1
    where not c.archived and t.accessible and cv.status='published' and a.status!='archived'
    and v.published_at < (($2::date+1)::timestamp at time zone 'Europe/Istanbul') and e.joined_at < (($2::date+1)::timestamp at time zone 'Europe/Istanbul')
    group by o.id,t.id,c.id,m.state,m.next_review_date`,
    [user.id, date],
  );
  let tasks = planCandidates(candidates, date);
  // An otherwise empty day can use old published material; never assign missing content.
  if (!tasks.length)
    tasks = planCandidates(
      candidates
        .filter((c) => c.scheduled_date <= date)
        .map((c) => ({ ...c, next_review_date: date })),
      date,
    );
  const minutes = tasks.reduce(
    (sum, c) =>
      sum +
      Math.max(
        1,
        Math.round(
          (c.estimated_minutes * c.selected_ids.length) / Math.max(1, c.activity_ids.length),
        ),
      ),
    0,
  );
  if (plan) {
    await tx.query("delete from plan_items where plan_id=$1", [plan.id]);
    [plan] = await tx.query<DailyPlan>(
      "update daily_plans set status=$2,revision=revision+1,estimated_minutes=$3 where id=$1 returning *,date::text",
      [plan.id, tasks.length ? "ready" : "no_content", minutes],
    );
  } else {
    [plan] = await tx.query<DailyPlan>(
      "insert into daily_plans(user_id,date,status,estimated_minutes) values($1,$2,$3,$4) returning *,date::text",
      [user.id, date, tasks.length ? "ready" : "no_content", minutes],
    );
  }
  for (let i = 0; i < tasks.length; i++) {
    const c = tasks[i];
    await tx.query(
      "insert into plan_items(plan_id,user_id,course_id,objective_id,curriculum_id,position,reason,snapshot,activity_version_ids,plan_date) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      [
        plan.id,
        user.id,
        c.course_id,
        c.objective_id,
        c.curriculum_id,
        i,
        c.reason,
        JSON.stringify({
          title: c.title,
          topic_title: c.topic_title,
          course_title: c.course_title,
          color: c.course_color,
          estimated_minutes: c.estimated_minutes,
        }),
        JSON.stringify(c.selected_ids),
        date,
      ],
    );
  }
  await tx.query("select record_plan_day($1)", [plan.id]);
  return {
    plan,
    items: await tx.query<PlanItem>("select * from plan_items where plan_id=$1 order by position", [
      plan.id,
    ]),
  };
}
export async function startPlanItem(tx: Database, user: User, id: string) {
  requireStudent(user);
  const [ref] = await tx.query<{ plan_id: string }>(
    "select plan_id from plan_items where id=$1 and user_id=$2",
    [id, user.id],
  );
  assert(ref, "Görev bulunamadı.", 404);
  const [plan] = await tx.query<DailyPlan>(
    "select *,date::text from daily_plans where id=$1 and user_id=$2 for update",
    [ref.plan_id, user.id],
  );
  const [item] = await tx.query<PlanItem>(
    "select * from plan_items where id=$1 and user_id=$2 for update",
    [id, user.id],
  );
  assert(item, "Plan güncellendi. Sayfayı yenile.", 409);
  assert(plan.status !== "invalidated", "Müfredat değişti. Günlük planını yenile.", 409);
  if (item.session_id) {
    const [session] = await tx.query<LearningSession>(
      "select * from learning_sessions where id=$1 and user_id=$2",
      [item.session_id, user.id],
    );
    return session;
  }
  assert(item.status === "ready", "Görev zaten tamamlandı.", 409);
  const session = await newSession(tx, user, item.activity_version_ids, "daily", item.course_id);
  await tx.query("update learning_sessions set plan_item_id=$2,curriculum_refs=$3 where id=$1", [
    session.id,
    item.id,
    JSON.stringify(
      Object.fromEntries(item.activity_version_ids.map((id) => [id, item.curriculum_id])),
    ),
  ]);
  await tx.query("update plan_items set status='in_progress',session_id=$2 where id=$1", [
    item.id,
    session.id,
  ]);
  await tx.query("update daily_plans set status='in_progress' where id=$1", [plan.id]);
  return session;
}
export async function completePlanItem(tx: Database, user: User, sessionId: string) {
  const [ref] = await tx.query<{ plan_id: string }>(
    "select plan_id from plan_items where session_id=$1 and user_id=$2",
    [sessionId, user.id],
  );
  if (!ref) return;
  // Serialize completion across tasks in the same plan, with the same lock order as start.
  await tx.query("select id from daily_plans where id=$1 for update", [ref.plan_id]);
  const [item] = await tx.query<PlanItem>(
    "select * from plan_items where session_id=$1 and user_id=$2 for update",
    [sessionId, user.id],
  );
  if (!item || item.status === "completed") return;
  await tx.query("update plan_items set status='completed',completed_at=now() where id=$1", [
    item.id,
  ]);
  const [pending] = await tx.query<{ count: number }>(
    "select count(*)::int count from plan_items where plan_id=$1 and status!='completed'",
    [item.plan_id],
  );
  if (!pending.count)
    await tx.query(
      "update daily_plans set status='completed',completed_at=now() where id=$1 and status!='completed'",
      [item.plan_id],
    );
}
export async function invalidateUnstarted(tx: Database, userId: string) {
  await tx.query(
    "update daily_plans p set status='invalidated' where p.user_id=$1 and p.date>=$2 and p.status in ('ready','no_content') and not exists(select 1 from plan_items i where i.plan_id=p.id and i.status!='ready')",
    [userId, today()],
  );
}
