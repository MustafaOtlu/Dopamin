create table files (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id),
  uploaded_by uuid not null references profiles(id),
  purpose text not null check(purpose in ('document','image','submission')),
  storage_key text not null unique,
  original_name text not null,
  mime_type text not null,
  byte_size integer not null check(byte_size>0 and byte_size<=20971520),
  sha256 text not null,
  student_access boolean not null default false,
  created_at timestamptz not null default now()
);
create table documents (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id),
  file_id uuid not null unique references files(id),
  sha256 text not null,
  title text not null,
  status text not null default 'queued' check(status in ('queued','processing','ready','needs_ocr','failed','deleted')),
  page_count integer,
  student_access boolean not null default false,
  error_message text,
  created_at timestamptz not null default now(),
  unique(course_id,sha256)
);
create table document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  course_id uuid not null references courses(id),
  page integer not null check(page>0),
  chunk_index integer not null,
  text text not null,
  heading text,
  unique(document_id,chunk_index)
);
create table source_permissions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id),
  url text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique(course_id,url)
);
create table background_jobs (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id),
  created_by uuid not null references profiles(id),
  kind text not null check(kind in ('pdf_extract','ai_analyze','ai_generate')),
  payload jsonb not null,
  status text not null default 'queued' check(status in ('queued','processing','completed','failed','needs_input')),
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  available_at timestamptz not null default now(),
  leased_until timestamptz,
  result jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index job_queue_idx on background_jobs(status,available_at);
create table curriculum_drafts (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id),
  job_id uuid references background_jobs(id),
  data jsonb not null,
  status text not null default 'needs_review' check(status in ('needs_review','clarifying','approved','rejected')),
  origin text not null check(origin in ('extracted','ai')),
  created_at timestamptz not null default now()
);
create table clarification_questions (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references curriculum_drafts(id),
  course_id uuid not null references courses(id),
  topic text not null,
  question text not null,
  reason text not null,
  options jsonb not null default '[]',
  changes_field text not null,
  answer text,
  answered_at timestamptz
);
create table generation_reviews (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id),
  activity_id uuid not null references activities(id),
  job_id uuid references background_jobs(id),
  checks jsonb not null,
  status text not null default 'pending' check(status in ('pending','approved','rejected')),
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz
);
create table ai_usage (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id),
  job_id uuid references background_jobs(id),
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  estimated_cost_usd numeric,
  created_at timestamptz not null default now()
);
grant select,insert,update,delete on files,documents,document_chunks,source_permissions,background_jobs,curriculum_drafts,clarification_questions,generation_reviews,ai_usage to pusula_app;
do $$ declare tbl text; begin
  foreach tbl in array array['documents','document_chunks','source_permissions','background_jobs','curriculum_drafts','clarification_questions','generation_reviews','ai_usage'] loop
    execute format('alter table %I enable row level security',tbl);
    execute format('create policy owner_access on %I for all using(owns_course(course_id)) with check(owns_course(course_id))',tbl);
  end loop;
end $$;
create policy document_student_read on documents for select using(enrolled_course(course_id) and student_access and status='ready');
alter table files enable row level security;
create policy file_read on files for select using(owns_course(course_id) or uploaded_by=app_user_id() or (enrolled_course(course_id) and student_access));
create policy file_insert on files for insert with check(uploaded_by=app_user_id() and (owns_course(course_id) or (enrolled_course(course_id) and purpose='submission')));
create policy file_owner_update on files for update using(owns_course(course_id)) with check(owns_course(course_id));
create policy file_delete on files for delete using(owns_course(course_id) or uploaded_by=app_user_id());
alter table curriculum_versions add column snapshot jsonb not null default '[]';
