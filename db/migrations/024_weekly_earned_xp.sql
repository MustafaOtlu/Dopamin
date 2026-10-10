-- League rankings now use all XP actually earned during the week. Closed results stay frozen.
create or replace function close_league(target uuid) returns void language plpgsql security definer set search_path=public as $$
declare g league_groups;n integer;begin
  select * into g from league_groups where id=target for update;
  if g.closed_at is not null then return;end if;
  if g.week+6>=(now() at time zone 'Europe/Istanbul')::date then raise exception 'LEAGUE_WEEK_ACTIVE';end if;
  select count(*) into n from league_members where group_id=g.id and not withdrawn;
  with scores as (
    select m.user_id,coalesce(sum(x.amount),0)::int points from league_members m left join xp_transactions x on x.user_id=m.user_id and x.week=g.week
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

create or replace function league_ranking() returns table(user_id uuid,display_name text,points bigint,rank bigint) language plpgsql stable security definer set search_path=public as $$
declare m league_members;begin
  select lm.* into m from league_members lm join profiles p on p.id=lm.user_id where lm.user_id=app_user_id() and lm.week=date_trunc('week',now() at time zone 'Europe/Istanbul')::date and not lm.withdrawn and p.public_profile;
  if m.user_id is null then return;end if;
  return query select q.user_id,q.display_name,q.points,dense_rank() over(order by q.points desc) from
    (select lm.user_id,p.display_name,coalesce(sum(x.amount),0)::bigint points from league_members lm join profiles p on p.id=lm.user_id
      left join xp_transactions x on x.user_id=lm.user_id and x.week=lm.week where lm.group_id=m.group_id and not lm.withdrawn and p.public_profile group by lm.user_id,p.display_name) q
    order by q.points desc,q.display_name,q.user_id;
end $$;
revoke all on function league_ranking() from public;grant execute on function league_ranking() to pusula_app;
