alter table courses add column source_mode text not null default 'documents_only' check(source_mode in ('documents_only','approved_web'));
alter table courses add column source_policy_revision integer not null default 0;
alter table source_permissions add column revision integer not null default 1;
alter table source_permissions add column title text not null default '';
alter table source_permissions add column updated_at timestamptz not null default now();
alter table source_permissions add constraint source_permission_course unique(id,course_id);
alter table documents add column source_kind text not null default 'pdf' check(source_kind in ('pdf','web'));
alter table documents add column source_permission_id uuid;
alter table documents add column source_permission_revision integer;
alter table documents add column source_policy_revision integer;
alter table documents add column source_url text;
alter table documents add column fetched_at timestamptz;
alter table documents add constraint document_web_permission foreign key(source_permission_id,course_id) references source_permissions(id,course_id);
alter table documents add constraint document_source_shape check(
  (source_kind='pdf' and source_permission_id is null and source_url is null)
  or (source_kind='web' and source_permission_id is not null and source_url is not null and fetched_at is not null and source_permission_revision is not null and source_policy_revision is not null)
);
alter table background_jobs drop constraint background_jobs_kind_check;
alter table background_jobs add constraint background_jobs_kind_check check(kind in ('pdf_extract','web_fetch','ai_analyze','ai_generate','file_cleanup'));

-- Boolean authorization only; the URL list remains private to the course owner.
create function web_source_allowed(p_course uuid,p_permission uuid,p_revision integer,p_policy integer)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from source_permissions p join courses c on c.id=p.course_id
 where p.id=p_permission and p.course_id=p_course and p.enabled and p.revision=p_revision
 and c.source_mode='approved_web' and c.source_policy_revision=p_policy and not c.archived)
$$;
revoke all on function web_source_allowed(uuid,uuid,integer,integer) from public;
grant execute on function web_source_allowed(uuid,uuid,integer,integer) to pusula_app;
drop policy document_student_read on documents;
create policy document_student_read on documents for select using(
 enrolled_course(course_id) and student_access and status='ready' and superseded_by is null
 and (source_kind='pdf' or web_source_allowed(course_id,source_permission_id,source_permission_revision,source_policy_revision))
);
