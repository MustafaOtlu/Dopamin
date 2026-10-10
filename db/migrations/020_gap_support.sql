alter table gap_reports add column revision integer not null default 1 check(revision>0);
alter table gap_reports add column resolved_at timestamptz;
alter table gap_reports add column resolved_by uuid references profiles(id);
alter table gap_reports add column resolution_note text not null default '';
create table gap_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  course_id uuid not null references courses(id),
  objective_id uuid not null,
  actor_id uuid not null references profiles(id),
  actor_role text not null check(actor_role in ('student','teacher')),
  action text not null check(action in ('reported','updated','reopened','resolved')),
  note text not null check(length(note)<=1000),
  revision integer not null,
  created_at timestamptz not null default now(),
  foreign key(objective_id,course_id) references objectives(id,course_id),
  unique(user_id,objective_id,revision)
);
alter table gap_events enable row level security;
create policy gap_history_read on gap_events for select using(user_id=app_user_id() or owns_course(course_id));
grant select on gap_events to pusula_app;
revoke insert,update,delete on gap_reports from pusula_app;

create function set_gap_report(target_course uuid,target_objective uuid,target_student uuid,
  requested_action text,new_note text,expected_revision integer)
returns gap_reports language plpgsql security definer set search_path=public as $$
declare existing gap_reports; saved gap_reports; actor uuid; actor_role text; event_action text;
begin
  actor=app_user_id();
  select role into actor_role from profiles where id=actor;
  if actor is null or actor_role is null then raise exception 'GAP_ACCESS_DENIED'; end if;
  if requested_action not in ('report','resolve') or new_note is null or length(new_note)>1000
    then raise exception 'INVALID_GAP_INPUT'; end if;
  if not exists(select 1 from enrollments e join courses c on c.id=e.course_id
    where e.user_id=target_student and c.id=target_course and not c.archived)
    then raise exception 'GAP_ACCESS_DENIED'; end if;
  if requested_action='report' then
    if actor is distinct from target_student or actor_role is distinct from 'student'
      then raise exception 'GAP_ACCESS_DENIED'; end if;
    if not exists(select 1 from objectives o join topics t on t.id=o.topic_id
      join curriculum_versions v on v.id=t.curriculum_id where o.id=target_objective
      and o.course_id=target_course and v.status='published' and t.accessible)
      then raise exception 'GAP_OBJECTIVE_UNAVAILABLE'; end if;
  elsif not ((actor=target_student and actor_role='student')
    or (actor_role='teacher' and verified_teacher() and owns_course(target_course))) then
    raise exception 'GAP_ACCESS_DENIED';
  end if;
  perform pg_advisory_xact_lock(hashtext('gap:'||target_student::text||':'||target_objective::text));
  select * into existing from gap_reports where user_id=target_student
    and objective_id=target_objective and course_id=target_course for update;
  if requested_action='resolve' and existing.user_id is null then raise exception 'GAP_NOT_FOUND'; end if;
  if existing.user_id is not null then
    if requested_action='resolve' and existing.resolved then return existing; end if;
    if requested_action='report' and not existing.resolved and existing.note=new_note then return existing; end if;
    if expected_revision is distinct from existing.revision then raise exception 'GAP_CHANGED'; end if;
  elsif expected_revision is not null then raise exception 'GAP_CHANGED';
  end if;
  if requested_action='report' then
    event_action=case when existing.user_id is null then 'reported' when existing.resolved then 'reopened' else 'updated' end;
    insert into gap_reports(user_id,objective_id,course_id,note)
      values(target_student,target_objective,target_course,new_note)
      on conflict(user_id,objective_id) do update set note=excluded.note,resolved=false,
        resolved_at=null,resolved_by=null,resolution_note='',revision=gap_reports.revision+1,
        created_at=case when gap_reports.resolved then now() else gap_reports.created_at end
      returning * into saved;
  else
    event_action='resolved';
    update gap_reports set resolved=true,resolved_at=now(),resolved_by=actor,
      resolution_note=new_note,revision=revision+1 where user_id=target_student
      and objective_id=target_objective and course_id=target_course returning * into saved;
  end if;
  insert into gap_events(user_id,course_id,objective_id,actor_id,actor_role,action,note,revision)
    values(target_student,target_course,target_objective,actor,actor_role,event_action,new_note,saved.revision);
  -- A support request changes planning priority, never mastery, scores, or completed work.
  update daily_plans p set status='invalidated' where p.user_id=target_student
    and p.date >= (now() at time zone 'Europe/Istanbul')::date and p.status in ('ready','no_content')
    and not exists(select 1 from plan_items i where i.plan_id=p.id and i.status!='ready');
  return saved;
end $$;
revoke all on function set_gap_report(uuid,uuid,uuid,text,text,integer) from public;
grant execute on function set_gap_report(uuid,uuid,uuid,text,text,integer) to pusula_app;
