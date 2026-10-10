alter table challenges add column mode text not null default 'classic' check(mode in ('classic','rapid'));
alter table challenges add column duration_seconds integer not null default 180 check(duration_seconds between 30 and 600);
alter table challenges add column started_at timestamptz;
alter table challenge_participants add column started_at timestamptz;
alter table challenge_participants add column elapsed_seconds integer;
-- Existing finished games keep their recorded results and are not paid retroactively.
update challenge_participants p set started_at=s.created_at from learning_sessions s where s.id=p.session_id;

create function create_timed_challenge(target_course uuid,opponent uuid,request_id uuid,match_mode text) returns challenges language plpgsql security definer set search_path=public as $$
declare c challenges;begin
 if match_mode not in ('classic','rapid') then raise exception 'INVALID_MATCH_MODE';end if;
 perform pg_advisory_xact_lock(hashtext('challenge-create:'||app_user_id()));
 select * into c from challenges where request_key=request_id;
 if c.id is not null then
   if c.mode!=match_mode then raise exception 'CHALLENGE_REQUEST_CONFLICT';end if;
   return create_challenge(target_course,opponent,request_id);
 end if;
 c:=create_challenge(target_course,opponent,request_id);
 update challenges set mode=match_mode,duration_seconds=case when match_mode='rapid' then 120 else 180 end,
   expires_at=case when match_mode='rapid' then now()+interval '15 minutes' else expires_at end where id=c.id returning * into c;
 return c;
end $$;
revoke all on function create_timed_challenge(uuid,uuid,uuid,text) from public;grant execute on function create_timed_challenge(uuid,uuid,uuid,text) to pusula_app;

create or replace function link_challenge_session(target uuid,target_session uuid) returns void language plpgsql security definer set search_path=public as $$
declare c challenges;s learning_sessions;p challenge_participants;begin
 c:=lock_challenge(target);
 select * into p from challenge_participants where challenge_id=c.id and user_id=app_user_id();
 if p.session_id is not null then raise exception 'CHALLENGE_ALREADY_STARTED';end if;
 select * into s from learning_sessions where id=target_session and user_id=app_user_id() and mode='challenge' and status='in_progress' and cursor=0;
 if s.id is null or s.course_id!=c.course_id or s.items!=c.items then raise exception 'CHALLENGE_PACKET_MISMATCH';end if;
 update learning_sessions set challenge_id=c.id,curriculum_refs=c.curriculum_refs where id=s.id;
 update challenge_participants set session_id=s.id,started_at=case when c.mode='classic' then clock_timestamp() else null end where challenge_id=c.id and user_id=s.user_id;
 if c.mode='rapid' and (select count(*) from challenge_participants where challenge_id=c.id and session_id is not null)=2 then
   update challenges set started_at=clock_timestamp()+interval '3 seconds' where id=c.id returning * into c;
   update challenge_participants set started_at=c.started_at where challenge_id=c.id;
 end if;
end $$;

create function finalize_timed_participant(target_session uuid) returns void language plpgsql security definer set search_path=public as $$
declare s learning_sessions;c challenges;p challenge_participants;winner uuid;recipient record;n integer;begin
 select * into s from learning_sessions where id=target_session and mode='challenge' and status='completed';
 if s.id is null or s.challenge_id is null then raise exception 'CHALLENGE_COMPLETED_SESSION_ONLY';end if;
 select * into c from challenges where id=s.challenge_id for update;
 if c.status='completed' then return;end if;
 if c.status!='accepted' then raise exception 'CHALLENGE_NOT_ACCEPTED';end if;
 select * into p from challenge_participants where challenge_id=c.id and user_id=s.user_id;
 n:=jsonb_array_length(c.items);
 if s.items!=c.items or ((select count(*) from attempts where session_id=s.id and context='first')<n
   and c.expires_at>clock_timestamp() and (p.started_at is null or p.started_at+make_interval(secs=>c.duration_seconds)>clock_timestamp())) then raise exception 'CHALLENGE_PACKET_MISMATCH';end if;
 update challenge_participants set score=coalesce((select round(sum(score)::numeric/n,4) from attempts where session_id=s.id and context='first'),0),
   correct_count=s.first_correct,completed_at=s.completed_at,
   elapsed_seconds=case when p.started_at is null then c.duration_seconds else least(c.duration_seconds,greatest(0,floor(extract(epoch from s.completed_at-p.started_at))::int)) end
   where challenge_id=c.id and user_id=s.user_id and session_id=s.id and completed_at is null;
 if (select count(*) from challenge_participants where challenge_id=c.id and completed_at is not null)=2 then
   select q.user_id into winner from challenge_participants q join challenge_participants other on other.challenge_id=q.challenge_id and other.user_id!=q.user_id
     where q.challenge_id=c.id and (q.score>other.score or (q.score=other.score and q.elapsed_seconds<other.elapsed_seconds));
   update challenges set status='completed',winner_id=winner,completed_at=clock_timestamp() where id=c.id;
   -- Consistent wallet lock order; cap applies to each participant, with one immutable event per game.
   for recipient in select * from challenge_participants where challenge_id=c.id order by user_id loop
     if not exists(select 1 from attempts where session_id=recipient.session_id and context='first') then continue;end if;
     insert into reward_accounts(user_id) values(recipient.user_id) on conflict do nothing;
     perform user_id from reward_accounts where user_id=recipient.user_id for update;
     if (select count(*) from xp_transactions where user_id=recipient.user_id and reason in ('challenge_win','challenge_complete') and (created_at at time zone 'Europe/Istanbul')::date=(now() at time zone 'Europe/Istanbul')::date)<5 then
       perform issue_reward(recipient.user_id,'challenge:'||c.id,case when recipient.user_id=winner then 'challenge_win' else 'challenge_complete' end,c.course_id,
         case when recipient.user_id=winner then 30 else 15 end,0,0,case when recipient.user_id=winner then 5 else 0 end);
     end if;
   end loop;
 end if;
end $$;
revoke all on function finalize_timed_participant(uuid) from public;

create or replace function finish_challenge_session(target_session uuid) returns void language plpgsql security definer set search_path=public as $$
begin
 if not exists(select 1 from learning_sessions where id=target_session and user_id=app_user_id()) then raise exception 'CHALLENGE_NOT_FOUND';end if;
 perform finalize_timed_participant(target_session);
end $$;

create function settle_timed_challenge(target uuid) returns void language plpgsql security definer set search_path=public as $$
declare c challenges;p record;begin
 select * into c from challenges where id=target and (creator_id=app_user_id() or recipient_id=app_user_id()) for update;
 if c.id is null then raise exception 'CHALLENGE_NOT_FOUND';end if;
 if c.status!='accepted' then return;end if;
 for p in select * from challenge_participants where challenge_id=c.id and completed_at is null order by user_id loop
   if c.expires_at>clock_timestamp() and (p.started_at is null or p.started_at+make_interval(secs=>c.duration_seconds)>clock_timestamp()) then continue;end if;
   if p.session_id is null then
     update challenge_participants set score=0,correct_count=0,elapsed_seconds=c.duration_seconds,completed_at=clock_timestamp() where challenge_id=c.id and user_id=p.user_id;
   else
     update learning_sessions set status='completed',interrupted_from=null,completed_at=least(clock_timestamp(),coalesce(p.started_at+make_interval(secs=>c.duration_seconds),c.expires_at)) where id=p.session_id and status!='completed';
   end if;
 end loop;
 for p in select session_id from challenge_participants where challenge_id=c.id and session_id is not null order by user_id loop
   if exists(select 1 from learning_sessions where id=p.session_id and status='completed') then perform finalize_timed_participant(p.session_id);end if;
 end loop;
 if not exists(select 1 from challenge_participants where challenge_id=c.id and session_id is not null) and c.expires_at<=clock_timestamp() then
   update challenges set status='completed',completed_at=clock_timestamp() where id=c.id;
 end if;
end $$;
revoke all on function settle_timed_challenge(uuid) from public;grant execute on function settle_timed_challenge(uuid) to pusula_app;

create table match_queue(user_id uuid primary key references profiles(id),course_id uuid not null references courses(id),mode text not null check(mode in ('classic','rapid')),request_key uuid not null,expires_at timestamptz not null);
alter table match_queue enable row level security;
create policy own_match_queue on match_queue for select using(user_id=app_user_id());
grant select on match_queue to pusula_app;
create function find_match(target_course uuid,match_mode text,request_id uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare who uuid:=app_user_id();opponent uuid;c challenges;begin
 if match_mode not in ('classic','rapid') or not exists(select 1 from profiles p join enrollments e on e.user_id=p.id join courses co on co.id=e.course_id where p.id=who and p.role='student' and e.course_id=target_course and not co.archived) then raise exception 'CLASSMATE_ONLY';end if;
 perform pg_advisory_xact_lock(hashtext('match-queue:'||target_course||':'||match_mode));
 select * into c from challenges where request_key=request_id;
 if c.id is not null then
   if c.creator_id!=who or c.course_id!=target_course or c.mode!=match_mode then raise exception 'CHALLENGE_REQUEST_CONFLICT';end if;return c.id;
 end if;
 delete from match_queue where expires_at<=clock_timestamp();
 select q.user_id into opponent from match_queue q join enrollments e on e.user_id=q.user_id and e.course_id=q.course_id where q.course_id=target_course and q.mode=match_mode and q.user_id!=who order by q.expires_at limit 1 for update of q;
 if opponent is null then
   insert into match_queue values(who,target_course,match_mode,request_id,clock_timestamp()+interval '2 minutes') on conflict(user_id) do update set course_id=excluded.course_id,mode=excluded.mode,request_key=excluded.request_key,expires_at=excluded.expires_at;
   return null;
 end if;
 c:=create_timed_challenge(target_course,opponent,request_id,match_mode);
 update challenges set status='accepted' where id=c.id;
 delete from match_queue where user_id in (who,opponent);
 return c.id;
end $$;
revoke all on function find_match(uuid,text,uuid) from public;grant execute on function find_match(uuid,text,uuid) to pusula_app;
create function cancel_match_search() returns void language sql security definer set search_path=public as $$ delete from match_queue where user_id=app_user_id() $$;
revoke all on function cancel_match_search() from public;grant execute on function cancel_match_search() to pusula_app;

create function lock_match_for_answer(target uuid) returns void language plpgsql security definer set search_path=public as $$
begin
 perform id from challenges where id=target and (creator_id=app_user_id() or recipient_id=app_user_id()) for update;
 if not found then raise exception 'CHALLENGE_NOT_FOUND';end if;
end $$;
revoke all on function lock_match_for_answer(uuid) from public;grant execute on function lock_match_for_answer(uuid) to pusula_app;
