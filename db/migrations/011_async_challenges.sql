create table challenges (
  id uuid primary key default gen_random_uuid(),course_id uuid not null references courses(id),
  creator_id uuid not null references profiles(id),recipient_id uuid not null references profiles(id),
  request_key uuid not null unique,status text not null default 'pending' check(status in ('pending','accepted','rejected','cancelled','completed')),
  items jsonb not null check(jsonb_array_length(items) between 1 and 5),curriculum_refs jsonb not null,
  created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '7 days',
  completed_at timestamptz,winner_id uuid references profiles(id),check(creator_id!=recipient_id)
);
create table challenge_participants (
  challenge_id uuid not null references challenges(id),user_id uuid not null references profiles(id),
  session_id uuid unique references learning_sessions(id),score numeric(5,4) check(score between 0 and 1),correct_count integer,
  completed_at timestamptz,primary key(challenge_id,user_id)
);
alter table learning_sessions add column challenge_id uuid references challenges(id);
create index challenge_user_status_idx on challenges(creator_id,recipient_id,status,created_at);
alter table challenges enable row level security;
create policy challenge_private on challenges for select using(creator_id=app_user_id() or recipient_id=app_user_id());
alter table challenge_participants enable row level security;
create policy own_challenge_progress on challenge_participants for select using(user_id=app_user_id());
grant select on challenges,challenge_participants to pusula_app;

create function create_challenge(target_course uuid,opponent uuid,request_id uuid) returns challenges language plpgsql security definer set search_path=public as $$
declare who uuid:=app_user_id();result challenges;packet jsonb;refs jsonb;begin
  perform pg_advisory_xact_lock(hashtext('challenge-create:'||who));
  select * into result from challenges where request_key=request_id;
  if result.id is not null then
    if result.creator_id!=who or result.course_id!=target_course or result.recipient_id!=opponent then raise exception 'CHALLENGE_REQUEST_CONFLICT';end if;return result;
  end if;
  if who=opponent or not exists(select 1 from profiles where id=who and role='student') or not exists(select 1 from profiles where id=opponent and role='student') then raise exception 'CLASSMATE_ONLY';end if;
  if not exists(select 1 from courses where id=target_course and not archived)
    or not exists(select 1 from enrollments where user_id=who and course_id=target_course)
    or not exists(select 1 from enrollments where user_id=opponent and course_id=target_course) then raise exception 'CLASSMATE_ONLY';end if;
  if (select count(*) from challenges where creator_id=who and created_at>now()-interval '24 hours')>=10 then raise exception 'CHALLENGE_DAILY_LIMIT';end if;
  select jsonb_agg(q.id order by q.position),jsonb_object_agg(q.id,q.curriculum_id) into packet,refs from
    (select v.id,t.curriculum_id,md5(v.id::text||request_id::text) position from activities a
      join activity_versions v on v.activity_id=a.id and v.version=a.published_version
      join objectives o on o.id=v.objective_id join topics t on t.id=o.topic_id join curriculum_versions cv on cv.id=t.curriculum_id
      where a.course_id=target_course and a.status!='archived' and v.published_at is not null and t.accessible and cv.status='published'
      order by position limit 5) q;
  if packet is null then raise exception 'CHALLENGE_NO_CONTENT';end if;
  insert into challenges(course_id,creator_id,recipient_id,request_key,items,curriculum_refs) values(target_course,who,opponent,request_id,packet,refs) returning * into result;
  insert into challenge_participants(challenge_id,user_id) values(result.id,who),(result.id,opponent);
  return result;
end $$;
revoke all on function create_challenge(uuid,uuid,uuid) from public;grant execute on function create_challenge(uuid,uuid,uuid) to pusula_app;

create function respond_challenge(target uuid,action text) returns challenges language plpgsql security definer set search_path=public as $$
declare who uuid:=app_user_id();c challenges;desired text;begin
  select * into c from challenges where id=target and (creator_id=who or recipient_id=who) for update;
  if c.id is null then raise exception 'CHALLENGE_NOT_FOUND';end if;
  if action='accept' and c.recipient_id=who then desired:='accepted';
  elsif action='reject' and c.recipient_id=who then desired:='rejected';
  elsif action='cancel' and c.creator_id=who then desired:='cancelled';
  else raise exception 'CHALLENGE_ACTION_FORBIDDEN';end if;
  if c.status=desired then return c;end if;
  if c.status!='pending' then raise exception 'CHALLENGE_NOT_PENDING';end if;
  if c.expires_at<=now() then raise exception 'CHALLENGE_EXPIRED';end if;
  if desired='accepted' and (not exists(select 1 from courses where id=c.course_id and not archived)
    or (select count(*) from enrollments where course_id=c.course_id and user_id in (c.creator_id,c.recipient_id))!=2) then raise exception 'CLASSMATE_ONLY';end if;
  update challenges set status=desired where id=c.id returning * into c;return c;
end $$;
revoke all on function respond_challenge(uuid,text) from public;grant execute on function respond_challenge(uuid,text) to pusula_app;

create function lock_challenge(target uuid) returns challenges language plpgsql security definer set search_path=public as $$
declare c challenges;begin
  select * into c from challenges where id=target and (creator_id=app_user_id() or recipient_id=app_user_id()) for update;
  if c.id is null then raise exception 'CHALLENGE_NOT_FOUND';end if;
  if c.status!='accepted' then raise exception 'CHALLENGE_NOT_ACCEPTED';end if;
  if c.expires_at<=now() then raise exception 'CHALLENGE_EXPIRED';end if;
  if not exists(select 1 from courses where id=c.course_id and not archived)
    or not exists(select 1 from enrollments where course_id=c.course_id and user_id=app_user_id()) then raise exception 'CLASSMATE_ONLY';end if;
  return c;
end $$;
revoke all on function lock_challenge(uuid) from public;grant execute on function lock_challenge(uuid) to pusula_app;

create function link_challenge_session(target uuid,target_session uuid) returns void language plpgsql security definer set search_path=public as $$
declare c challenges;s learning_sessions;p challenge_participants;begin
  c:=lock_challenge(target);
  select * into p from challenge_participants where challenge_id=c.id and user_id=app_user_id();
  if p.session_id is not null then raise exception 'CHALLENGE_ALREADY_STARTED';end if;
  select * into s from learning_sessions where id=target_session and user_id=app_user_id() and mode='challenge' and status='in_progress' and cursor=0;
  if s.id is null or s.course_id!=c.course_id or s.items!=c.items then raise exception 'CHALLENGE_PACKET_MISMATCH';end if;
  update learning_sessions set challenge_id=c.id,curriculum_refs=c.curriculum_refs where id=s.id;
  update challenge_participants set session_id=s.id where challenge_id=c.id and user_id=s.user_id;
end $$;
revoke all on function link_challenge_session(uuid,uuid) from public;grant execute on function link_challenge_session(uuid,uuid) to pusula_app;

create function finish_challenge_session(target_session uuid) returns void language plpgsql security definer set search_path=public as $$
declare s learning_sessions;c challenges;winner uuid;begin
  select * into s from learning_sessions where id=target_session and user_id=app_user_id() and mode='challenge' and status='completed';
  if s.id is null or s.challenge_id is null then raise exception 'CHALLENGE_COMPLETED_SESSION_ONLY';end if;
  c:=lock_challenge(s.challenge_id);
  if s.items!=c.items or (select count(*) from attempts where session_id=s.id and user_id=s.user_id and context='first')!=jsonb_array_length(c.items) then raise exception 'CHALLENGE_PACKET_MISMATCH';end if;
  update challenge_participants set score=(select round(avg(score)::numeric,4) from attempts where session_id=s.id and context='first'),correct_count=s.first_correct,completed_at=s.completed_at
    where challenge_id=c.id and user_id=s.user_id and session_id=s.id and completed_at is null;
  if (select count(*) from challenge_participants where challenge_id=c.id and completed_at is not null)=2 then
    select p.user_id into winner from challenge_participants p where p.challenge_id=c.id and p.score>(select other.score from challenge_participants other where other.challenge_id=c.id and other.user_id!=p.user_id);
    update challenges set status='completed',winner_id=winner,completed_at=now() where id=c.id;
  end if;
end $$;
revoke all on function finish_challenge_session(uuid) from public;grant execute on function finish_challenge_session(uuid) to pusula_app;

create function challenge_results(target uuid) returns table(user_id uuid,display_name text,score numeric,correct_count integer,completed boolean) language plpgsql stable security definer set search_path=public as $$
declare c challenges;begin
  select * into c from challenges where id=target and (creator_id=app_user_id() or recipient_id=app_user_id());
  if c.id is null then raise exception 'CHALLENGE_NOT_FOUND';end if;
  return query select p.user_id,u.display_name,case when c.status='completed' then p.score else null end,case when c.status='completed' then p.correct_count else null end,p.completed_at is not null
    from challenge_participants p join profiles u on u.id=p.user_id where p.challenge_id=c.id order by p.user_id;
end $$;
revoke all on function challenge_results(uuid) from public;grant execute on function challenge_results(uuid) to pusula_app;
