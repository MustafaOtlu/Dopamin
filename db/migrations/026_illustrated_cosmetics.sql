-- Keep product and ownership identifiers; replace platform-dependent emoji with original vector portraits.
update shop_products set value=substring(id from 8) where id in ('avatar-penguin','avatar-rocket','avatar-owl','avatar-fox','avatar-cat','avatar-astronaut');
insert into shop_products(id,title,description,kind,price,value,min_level) values
 ('avatar-penguin-rose','Gül atkı','Penguenin yumuşak pembe atkısıyla.','avatar',20,'penguin-rose',1),
 ('avatar-penguin-amber','Bal atkı','Soğuk günler için bal rengi bir atkı.','avatar',20,'penguin-amber',1),
 ('avatar-penguin-lavender','Lavanta atkı','Lavanta tonlarında kutup arkadaşı.','avatar',25,'penguin-lavender',1),
 ('avatar-penguin-explorer','Keşif günü','Şapkası ve atkısıyla yeni konulara hazır.','avatar',45,'penguin-explorer',2),
 ('avatar-penguin-headphones','Kulaklıklar takılı','Biraz müzik, biraz ders.','avatar',45,'penguin-headphones',2),
 ('frame-tide','Gelgit','İç içe iki turkuaz halka.','frame',35,'tide',1),
 ('frame-rose','Gül ışığı','Yavaşça nefes alan pembe bir ışık.','frame',50,'rose',2),
 ('banner-peaks','Sessiz zirveler','Gece mavisinde çizilmiş dağ siluetleri.','banner',35,'peaks',1),
 ('banner-tide','Kıyı','Katmanlı dalgalar ve açık bir ufuk.','banner',40,'tide',2),
 ('banner-check','Çizgili defter','Krem ve mürekkep tonlarında bir defter sayfası.','banner',30,'check',1),
 ('theme-ink','Mürekkep','Kömür grisi ekranlar, kâğıt tonları, sade kontroller.','theme',40,'ink',1),
 ('theme-lagoon','Sakin koy','Turkuaz su ve gecenin koyu yeşili.','theme',65,'lagoon',2),
 ('font-hand','Not defteri','Adına kişisel bir el yazısı dokunuşu.','font',30,'hand',1);
