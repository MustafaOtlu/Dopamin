-- Missing content is neutral. Recorded plan days are authoritative snapshots.
create function learning_content_available(who uuid,on_date date) returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from enrollments e join courses c on c.id=e.course_id
    join objectives o on o.course_id=c.id join topics t on t.id=o.topic_id
    join curriculum_versions cv on cv.id=t.curriculum_id
    join activities a on a.course_id=c.id
    join activity_versions v on v.activity_id=a.id and v.version=a.published_version and v.objective_id=o.id
    where e.user_id=who and not c.archived and t.accessible and cv.status='published' and a.status!='archived'
    and e.joined_at < ((on_date+1)::timestamp at time zone 'Europe/Istanbul')
    and v.published_at < ((on_date+1)::timestamp at time zone 'Europe/Istanbul')
    and t.scheduled_date<=on_date+7
  )
$$;
revoke all on function learning_content_available(uuid,date) from public;

create function learning_calendar() returns table(date date,actual_learning boolean,goal_completed boolean,makeup_completed boolean,streak_protected boolean,neutral boolean) language sql stable security definer set search_path=public as $$
  select g.day::date,coalesce(l.actual_learning,false),coalesce(l.goal_completed,false),coalesce(l.makeup_completed,false),coalesce(l.streak_protected,false),
    coalesce(l.neutral,not learning_content_available(app_user_id(),g.day::date))
  from profiles p cross join lateral generate_series((p.created_at at time zone 'Europe/Istanbul')::date::timestamp,(now() at time zone 'Europe/Istanbul')::date::timestamp,interval '1 day') g(day)
  left join learning_days l on l.user_id=p.id and l.date=g.day::date
  where p.id=app_user_id() and p.role='student' order by g.day
$$;
revoke all on function learning_calendar() from public;grant execute on function learning_calendar() to pusula_app;

create function protect_learning_day(target_date date,method text) returns void language plpgsql security definer set search_path=public as $$
declare who uuid:=app_user_id();d date:=(now() at time zone 'Europe/Istanbul')::date;
  w date:=date_trunc('week',now() at time zone 'Europe/Istanbul')::date;target record;begin
  if not exists(select 1 from profiles where id=who and role='student') then raise exception 'STUDENT_ONLY';end if;
  if method not in ('makeup','shield') then raise exception 'INVALID_PROTECTION';end if;
  -- Use the same wallet lock as awards and purchases, serializing all entitlements.
  insert into reward_accounts(user_id) values(who) on conflict do nothing;
  perform user_id from reward_accounts where user_id=who for update;
  if method='makeup' and exists(select 1 from weekly_makeups where user_id=who and date=target_date and week=w) then return;end if;
  if method='shield' and exists(select 1 from learning_days where user_id=who and date=target_date and streak_protected) then return;end if;
  if target_date>=d or target_date<d-7 then raise exception 'PAST_WEEK_ONLY';end if;
  select * into target from learning_calendar() lc where lc.date=target_date;
  if target.date is null or target.neutral or target.goal_completed or target.makeup_completed or target.streak_protected then raise exception 'MISSED_LEARNING_DAY_ONLY';end if;
  if method='makeup' then
    if target_date<w then raise exception 'CURRENT_WEEK_ONLY';end if;
    if not exists(select 1 from learning_days where user_id=who and date=d and goal_completed and actual_learning) then raise exception 'COMPLETE_TODAY_FIRST';end if;
    if exists(select 1 from weekly_makeups where user_id=who and week=w) then raise exception 'MAKEUP_ALREADY_USED';end if;
    insert into weekly_makeups(user_id,week,date) values(who,w,target_date);
    insert into learning_days(user_id,date,makeup_completed) values(who,target_date,true)
      on conflict(user_id,date) do update set makeup_completed=true,neutral=false;
  else
    update inventory set quantity=quantity-1 where user_id=who and product_id='streak-shield' and quantity>0;
    if not found then raise exception 'SHIELD_REQUIRED';end if;
    insert into learning_days(user_id,date,streak_protected) values(who,target_date,true)
      on conflict(user_id,date) do update set streak_protected=true,neutral=false;
  end if;
end $$;
revoke all on function protect_learning_day(date,text) from public;grant execute on function protect_learning_day(date,text) to pusula_app;

create function claim_weekly_chest(target_week date) returns void language plpgsql security definer set search_path=public as $$
declare who uuid:=app_user_id();d date:=(now() at time zone 'Europe/Istanbul')::date;begin
  if not exists(select 1 from profiles where id=who and role='student') then raise exception 'STUDENT_ONLY';end if;
  insert into reward_accounts(user_id) values(who) on conflict do nothing;
  perform user_id from reward_accounts where user_id=who for update;
  if exists(select 1 from weekly_rewards where user_id=who and week=target_week) then return;end if;
  if extract(isodow from target_week)!=1 or target_week+6>d then raise exception 'WEEK_NOT_FINISHED';end if;
  if (select count(*) from learning_days where user_id=who and date between target_week and target_week+6 and (goal_completed or makeup_completed))!=7 then raise exception 'SEVEN_GOALS_REQUIRED';end if;
  insert into weekly_rewards(user_id,week) values(who,target_week);
  perform issue_reward(who,'weekly-chest:'||target_week,'weekly_chest',null,0,0,0,50);
  insert into achievements values(who,'weekly_complete',now()) on conflict do nothing;
end $$;
revoke all on function claim_weekly_chest(date) from public;grant execute on function claim_weekly_chest(date) to pusula_app;
