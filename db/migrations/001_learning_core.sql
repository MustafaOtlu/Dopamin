create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now());

create table profiles (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  display_name text not null check (length(display_name) between 2 and 80),
  role text not null check (role in ('student','teacher')),
  teacher_verified boolean not null default false,
  university text not null default '',
  public_profile boolean not null default false,
  avatar text not null default 'violet',
  created_at timestamptz not null default now()
);
create table local_credentials (
  user_id uuid primary key references profiles(id) on delete cascade,
  password_hash text not null
);
create table auth_sessions (
  token_hash text primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create table auth_rate_limits (
  key text primary key,
  count integer not null default 1,
  reset_at timestamptz not null
);
create table courses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id),
  title text not null check(length(title) between 2 and 140),
  description text not null default '',
  code text not null default '',
  term text not null,
  color text not null default 'violet',
  archived boolean not null default false,
  publish_mode text not null default 'review' check(publish_mode in ('review','automatic')),
  created_at timestamptz not null default now()
);
create table class_invites (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  code text not null unique,
  revoked boolean not null default false,
  expires_at timestamptz not null default now() + interval '180 days',
  created_at timestamptz not null default now()
);
create table enrollments (
  course_id uuid not null references courses(id) on delete cascade,
  user_id uuid not null references profiles(id),
  joined_at timestamptz not null default now(),
  primary key(course_id,user_id)
);
create table curriculum_versions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  version integer not null,
  status text not null default 'published' check(status in ('draft','published','archived')),
  created_at timestamptz not null default now(),
  unique(course_id,version)
);
create table topics (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id),
  curriculum_id uuid not null references curriculum_versions(id),
  title text not null,
  week integer not null default 1 check(week between 1 and 52),
  scheduled_date date not null,
  accessible boolean not null default true,
  unique(id,course_id)
);
create table objectives (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id),
  topic_id uuid not null,
  title text not null,
  importance integer not null default 2 check(importance between 1 and 3),
  estimated_minutes integer not null default 5 check(estimated_minutes between 1 and 120),
  prerequisite_id uuid references objectives(id),
  foreign key(topic_id,course_id) references topics(id,course_id),
  unique(id,course_id)
);
create table activities (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id),
  objective_id uuid not null,
  current_version integer not null default 1,
  status text not null default 'draft' check(status in ('draft','needs_review','approved','published','archived')),
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  foreign key(objective_id,course_id) references objectives(id,course_id),
  unique(id,course_id)
);
create table activity_versions (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null,
  course_id uuid not null,
  version integer not null,
  kind text not null check(kind in ('true_false','matching','ordering','fill_blank','categorize','region')),
  title text not null,
  instruction text not null,
  content jsonb not null,
  answer_key jsonb not null,
  explanation text not null,
  difficulty integer not null default 1 check(difficulty between 1 and 3),
  source_refs jsonb not null default '[]',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key(activity_id,course_id) references activities(id,course_id),
  unique(activity_id,version),
  unique(id,course_id)
);
create table learning_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  course_id uuid references courses(id),
  mode text not null check(mode in ('practice','daily','mistakes','advance','assignment','challenge')),
  status text not null default 'in_progress' check(status in ('in_progress','reviewing','completed','interrupted')),
  items jsonb not null,
  cursor integer not null default 0 check(cursor >= 0),
  review_items jsonb not null default '[]',
  review_cursor integer not null default 0 check(review_cursor >= 0),
  first_correct integer not null default 0,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create table attempts (
  id uuid primary key default gen_random_uuid(),
  request_key uuid not null,
  session_id uuid not null references learning_sessions(id),
  user_id uuid not null references profiles(id),
  course_id uuid not null references courses(id),
  activity_version_id uuid not null,
  objective_id uuid not null,
  context text not null check(context in ('first','session_review','mistake_review')),
  answer jsonb not null,
  correct boolean not null,
  score numeric not null check(score between 0 and 1),
  created_at timestamptz not null default now(),
  foreign key(activity_version_id,course_id) references activity_versions(id,course_id),
  foreign key(objective_id,course_id) references objectives(id,course_id),
  unique(user_id,request_key)
);
create index attempts_course_idx on attempts(course_id,created_at);
create index attempts_user_objective_idx on attempts(user_id,objective_id,created_at);
create table mistake_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  course_id uuid not null references courses(id),
  activity_version_id uuid not null,
  objective_id uuid not null,
  status text not null default 'pending' check(status in ('pending','resolved')),
  wrong_count integer not null default 1,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  foreign key(activity_version_id,course_id) references activity_versions(id,course_id),
  foreign key(objective_id,course_id) references objectives(id,course_id),
  unique(user_id,activity_version_id)
);
create table objective_mastery (
  user_id uuid not null references profiles(id),
  objective_id uuid not null,
  course_id uuid not null references courses(id),
  state text not null default 'learning' check(state in ('learning','reinforcing','mastered','needs_review')),
  first_attempts integer not null default 0,
  first_correct integer not null default 0,
  distinct_days integer not null default 0,
  distinct_activities integer not null default 0,
  confidence numeric not null default 0,
  next_review_date date,
  updated_at timestamptz not null default now(),
  foreign key(objective_id,course_id) references objectives(id,course_id),
  primary key(user_id,objective_id)
);
create table gap_reports (
  user_id uuid not null references profiles(id),
  objective_id uuid not null,
  course_id uuid not null references courses(id),
  note text not null default '',
  resolved boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key(objective_id,course_id) references objectives(id,course_id),
  primary key(user_id,objective_id)
);

create function app_user_id() returns uuid language sql stable as $$
  select nullif(current_setting('app.user_id',true),'')::uuid
$$;
create function owns_course(target uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from courses where id=target and owner_id=app_user_id())
$$;
create function enrolled_course(target uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from enrollments where course_id=target and user_id=app_user_id())
$$;
create function can_read_course(target uuid) returns boolean language sql stable as $$
  select owns_course(target) or enrolled_course(target)
$$;
create function verified_teacher() returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from profiles where id=app_user_id() and role='teacher' and teacher_verified)
$$;
do $$ begin
  if not exists(select 1 from pg_roles where rolname='pusula_app') then create role pusula_app nologin; end if;
end $$;
grant usage on schema public to pusula_app;
grant select,insert,update,delete on all tables in schema public to pusula_app;
revoke all on local_credentials,auth_sessions,auth_rate_limits,schema_migrations from pusula_app;

alter table profiles enable row level security;
create policy profile_read on profiles for select using(id=app_user_id() or exists(
  select 1 from enrollments e where e.user_id=profiles.id and owns_course(e.course_id)));
create policy profile_update on profiles for update using(id=app_user_id()) with check(id=app_user_id());
revoke update on profiles from pusula_app;
grant update(display_name,university,public_profile,avatar) on profiles to pusula_app;
alter table courses enable row level security;
create policy course_read on courses for select using(can_read_course(id));
create policy course_write on courses for all using(owner_id=app_user_id() and verified_teacher()) with check(owner_id=app_user_id() and verified_teacher());
alter table enrollments enable row level security;
create policy enrollment_read on enrollments for select using(user_id=app_user_id() or owns_course(course_id));
create policy enrollment_owner on enrollments for all using(owns_course(course_id)) with check(owns_course(course_id));
alter table class_invites enable row level security;
create policy invite_owner on class_invites for all using(owns_course(course_id)) with check(owns_course(course_id));

do $$ declare tbl text; begin
  foreach tbl in array array['curriculum_versions','topics','objectives','activities','activity_versions'] loop
    execute format('alter table %I enable row level security',tbl);
    execute format('create policy read_course on %I for select using(can_read_course(course_id))',tbl);
    execute format('create policy owner_write on %I for all using(owns_course(course_id)) with check(owns_course(course_id))',tbl);
  end loop;
  foreach tbl in array array['learning_sessions','attempts','mistake_items','objective_mastery','gap_reports'] loop
    execute format('alter table %I enable row level security',tbl);
    execute format('create policy read_learning on %I for select using(user_id=app_user_id() or owns_course(course_id))',tbl);
    execute format('create policy write_learning on %I for all using(user_id=app_user_id()) with check(user_id=app_user_id() and (course_id is null or enrolled_course(course_id)))',tbl);
  end loop;
end $$;

-- Enrolment by code is the only student write; never accept a supplied course ID.
create function join_by_code(invite_code text) returns uuid language plpgsql security definer set search_path=public as $$
declare target uuid; begin
  if not exists(select 1 from profiles where id=app_user_id() and role='student') then raise exception 'STUDENT_ONLY'; end if;
  select i.course_id into target from class_invites i join courses c on c.id=i.course_id
    where i.code=upper(invite_code) and not i.revoked and i.expires_at>now() and not c.archived;
  if target is null then raise exception 'INVALID_INVITE'; end if;
  insert into enrollments(course_id,user_id) values(target,app_user_id()) on conflict do nothing;
  return target;
end $$;
revoke all on function join_by_code(text) from public;
grant execute on function join_by_code(text) to pusula_app;

-- Supabase clients cannot fetch answer keys or modify server ledgers directly.
do $$ begin
  if exists(select 1 from pg_roles where rolname='anon') then
    revoke all on all tables in schema public from anon;
  end if;
  if exists(select 1 from pg_roles where rolname='authenticated') then
    revoke all on all tables in schema public from authenticated;
  end if;
end $$;
