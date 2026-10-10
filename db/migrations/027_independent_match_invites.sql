-- Creator can play a classic turn immediately, or wait in a rapid lobby before acceptance.
-- Recipient still needs to accept. Pending, rejected and cancelled games never issue rewards.
create or replace function lock_challenge(target uuid) returns challenges language plpgsql security definer set search_path=public as $$
declare c challenges;begin
  select * into c from challenges where id=target and (creator_id=app_user_id() or recipient_id=app_user_id()) for update;
  if c.id is null then raise exception 'CHALLENGE_NOT_FOUND';end if;
  if c.status!='accepted' and not (c.status='pending' and c.creator_id=app_user_id()) then raise exception 'CHALLENGE_NOT_ACCEPTED';end if;
  if c.expires_at<=now() then raise exception 'CHALLENGE_EXPIRED';end if;
  if not exists(select 1 from courses where id=c.course_id and not archived)
    or not exists(select 1 from enrollments where course_id=c.course_id and user_id=app_user_id()) then raise exception 'CLASSMATE_ONLY';end if;
  return c;
end $$;

create or replace function respond_challenge(target uuid,action text) returns challenges language plpgsql security definer set search_path=public as $$
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
  update challenges set status=desired where id=c.id returning * into c;
  if desired in ('rejected','cancelled') then
    update learning_sessions set status='completed',interrupted_from=null,completed_at=clock_timestamp() where challenge_id=c.id and status!='completed';
  end if;
  return c;
end $$;

create or replace function finalize_timed_participant(target_session uuid) returns void language plpgsql security definer set search_path=public as $$
declare s learning_sessions;c challenges;p challenge_participants;winner uuid;recipient record;n integer;begin
 select * into s from learning_sessions where id=target_session and mode='challenge' and status='completed';
 if s.id is null or s.challenge_id is null then raise exception 'CHALLENGE_COMPLETED_SESSION_ONLY';end if;
 select * into c from challenges where id=s.challenge_id for update;
 if c.status='completed' then return;end if;
 if c.status!='accepted' and not (c.status='pending' and c.mode='classic' and s.user_id=c.creator_id) then raise exception 'CHALLENGE_NOT_ACCEPTED';end if;
 select * into p from challenge_participants where challenge_id=c.id and user_id=s.user_id;
 n:=jsonb_array_length(c.items);
 if s.items!=c.items or ((select count(*) from attempts where session_id=s.id and context='first')<n
   and c.expires_at>clock_timestamp() and (p.started_at is null or p.started_at+make_interval(secs=>c.duration_seconds)>clock_timestamp())) then raise exception 'CHALLENGE_PACKET_MISMATCH';end if;
 update challenge_participants set score=coalesce((select round(sum(score)::numeric/n,4) from attempts where session_id=s.id and context='first'),0),
   correct_count=s.first_correct,completed_at=s.completed_at,
   elapsed_seconds=case when p.started_at is null then c.duration_seconds else least(c.duration_seconds,greatest(0,floor(extract(epoch from s.completed_at-p.started_at))::int)) end
   where challenge_id=c.id and user_id=s.user_id and session_id=s.id and completed_at is null;
 if c.status='accepted' and (select count(*) from challenge_participants where challenge_id=c.id and completed_at is not null)=2 then
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

create or replace function settle_timed_challenge(target uuid) returns void language plpgsql security definer set search_path=public as $$
declare c challenges;p record;begin
 select * into c from challenges where id=target and (creator_id=app_user_id() or recipient_id=app_user_id()) for update;
 if c.id is null then raise exception 'CHALLENGE_NOT_FOUND';end if;
 if c.status not in ('pending','accepted') then return;end if;
 for p in select * from challenge_participants where challenge_id=c.id and completed_at is null order by user_id loop
   if c.expires_at>clock_timestamp() and (p.started_at is null or p.started_at+make_interval(secs=>c.duration_seconds)>clock_timestamp()) then continue;end if;
   if p.session_id is null and c.status='pending' then continue;end if;
   if p.session_id is null then
     update challenge_participants set score=0,correct_count=0,elapsed_seconds=c.duration_seconds,completed_at=clock_timestamp() where challenge_id=c.id and user_id=p.user_id;
   else
     update learning_sessions set status='completed',interrupted_from=null,completed_at=least(clock_timestamp(),coalesce(p.started_at+make_interval(secs=>c.duration_seconds),c.expires_at)) where id=p.session_id and status!='completed';
   end if;
 end loop;
 for p in select session_id from challenge_participants where challenge_id=c.id and session_id is not null order by user_id loop
   if (c.status='accepted' or c.mode='classic') and exists(select 1 from learning_sessions where id=p.session_id and status='completed') then perform finalize_timed_participant(p.session_id);end if;
 end loop;
 if c.status='accepted' and not exists(select 1 from challenge_participants where challenge_id=c.id and session_id is not null) and c.expires_at<=clock_timestamp() then
   update challenges set status='completed',completed_at=clock_timestamp() where id=c.id;
 end if;
end $$;
