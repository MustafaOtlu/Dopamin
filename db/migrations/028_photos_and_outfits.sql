alter table shop_products drop constraint shop_products_kind_check;
alter table shop_products add constraint shop_products_kind_check check(kind in ('avatar','outfit','frame','theme','shield','banner','font'));
alter table profile_cosmetics add column outfit_id text references shop_products(id);
alter table topics add column preparation jsonb;

-- Existing purchases become mascot clothing, so students keep what they bought.
update shop_products set kind='outfit',
 title=case when value in ('rocket','astronaut','penguin-astronaut') then 'Uzay kıyafeti' when value='owl' then 'Bilgin cübbesi' when value='fox' then 'Tilki kapüşonu' when value='cat' then 'Gece tulumu' else replace(title,'Avatar','Kıyafet') end,
 value=case when value in ('rocket','astronaut') then 'astronaut' when value='owl' then 'scholar' when value='fox' then 'fox-hood' when value='cat' then 'night-suit' else value end,
 description='Penguenin için bir kıyafet. Profilinde ve maç alanında görünür.' where kind='avatar';
update profile_cosmetics set outfit_id=avatar_id,avatar_id=null where avatar_id is not null;
insert into shop_products(id,title,description,kind,price,value,min_level) values
 ('outfit-knight','Kutup şövalyesi','Çelik yelek ve bordo pelerin.','outfit',25,'knight',1),
 ('outfit-raincoat','Sarı yağmurluk','Yağmurlu günler için sarı bir ceket.','outfit',5,'raincoat',1),
 ('outfit-scientist','Laboratuvar önlüğü','Cepli beyaz önlük, küçük bir deney tüpü.','outfit',35,'scientist',2),
 ('outfit-chef','Aşçı takımı','Beyaz aşçı şapkası ve lacivert önlük.','outfit',25,'chef',1),
 ('outfit-sailor','Denizci','Çizgili gömlek ve denizci şapkası.','outfit',40,'sailor',2);

create table profile_photos (
 user_id uuid primary key references profiles(id) on delete cascade,
 storage_key text not null,
 version uuid not null,
 updated_at timestamptz not null default now()
);
alter table profile_photos enable row level security;
create policy own_photo on profile_photos for all using(user_id=app_user_id() and exists(select 1 from profiles where id=app_user_id() and role='student')) with check(user_id=app_user_id() and exists(select 1 from profiles where id=app_user_id() and role='student'));
grant select,insert,update,delete on profile_photos to pusula_app;
create or replace function equip_product(product text) returns void language plpgsql security definer set search_path=public as $$
declare who uuid:=app_user_id();item shop_products;begin
  if not exists(select 1 from profiles where id=who and role='student') then raise exception 'STUDENT_ONLY';end if;
  if product like 'reset:%' then
    insert into profile_cosmetics(user_id) values(who) on conflict do nothing;
    if product='reset:avatar' then update profile_cosmetics set avatar_id=null where user_id=who;
    elsif product='reset:outfit' then update profile_cosmetics set outfit_id=null where user_id=who;
    elsif product='reset:frame' then update profile_cosmetics set frame_id=null where user_id=who;
    elsif product='reset:theme' then update profile_cosmetics set theme_id=null where user_id=who;
    elsif product='reset:banner' then update profile_cosmetics set banner_id=null where user_id=who;
    elsif product='reset:font' then update profile_cosmetics set font_id=null where user_id=who;
    else raise exception 'OWNED_COSMETIC_ONLY';end if;return;
  end if;
  select p.* into item from shop_products p join inventory i on i.product_id=p.id and i.user_id=who and i.quantity>0 where p.id=product;
  if item.id is null or item.kind='shield' then raise exception 'OWNED_COSMETIC_ONLY';end if;
  insert into profile_cosmetics(user_id) values(who) on conflict do nothing;
  if item.kind='avatar' then update profile_cosmetics set avatar_id=product where user_id=who;
  elsif item.kind='outfit' then update profile_cosmetics set outfit_id=product where user_id=who;
  elsif item.kind='frame' then update profile_cosmetics set frame_id=product where user_id=who;
  elsif item.kind='theme' then update profile_cosmetics set theme_id=product where user_id=who;
  elsif item.kind='banner' then update profile_cosmetics set banner_id=product where user_id=who;
  elsif item.kind='font' then update profile_cosmetics set font_id=product where user_id=who;end if;
end $$;

create or replace function student_public_profile(target uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb;begin
  if not exists(select 1 from profiles where id=app_user_id() and role='student') then raise exception 'STUDENT_ONLY';end if;
  select jsonb_build_object('id',p.id,'display_name',p.display_name,'university',p.university,
    'xp',coalesce(r.xp,0),'weekly_xp',coalesce((select sum(x.amount) from xp_transactions x where x.user_id=p.id and x.week=date_trunc('week',now() at time zone 'Europe/Istanbul')::date),0),
    'photo_url',case when ph.user_id is not null then '/api/students/'||p.id||'/photo?v='||ph.version else null end,
    'cosmetics',jsonb_build_object('avatar',null,'outfit',outfit.value,'frame',f.value,'banner',b.value,'font',n.value),
    'achievements',coalesce((select jsonb_agg(jsonb_build_object('achievement_id',h.achievement_id,'earned_at',h.earned_at)) from achievements h where h.user_id=p.id),'[]'::jsonb),
    'league_tier',(select g.tier from league_members m join league_groups g on g.id=m.group_id where m.user_id=p.id and not m.withdrawn and m.week=date_trunc('week',now() at time zone 'Europe/Istanbul')::date)) into result
    from profiles p left join reward_accounts r on r.user_id=p.id left join profile_cosmetics c on c.user_id=p.id
    left join profile_photos ph on ph.user_id=p.id left join shop_products outfit on outfit.id=c.outfit_id left join shop_products f on f.id=c.frame_id left join shop_products b on b.id=c.banner_id left join shop_products n on n.id=c.font_id
    where p.id=target and p.role='student' and (p.public_profile or p.id=app_user_id());
  if result is null then raise exception 'PROFILE_PRIVATE';end if;return result;
end $$;
revoke all on function student_public_profile(uuid) from public;grant execute on function student_public_profile(uuid) to pusula_app;
