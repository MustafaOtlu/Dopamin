create table assignments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id),
  created_by uuid not null references profiles(id),
  title text not null,
  description text not null default '',
  kind text not null check(kind in ('interactive','traditional')),
  status text not null default 'draft' check(status in ('draft','published','closed')),
  due_at timestamptz not null,
  allow_late boolean not null default false,
  activity_version_ids jsonb not null default '[]',
  target_ids jsonb not null default '[]',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique(id,course_id)
);
create table assignment_targets (
  assignment_id uuid not null references assignments(id),
  user_id uuid not null references profiles(id),
  primary key(assignment_id,user_id)
);
create function can_read_assignment(target uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from assignments a where a.id=target and
    (owns_course(a.course_id) or (a.status in ('published','closed') and enrolled_course(a.course_id) and exists(select 1 from assignment_targets t where t.assignment_id=a.id and t.user_id=app_user_id()))))
$$;
revoke all on function can_read_assignment(uuid) from public;
grant execute on function can_read_assignment(uuid) to pusula_app;
create table submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null,
  course_id uuid not null,
  user_id uuid not null references profiles(id),
  status text not null check(status in ('in_progress','submitted','reviewed','returned','withdrawn')),
  current_revision integer not null default 0,
  session_id uuid unique references learning_sessions(id),
  submitted_at timestamptz,
  unique(assignment_id,user_id),
  unique(id,course_id),
  foreign key(assignment_id,course_id) references assignments(id,course_id)
);
alter table files add column assignment_id uuid references assignments(id);
create table submission_versions (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions(id),
  revision integer not null,
  user_id uuid not null references profiles(id),
  course_id uuid not null references courses(id),
  request_key uuid unique not null,
  text text not null default '',
  link text not null default '',
  file_id uuid references files(id),
  session_id uuid unique references learning_sessions(id),
  first_score numeric,
  late boolean not null,
  submitted_at timestamptz not null default now(),
  unique(submission_id,revision),
  foreign key(submission_id,course_id) references submissions(id,course_id)
);
create table assignment_feedback (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions(id),
  revision integer not null,
  course_id uuid not null references courses(id),
  reviewer_id uuid not null references profiles(id),
  grade numeric check(grade>=0 and grade<=100),
  feedback text not null,
  returned boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key(submission_id,revision) references submission_versions(submission_id,revision),
  foreign key(submission_id,course_id) references submissions(id,course_id),
  unique(submission_id,revision)
);
create table assignment_resources (
  assignment_id uuid not null references assignments(id),
  file_id uuid not null references files(id),
  course_id uuid not null references courses(id),
  primary key(assignment_id,file_id),
  foreign key(assignment_id,course_id) references assignments(id,course_id)
);
grant select,insert,update,delete on assignments,assignment_targets,submissions,submission_versions,assignment_feedback,assignment_resources to pusula_app;
alter table assignments enable row level security;
create policy assignment_read on assignments for select using(can_read_assignment(id));
create policy assignment_manage on assignments for all using(owns_course(course_id)) with check(owns_course(course_id) and created_by=app_user_id());
alter table assignment_targets enable row level security;
create policy target_read on assignment_targets for select using(user_id=app_user_id() or exists(select 1 from assignments a where a.id=assignment_id and owns_course(a.course_id)));
create policy target_manage on assignment_targets for all using(exists(select 1 from assignments a where a.id=assignment_id and owns_course(a.course_id))) with check(exists(select 1 from assignments a where a.id=assignment_id and owns_course(a.course_id)));
alter table submissions enable row level security;
create policy submission_read on submissions for select using(owns_course(course_id) or user_id=app_user_id());
create policy submission_insert on submissions for insert with check(user_id=app_user_id() and can_read_assignment(assignment_id));
create policy submission_update on submissions for update using(owns_course(course_id) or (user_id=app_user_id() and can_read_assignment(assignment_id))) with check(owns_course(course_id) or (user_id=app_user_id() and can_read_assignment(assignment_id)));
alter table submission_versions enable row level security;
create policy revision_read on submission_versions for select using(owns_course(course_id) or user_id=app_user_id());
create policy revision_insert on submission_versions for insert with check(user_id=app_user_id() and exists(select 1 from submissions s where s.id=submission_id and s.user_id=app_user_id() and can_read_assignment(s.assignment_id)));
alter table assignment_feedback enable row level security;
create policy feedback_read on assignment_feedback for select using(owns_course(course_id) or exists(select 1 from submissions s where s.id=submission_id and s.user_id=app_user_id()));
create policy feedback_insert on assignment_feedback for insert with check(owns_course(course_id) and reviewer_id=app_user_id());
alter table assignment_resources enable row level security;
create policy resource_read on assignment_resources for select using(can_read_assignment(assignment_id));
create policy resource_manage on assignment_resources for all using(owns_course(course_id)) with check(owns_course(course_id));
create policy assignment_file_read on files for select using(exists(select 1 from assignment_resources r where r.file_id=id and can_read_assignment(r.assignment_id)));
create policy assignment_document_read on documents for select using(status='ready' and exists(select 1 from assignment_resources r where r.file_id=documents.file_id and can_read_assignment(r.assignment_id)));
create index submissions_course_idx on submissions(course_id,user_id);
create index targets_user_idx on assignment_targets(user_id,assignment_id);
