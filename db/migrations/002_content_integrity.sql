drop policy read_course on activities;
create policy read_course on activities for select using(owns_course(course_id) or (enrolled_course(course_id) and status='published'));
drop policy read_course on activity_versions;
create policy read_course on activity_versions for select using(owns_course(course_id) or (enrolled_course(course_id) and published_at is not null));
create function protect_published_version() returns trigger language plpgsql as $$
begin
  if old.published_at is not null then raise exception 'PUBLISHED_VERSION_IMMUTABLE'; end if;
  return new;
end $$;
create trigger immutable_activity before update or delete on activity_versions for each row execute function protect_published_version();
