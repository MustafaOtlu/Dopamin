create table league_groups (id uuid primary key default gen_random_uuid(),week date not null,tier integer not null check(tier between 0 and 2),closed_at timestamptz);
create table league_members (
  user_id uuid not null references profiles(id),week date not null,group_id uuid not null references league_groups(id),
  withdrawn boolean not null default false,joined_at timestamptz not null default now(),
  final_points integer,final_rank integer,next_tier integer check(next_tier between 0 and 2),primary key(user_id,week)
);
create index league_group_members_idx on league_members(group_id);
alter table league_groups enable row level security;
alter table league_members enable row level security;
create policy own_league on league_members for select using(user_id=app_user_id());
create policy own_league_group on league_groups for select using(exists(select 1 from league_members m where m.group_id=league_groups.id and m.user_id=app_user_id()));
grant select on league_groups,league_members to pusula_app;

create function close_league(target uuid) returns void language plpgsql security definer set search_path=public as $$
declare g league_groups;n integer;begin
  select * into g from league_groups where id=target for update;
  if g.closed_at is not null then return;end if;
  if g.week+6>=(now() at time zone 'Europe/Istanbul')::date then raise exception 'LEAGUE_WEEK_ACTIVE';end if;
  select count(*) into n from league_members where group_id=g.id and not withdrawn;
  with scores as (
    select m.user_id,coalesce(sum(x.global_xp),0)::int points from league_members m left join xp_transactions x on x.user_id=m.user_id and x.week=g.week
    where m.group_id=g.id and not m.withdrawn group by m.user_id
  ), ranked as (
    select s.*,dense_rank() over(order by points desc)::int rank,
      (select count(*) from scores t where t.points>=s.points) above_or_equal,
      (select count(*) from scores t where t.points>s.points) strictly_above from scores s
  ) update league_members m set final_points=r.points,final_rank=r.rank,next_tier=
    case when n>=5 and r.points>0 and r.above_or_equal<=ceil(n*.2) then least(2,g.tier+1)
    when n>=5 and r.strictly_above>=n-floor(n*.2) then greatest(0,g.tier-1) else g.tier end
    from ranked r where m.group_id=g.id and m.user_id=r.user_id;
  update league_members set next_tier=g.tier where group_id=g.id and withdrawn;
  update league_groups set closed_at=now() where id=g.id;
end $$;
revoke all on function close_league(uuid) from public;

create function join_league(consent boolean) returns league_members language plpgsql security definer set search_path=public as $$
declare who uuid:=app_user_id();w date:=date_trunc('week',now() at time zone 'Europe/Istanbul')::date;
  m league_members;previous league_members;g league_groups;t integer;begin
  if consent is distinct from true or not exists(select 1 from profiles where id=who and role='student') then raise exception 'LEAGUE_CONSENT_REQUIRED';end if;
  perform pg_advisory_xact_lock(hashtext('league-user:'||who));
  select * into m from league_members where user_id=who and week=w;
  if m.user_id is not null then
    if m.withdrawn then raise exception 'LEAGUE_REJOIN_NEXT_WEEK';end if;return m;
  end if;
  select * into previous from league_members where user_id=who and week<w order by week desc limit 1;
  if previous.user_id is not null then
    perform close_league(previous.group_id);
    select next_tier into t from league_members where user_id=who and week=previous.week;
  else select case when coalesce(xp,0)>=2000 then 2 when coalesce(xp,0)>=500 then 1 else 0 end into t from reward_accounts where user_id=who;end if;
  t:=coalesce(t,0);
  perform pg_advisory_xact_lock(hashtext('league-group:'||w||':'||t));
  select lg.* into g from league_groups lg where lg.week=w and lg.tier=t and lg.closed_at is null
    and (select count(*) from league_members lm where lm.group_id=lg.id)<30 order by lg.id limit 1 for update;
  if g.id is null then insert into league_groups(week,tier) values(w,t) returning * into g;end if;
  update profiles set public_profile=true where id=who;
  insert into league_members(user_id,week,group_id) values(who,w,g.id) returning * into m;return m;
end $$;
revoke all on function join_league(boolean) from public;grant execute on function join_league(boolean) to pusula_app;

create function leave_league() returns void language plpgsql security definer set search_path=public as $$
begin
  perform pg_advisory_xact_lock(hashtext('league-user:'||app_user_id()));
  update league_members set withdrawn=true where user_id=app_user_id() and week=date_trunc('week',now() at time zone 'Europe/Istanbul')::date;
end $$;
revoke all on function leave_league() from public;grant execute on function leave_league() to pusula_app;

create function league_ranking() returns table(user_id uuid,display_name text,points bigint,rank bigint) language plpgsql stable security definer set search_path=public as $$
declare m league_members;begin
  select lm.* into m from league_members lm join profiles p on p.id=lm.user_id where lm.user_id=app_user_id() and lm.week=date_trunc('week',now() at time zone 'Europe/Istanbul')::date and not lm.withdrawn and p.public_profile;
  if m.user_id is null then return;end if;
  return query select q.user_id,q.display_name,q.points,dense_rank() over(order by q.points desc) from
    (select lm.user_id,p.display_name,coalesce(sum(x.global_xp),0)::bigint points from league_members lm join profiles p on p.id=lm.user_id
      left join xp_transactions x on x.user_id=lm.user_id and x.week=lm.week where lm.group_id=m.group_id and not lm.withdrawn and p.public_profile group by lm.user_id,p.display_name) q
    order by q.points desc,q.display_name,q.user_id;
end $$;
revoke all on function league_ranking() from public;grant execute on function league_ranking() to pusula_app;
