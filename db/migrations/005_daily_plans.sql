create table daily_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  date date not null,
  status text not null check(status in ('ready','in_progress','completed','no_content','invalidated')),
  revision integer not null default 1,
  estimated_minutes integer not null default 0,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(user_id,date)
);
create table plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references daily_plans(id) on delete cascade,
  user_id uuid not null references profiles(id),
  course_id uuid not null references courses(id),
  objective_id uuid not null,
  curriculum_id uuid not null references curriculum_versions(id),
  position integer not null,
  reason text not null,
  snapshot jsonb not null,
  activity_version_ids jsonb not null,
  status text not null default 'ready' check(status in ('ready','in_progress','completed')),
  session_id uuid unique references learning_sessions(id),
  completed_at timestamptz,
  foreign key(objective_id,course_id) references objectives(id,course_id),
  unique(plan_id,position)
);
alter table learning_sessions add column plan_item_id uuid unique references plan_items(id);
alter table learning_sessions add column curriculum_refs jsonb not null default '{}';
alter table learning_sessions add column interrupted_from text check(interrupted_from in ('in_progress','reviewing'));
alter table curriculum_versions add constraint curriculum_course_unique unique(id,course_id);
alter table attempts add column curriculum_id uuid;
alter table attempts add constraint attempt_curriculum_fk foreign key(curriculum_id,course_id) references curriculum_versions(id,course_id);

grant select,insert,update,delete on daily_plans,plan_items to pusula_app;
alter table daily_plans enable row level security;
create policy own_plan on daily_plans for all using(user_id=app_user_id()) with check(user_id=app_user_id());
alter table plan_items enable row level security;
create policy own_plan_item on plan_items for all using(user_id=app_user_id()) with check(user_id=app_user_id() and enrolled_course(course_id));
create policy teacher_plan_item on plan_items for select using(owns_course(course_id));

create function invalidate_course_plans(target uuid) returns integer language plpgsql security definer set search_path=public as $$
declare changed integer; begin
  if not owns_course(target) then raise exception 'COURSE_OWNER_ONLY'; end if;
  update daily_plans p set status='invalidated' where p.status in ('ready','no_content')
    and p.date >= (now() at time zone 'Europe/Istanbul')::date
    and exists(select 1 from enrollments e where e.course_id=target and e.user_id=p.user_id)
    and not exists(select 1 from plan_items i where i.plan_id=p.id and i.status!='ready');
  get diagnostics changed=row_count;return changed;
end $$;
revoke all on function invalidate_course_plans(uuid) from public;
grant execute on function invalidate_course_plans(uuid) to pusula_app;
