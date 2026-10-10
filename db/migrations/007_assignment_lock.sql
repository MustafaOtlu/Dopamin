-- Students may lock an authorized assignment for a submission, without gaining UPDATE access.
create function lock_assignment(target uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  if not can_read_assignment(target) then raise exception 'ASSIGNMENT_ACCESS_DENIED'; end if;
  perform id from assignments where id=target for share;
end $$;
revoke all on function lock_assignment(uuid) from public;
grant execute on function lock_assignment(uuid) to pusula_app;
