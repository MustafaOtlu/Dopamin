alter table shop_products drop constraint shop_products_kind_check;
alter table shop_products add constraint shop_products_kind_check check(kind in ('avatar','frame','theme','shield','banner','font'));
alter table shop_products add column min_level integer not null default 1 check(min_level between 1 and 100);
alter table profile_cosmetics add column banner_id text references shop_products(id);
alter table profile_cosmetics add column font_id text references shop_products(id);

insert into shop_products(id,title,description,kind,price,value,min_level) values
 ('avatar-penguin','Kutup kaşifi','Dopamin pengueni profiline eşlik etsin.','avatar',15,'🐧',1),
 ('avatar-fox','Meraklı tilki','Yeni fikirlerin izinde.','avatar',25,'🦊',1),
 ('avatar-cat','Gece kedisi','Gece çalışanların küçük dostu.','avatar',30,'🐈',2),
 ('avatar-astronaut','Yıldız gezgini','Merakının sınırı gökyüzü olsun.','avatar',55,'🧑‍🚀',3),
 ('frame-glacier','Buz parıltısı','Buz mavisi ışıkla parlayan bir çerçeve.','frame',35,'glacier',1),
 ('frame-flame','Alev halkası','Yavaşça parlayan sıcak bir ışık efekti.','frame',65,'flame',2),
 ('frame-orbit','Yörünge','Mor ışık halkası ve parıltı efekti.','frame',80,'orbit',3),
 ('frame-gold','Altın taç','Çift altın halka ile bir ustalık dokunuşu.','frame',120,'gold',5),
 ('theme-polar','Kutup gecesi','Koyu lacivert, nane yeşili ve penguenin dünyası.','theme',10,'polar',1),
 ('theme-aurora','Kuzey ışıkları','Bütün uygulamada yeşil ve mor ışık dalgaları.','theme',60,'aurora',2),
 ('theme-cosmos','Sonsuz uzay','Yıldızlı arka plan, mor yüzeyler ve lavanta detaylar.','theme',90,'cosmos',3),
 ('theme-forest','Orman yürüyüşü','Katmanlı orman siluetleri, yeşil ekranlar ve yaprak tonları.','theme',60,'forest',2),
 ('theme-sunset','Gün batımı','Sıcak pembe arka plan ve şeftali renkli kontroller.','theme',75,'sunset',3),
 ('banner-glacier','Buzullar','Profilinde buz mavisi bir ufuk.','banner',30,'glacier',1),
 ('banner-aurora','Kutup gökyüzü','Profilinde yeşil ve mor kuzey ışıkları.','banner',45,'aurora',2),
 ('banner-cosmos','Yıldız haritası','Profilinin arkasında bir yıldız denizi.','banner',70,'cosmos',3),
 ('banner-sunset','Son ışık','Profilinde gün batımının sıcak renkleri.','banner',40,'sunset',1),
 ('font-rounded','Neşeli','Adın için ferah ve yuvarlak bir görünüm.','font',20,'rounded',1),
 ('font-mono','Kod ustası','Adını kod editöründeki gibi yaz.','font',35,'mono',2),
 ('font-serif','Klasik','Adına zarif ve eğik bir kitap karakteri.','font',35,'serif',2),
 ('font-display','Sahne senin','Adını büyük, kalın ve belirgin göster.','font',60,'display',4);

create or replace function purchase_product(product text,request_key uuid) returns purchases language plpgsql security definer set search_path=public as $$
declare who uuid:=app_user_id();item shop_products;purchase purchases;wallet reward_accounts;begin
  if not exists(select 1 from profiles where id=who and role='student') then raise exception 'STUDENT_ONLY';end if;
  insert into reward_accounts(user_id) values(who) on conflict do nothing;
  select * into wallet from reward_accounts where user_id=who for update;
  select * into purchase from purchases where id=request_key;
  if purchase.id is not null then
    if purchase.user_id!=who or purchase.product_id!=product then raise exception 'REQUEST_CONFLICT';end if;return purchase;
  end if;
  select * into item from shop_products where id=product and enabled;
  if item.id is null then raise exception 'PRODUCT_NOT_FOUND';end if;
  if 1+wallet.xp/250<item.min_level then raise exception 'LEVEL_REQUIRED';end if;
  if wallet.tokens<item.price then raise exception 'INSUFFICIENT_TOKENS';end if;
  if not item.consumable and exists(select 1 from inventory where user_id=who and product_id=product and quantity>0) then raise exception 'ALREADY_OWNED';end if;
  update reward_accounts set tokens=tokens-item.price where user_id=who;
  insert into token_transactions(user_id,event_key,reason,amount) values(who,'purchase:'||request_key,'purchase',-item.price);
  insert into inventory(user_id,product_id) values(who,product) on conflict(user_id,product_id) do update set quantity=inventory.quantity+1;
  insert into purchases(id,user_id,product_id,price) values(request_key,who,product,item.price) returning * into purchase;return purchase;
end $$;

create or replace function equip_product(product text) returns void language plpgsql security definer set search_path=public as $$
declare who uuid:=app_user_id();item shop_products;begin
  if product like 'reset:%' then
    insert into profile_cosmetics(user_id) values(who) on conflict do nothing;
    if product='reset:avatar' then update profile_cosmetics set avatar_id=null where user_id=who;
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
  elsif item.kind='frame' then update profile_cosmetics set frame_id=product where user_id=who;
  elsif item.kind='theme' then update profile_cosmetics set theme_id=product where user_id=who;
  elsif item.kind='banner' then update profile_cosmetics set banner_id=product where user_id=who;
  elsif item.kind='font' then update profile_cosmetics set font_id=product where user_id=who;end if;
end $$;
-- Student cosmetics have their own private store. Teacher profile reads remain neutral.
update profiles set avatar='violet' where role='student';

create function student_public_profile(target uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb;begin
  if not exists(select 1 from profiles where id=app_user_id() and role='student') then raise exception 'STUDENT_ONLY';end if;
  select jsonb_build_object('id',p.id,'display_name',p.display_name,'university',p.university,
    'xp',coalesce(r.xp,0),'weekly_xp',coalesce((select sum(x.amount) from xp_transactions x where x.user_id=p.id and x.week=date_trunc('week',now() at time zone 'Europe/Istanbul')::date),0),
    'cosmetics',jsonb_build_object('avatar',a.value,'frame',f.value,'banner',b.value,'font',n.value),
    'achievements',coalesce((select jsonb_agg(jsonb_build_object('achievement_id',h.achievement_id,'earned_at',h.earned_at)) from achievements h where h.user_id=p.id),'[]'::jsonb),
    'league_tier',(select g.tier from league_members m join league_groups g on g.id=m.group_id where m.user_id=p.id and not m.withdrawn and m.week=date_trunc('week',now() at time zone 'Europe/Istanbul')::date)) into result
    from profiles p left join reward_accounts r on r.user_id=p.id left join profile_cosmetics c on c.user_id=p.id
    left join shop_products a on a.id=c.avatar_id left join shop_products f on f.id=c.frame_id left join shop_products b on b.id=c.banner_id left join shop_products n on n.id=c.font_id
    where p.id=target and p.role='student' and (p.public_profile or p.id=app_user_id());
  if result is null then raise exception 'PROFILE_PRIVATE';end if;return result;
end $$;
revoke all on function student_public_profile(uuid) from public;grant execute on function student_public_profile(uuid) to pusula_app;
