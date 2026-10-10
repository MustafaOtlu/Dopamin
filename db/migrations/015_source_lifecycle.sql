alter table documents add column source_id uuid not null default gen_random_uuid();
alter table documents add column source_version integer not null default 1 check(source_version>0);
alter table documents add column replaces_id uuid references documents(id);
alter table documents add column superseded_by uuid references documents(id);
alter table documents add column deleted_at timestamptz;
alter table documents add column purge_after timestamptz;
alter table files add column purged_at timestamptz;
alter table documents drop constraint documents_course_id_sha256_key;
create unique index document_active_hash on documents(course_id,sha256) where status!='deleted';
create unique index document_source_version on documents(source_id,source_version);
alter table background_jobs drop constraint background_jobs_kind_check;
alter table background_jobs add constraint background_jobs_kind_check check(kind in ('pdf_extract','ai_analyze','ai_generate','file_cleanup'));
drop policy document_student_read on documents;
create policy document_student_read on documents for select using(enrolled_course(course_id) and student_access and status='ready' and superseded_by is null);

-- Existing logically removed files also enter the retention queue.
update documents set deleted_at=now(),purge_after=now()+interval '30 days',student_access=false where status='deleted';
insert into background_jobs(course_id,created_by,kind,payload,available_at)
select d.course_id,c.owner_id,'file_cleanup',jsonb_build_object('document_id',d.id),d.purge_after
from documents d join courses c on c.id=d.course_id where d.status='deleted';
