create table ai_cost_requests (
  id uuid primary key,course_id uuid not null references courses(id),job_id uuid references background_jobs(id),
  model text not null,phase text not null,day date not null,
  status text not null check(status in ('reserved','settled','unknown')),
  reserved_usd numeric not null check(reserved_usd>=0),actual_usd numeric check(actual_usd>=0),
  input_rate numeric not null check(input_rate>=0),output_rate numeric not null check(output_rate>=0),
  created_at timestamptz not null default now(),settled_at timestamptz
);
create index ai_cost_day_idx on ai_cost_requests(day);
alter table ai_cost_requests enable row level security;
create policy teacher_cost_read on ai_cost_requests for select using(owns_course(course_id));
grant select on ai_cost_requests to pusula_app;
alter table ai_usage add column request_id uuid unique references ai_cost_requests(id);
revoke insert,update,delete on ai_usage from pusula_app;
