create table reward_accounts (
  user_id uuid primary key references profiles(id),
  xp integer not null default 0 check(xp>=0),
  tokens integer not null default 0 check(tokens>=0)
);
create table xp_transactions (
  id uuid primary key default gen_random_uuid(),user_id uuid not null references profiles(id),
  course_id uuid references courses(id),event_key text not null,reason text not null,
  amount integer not null check(amount>=0),class_xp integer not null default 0 check(class_xp>=0),
  global_xp integer not null default 0 check(global_xp>=0),week date not null,
  created_at timestamptz not null default now(),unique(user_id,event_key),
  check(amount+class_xp+global_xp>0)
);
create table token_transactions (
  id uuid primary key default gen_random_uuid(),user_id uuid not null references profiles(id),
  event_key text not null,reason text not null,amount integer not null check(amount!=0),
  created_at timestamptz not null default now(),unique(user_id,event_key)
);
create table shop_products (
  id text primary key,title text not null,description text not null,kind text not null check(kind in ('avatar','frame','theme','shield')),
  price integer not null check(price>0),value text not null,consumable boolean not null default false,enabled boolean not null default true
);
insert into shop_products(id,title,description,kind,price,value,consumable) values
  ('frame-lilac','Leylak çerçeve','Profilinin etrafında yumuşak bir mor halka.','frame',10,'lilac',false),
  ('avatar-rocket','Keşif roketi','Yeni konulara doğru küçük bir yolculuk.','avatar',20,'🚀',false),
  ('avatar-owl','Bilge baykuş','Öğrenme alanının yeni yüzü.','avatar',20,'🦉',false),
  ('theme-ocean','Okyanus teması','Öğrenme alanında sakin mavi tonlar.','theme',30,'ocean',false),
  ('streak-shield','Seri koruyucu','Kaçırdığın bir günde serini korur. Günlük hedef tamamlaması sayılmaz.','shield',15,'shield',true);
create table inventory (
  user_id uuid not null references profiles(id),product_id text not null references shop_products(id),
  quantity integer not null default 1 check(quantity>=0),acquired_at timestamptz not null default now(),primary key(user_id,product_id)
);
create table purchases (
  id uuid primary key, user_id uuid not null references profiles(id),product_id text not null references shop_products(id),
  price integer not null,created_at timestamptz not null default now()
);
create table profile_cosmetics (
  user_id uuid primary key references profiles(id),avatar_id text references shop_products(id),frame_id text references shop_products(id),theme_id text references shop_products(id)
);
create table learning_days (
  user_id uuid not null references profiles(id),date date not null,
  actual_learning boolean not null default false,goal_completed boolean not null default false,
  makeup_completed boolean not null default false,streak_protected boolean not null default false,
  neutral boolean not null default false,primary key(user_id,date)
);
create table achievements (
  user_id uuid not null references profiles(id),achievement_id text not null check(achievement_id in ('first_step','first_mastery','mistakes_fixed','five_topics','weekly_complete')),
  earned_at timestamptz not null default now(),primary key(user_id,achievement_id)
);
create table weekly_rewards (user_id uuid not null references profiles(id),week date not null,claimed_at timestamptz not null default now(),primary key(user_id,week));
create table weekly_makeups (user_id uuid not null references profiles(id),week date not null,date date not null,used_at timestamptz not null default now(),primary key(user_id,week));
grant select on reward_accounts,xp_transactions,token_transactions,shop_products,inventory,purchases,profile_cosmetics,learning_days,achievements,weekly_rewards,weekly_makeups to pusula_app;
do $$ declare tbl text; begin
  foreach tbl in array array['reward_accounts','xp_transactions','token_transactions','inventory','purchases','profile_cosmetics','learning_days','achievements','weekly_rewards','weekly_makeups'] loop
    execute format('alter table %I enable row level security',tbl);
    execute format('create policy own_reward_read on %I for select using(user_id=app_user_id())',tbl);
  end loop;
end $$;
alter table shop_products enable row level security;
create policy shop_read on shop_products for select using(enabled);
create index xp_week_course_idx on xp_transactions(course_id,week,user_id);

-- Only authorized event functions below can call this internal ledger writer.
create function issue_reward(who uuid,event text,why text,target_course uuid,points integer,class_points integer,global_points integer,coins integer) returns void language plpgsql security definer set search_path=public as $$
declare added integer;begin
  insert into reward_accounts(user_id) values(who) on conflict do nothing;
  perform user_id from reward_accounts where user_id=who for update;
  if points+class_points+global_points>0 then
    insert into xp_transactions(user_id,course_id,event_key,reason,amount,class_xp,global_xp,week)
      values(who,target_course,event,why,points,class_points,global_points,date_trunc('week',now() at time zone 'Europe/Istanbul')::date) on conflict do nothing;
    get diagnostics added=row_count;
    if added>0 then update reward_accounts set xp=xp+points where user_id=who;end if;
  end if;
  if coins>0 then
    insert into token_transactions(user_id,event_key,reason,amount) values(who,event,why,coins) on conflict do nothing;
    get diagnostics added=row_count;
    if added>0 then update reward_accounts set tokens=tokens+coins where user_id=who;end if;
  end if;
end $$;
revoke all on function issue_reward(uuid,text,text,uuid,integer,integer,integer,integer) from public;

create function record_learning_day(target_session uuid) returns void language plpgsql security definer set search_path=public as $$
declare who uuid:=app_user_id();d date:=(now() at time zone 'Europe/Istanbul')::date;begin
  if not exists(select 1 from learning_sessions s join attempts a on a.session_id=s.id where s.id=target_session and s.user_id=who and s.mode not in ('assignment','challenge') and (a.created_at at time zone 'Europe/Istanbul')::date=d) then return;end if;
  insert into learning_days(user_id,date,actual_learning) values(who,d,true) on conflict(user_id,date) do update set actual_learning=true;
  if exists(select 1 from objective_mastery m where m.user_id=who and m.state='mastered') then insert into achievements values(who,'first_mastery',now()) on conflict do nothing;end if;
end $$;
revoke all on function record_learning_day(uuid) from public;grant execute on function record_learning_day(uuid) to pusula_app;

create function record_plan_day(target_plan uuid) returns void language plpgsql security definer set search_path=public as $$
declare p daily_plans;begin
  select * into p from daily_plans where id=target_plan and user_id=app_user_id();
  if p.id is null then raise exception 'PLAN_OWNER_ONLY';end if;
  insert into learning_days(user_id,date,neutral) values(p.user_id,p.date,p.status='no_content') on conflict(user_id,date) do update set neutral=excluded.neutral;
end $$;
revoke all on function record_plan_day(uuid) from public;grant execute on function record_plan_day(uuid) to pusula_app;

create function award_completed_session(target_session uuid) returns void language plpgsql security definer set search_path=public as $$
declare who uuid:=app_user_id();s learning_sessions;i plan_items;p daily_plans;o record;d date:=(now() at time zone 'Europe/Istanbul')::date;week_date date:=date_trunc('week',now() at time zone 'Europe/Istanbul')::date;begin
  select * into s from learning_sessions where id=target_session and user_id=who and status='completed';
  if s.id is null then raise exception 'COMPLETED_SESSION_ONLY';end if;
  if s.mode in ('assignment','challenge') then return;end if;
  perform record_learning_day(s.id);
  insert into achievements values(who,'first_step',now()) on conflict do nothing;
  if s.mode='daily' then
    select * into i from plan_items where session_id=s.id and user_id=who and status='completed';
    if i.id is null then raise exception 'COMPLETED_TASK_ONLY';end if;
    perform issue_reward(who,'daily-item:'||i.id,'daily_item',i.course_id,40,40,0,0);
    select * into p from daily_plans where id=i.plan_id;
    if p.status='completed' and p.date=d then
      perform issue_reward(who,'daily-goal:'||p.id,'daily_goal',null,0,0,40,10);
      insert into learning_days(user_id,date,goal_completed,neutral) values(who,d,true,false) on conflict(user_id,date) do update set goal_completed=true,neutral=false;
    end if;
  elsif s.mode in ('practice','advance') then
    for o in select distinct a.objective_id,a.course_id from attempts a where a.session_id=s.id and a.context='first' loop
      perform issue_reward(who,'new-objective:'||o.objective_id,'new_objective',o.course_id,15,0,0,0);
    end loop;
  elsif s.mode='mistakes' then
    for o in select distinct a.objective_id,a.course_id from attempts a where a.session_id=s.id and a.context='mistake_review' and a.correct loop
      perform issue_reward(who,'mistake-objective:'||o.objective_id||':'||week_date,'mistake_review',o.course_id,5,0,0,0);
      insert into achievements values(who,'mistakes_fixed',now()) on conflict do nothing;
    end loop;
  end if;
  if (select count(distinct a.objective_id) from attempts a join learning_sessions ls on ls.id=a.session_id where a.user_id=who and ls.mode not in ('assignment','challenge'))>=5 then insert into achievements values(who,'five_topics',now()) on conflict do nothing;end if;
end $$;
revoke all on function award_completed_session(uuid) from public;grant execute on function award_completed_session(uuid) to pusula_app;

create function purchase_product(product text,request_key uuid) returns purchases language plpgsql security definer set search_path=public as $$
declare who uuid:=app_user_id();item shop_products;purchase purchases;wallet reward_accounts;begin
  if not exists(select 1 from profiles where id=who and role='student') then raise exception 'STUDENT_ONLY';end if;
  insert into reward_accounts(user_id) values(who) on conflict do nothing;
  select * into wallet from reward_accounts where user_id=who for update;
  select * into purchase from purchases where id=request_key;
  if purchase.id is not null then
    if purchase.user_id!=who or purchase.product_id!=product then raise exception 'REQUEST_CONFLICT';end if;return purchase;
  end if;
  select * into item from shop_products where id=product and enabled; if item.id is null then raise exception 'PRODUCT_NOT_FOUND';end if;
  if wallet.tokens<item.price then raise exception 'INSUFFICIENT_TOKENS';end if;
  if not item.consumable and exists(select 1 from inventory where user_id=who and product_id=product and quantity>0) then raise exception 'ALREADY_OWNED';end if;
  update reward_accounts set tokens=tokens-item.price where user_id=who;
  insert into token_transactions(user_id,event_key,reason,amount) values(who,'purchase:'||request_key,'purchase',-item.price);
  insert into inventory(user_id,product_id) values(who,product) on conflict(user_id,product_id) do update set quantity=inventory.quantity+1;
  insert into purchases(id,user_id,product_id,price) values(request_key,who,product,item.price) returning * into purchase;return purchase;
end $$;
revoke all on function purchase_product(text,uuid) from public;grant execute on function purchase_product(text,uuid) to pusula_app;

create function equip_product(product text) returns void language plpgsql security definer set search_path=public as $$
declare who uuid:=app_user_id();item shop_products;begin
  select p.* into item from shop_products p join inventory i on i.product_id=p.id and i.user_id=who and i.quantity>0 where p.id=product;
  if item.id is null or item.kind='shield' then raise exception 'OWNED_COSMETIC_ONLY';end if;
  insert into profile_cosmetics(user_id) values(who) on conflict do nothing;
  if item.kind='avatar' then update profile_cosmetics set avatar_id=product where user_id=who;update profiles set avatar=item.value where id=who;
  elsif item.kind='frame' then update profile_cosmetics set frame_id=product where user_id=who;
  elsif item.kind='theme' then update profile_cosmetics set theme_id=product where user_id=who;end if;
end $$;
revoke all on function equip_product(text) from public;grant execute on function equip_product(text) to pusula_app;

create function class_ranking(target_course uuid,target_week date) returns table(user_id uuid,display_name text,xp bigint,rank bigint) language plpgsql stable security definer set search_path=public as $$
begin
  if not can_read_course(target_course) then raise exception 'COURSE_MEMBERS_ONLY';end if;
  return query select q.user_id,q.display_name,q.xp,dense_rank() over(order by q.xp desc) from
    (select p.id user_id,p.display_name,coalesce(sum(x.class_xp),0)::bigint xp from enrollments e join profiles p on p.id=e.user_id left join xp_transactions x on x.user_id=e.user_id and x.course_id=e.course_id and x.week=target_week where e.course_id=target_course group by p.id,p.display_name) q order by q.xp desc,q.display_name,q.user_id;
end $$;
revoke all on function class_ranking(uuid,date) from public;grant execute on function class_ranking(uuid,date) to pusula_app;
