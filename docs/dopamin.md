# Dopamin öğrenci deneyimi

9 Ekim 2026'da onaylanan yeni öğrenci tasarımının uygulama notları. Önceki Pusula marka ve rekabet kuralları yerine bu dosyadaki davranışlar geçerlidir. Akademisyen çalışma akışı korunur.

## Arayüz

Koyu zemin, uygulama için çizilmiş penguen, kabartmalı konu yolu ve beş ana panel. Desktop solda Öğren/Görevler/Maç/Mağaza/Profil; mobil altta Görevler/Maç/Öğren/Mağaza/Profil. Görevler Öğren'de gösterilmez. Konu seçiminde Derse hazırlık önce, Tekrar sonra gelir. Hazırlıkta kısa tanımlar, günlük örnekler ve derste düşünülecek sorular tek tek gösterilir. Demo biyoloji ve algoritmada dörder bilgi kartı ve beşer soru vardır; diğer konularda yayımlanmış soru açıklamalarından hazırlık notları gösterilir. Hazırlık için XP verilmez.

Kişisel ayarlar bütün öğrenci panellerinde ve etkinlik ekranında uygulanır. Mağazada tema, penguen kıyafeti, efektli çerçeve, profil banner'ı, kullanıcı adı fontu ve seri koruyucu bulunur. Profil fotoğrafları satılmaz; öğrenci PNG/JPEG yükler. Eski avatar alımları kıyafete dönüştürülür. Önizleme öğrencinin gerçek ismini, avatarını ve takılı kozmetiklerini kullanır; satın alma veya kuşanma işlemi yapmaz. Beş yeni penguen görünümü, iki tema, üç banner, iki çerçeve ve bir yazı stili eklendi. Her 250 XP bir seviye artırır. Mağaza seviyeyi sunucuda da doğrular.

Arayüz ve Android bağlantı ekranları emoji içermez; avatarlar penguenle aynı palette özgün SVG çizimleridir. Kuşak gövdeyi sarar. Doğru cevapta alkış, yanlış cevapta üzgün, bitişte kutlama pozu oynar; fare ve dokunmayla tekrar oynatılır. Hareket azaltma sistem tercihine uyulur. Maçlarda cevap doğruluğu sonuçlanana kadar gizli kaldığı için yalnız nötr tepki gösterilir.

Ders seçimi klavye ve dokunma destekli özel açılır menüyle yapılır. Ders ekleme yanındadır. Seçim kullanıcıya özel hatırlanır; çalışma bitişi ve ara verme bağlantıları oturumun ders kimliğini taşır. Yıldız teması sabit tohumla rastgele çizilmiş 420 farklı konum/boyut/parlaklıkta yıldız kullanır; tekrar eden karo deseni yoktur.

Öğrenci genel profil paylaşımını seçebilir. Diğer öğrencilere isim, üniversite, toplam/haftalık XP, kozmetikler, başarımlar ve lig gösterilir. E-posta, elmas bakiyesi, kişisel ödev/öğrenme kayıtları paylaşılmaz. Öğretmen sorguları nötr avatar kullanır; kozmetik tablo erişimi ve öğrenci profil endpoint'i öğretmene kapalıdır.

## Maçlar ve lig

| Kural        | Klasik                                               | Seri                                                                |
| ------------ | ---------------------------------------------------- | ------------------------------------------------------------------- |
| Davet süresi | 7 gün                                                | 15 dakika                                                           |
| Tur süresi   | Kişi başına 180 saniye                               | Ortak 120 saniye                                                    |
| Başlama      | Davet eden hemen oynar; rakip kabul edip sonra oynar | Davet eden odayı açar; rakip katılınca ortak 3 saniyelik geri sayım |
| Soru paketi  | İki oyuncuya aynı, en fazla 5 yayımlanmış soru       | Aynı                                                                |

Rastgele rakip yalnız aynı ders ve modda **Rakip bul** seçmiş öğrencilerden eşleşir; bekleme iki dakika sonra sona erer ve iptal edilebilir. Davetler, sonuçlar ve sıra durumu görünür panelde yenilenir.

Bekleyen Klasik davette ilk oyuncunun turu ve süre aşımı kaydedilir; rakip kabul etmeden başlayamaz. Bekleyen/reddedilen/iptal edilen davet ödül üretmez. Reddedilen veya iptal edilen maçın açık oturumu kapanır. Seri davet beklerken soru veya doğru cevap gösterilmez.

Sayaç sunucu saatine bağlıdır; sayfa yenileme süreyi sıfırlamaz. Hazır olmayan Seri odasında sorular verilmez. Süre sonrasında cevap kabul edilmez; yanıtlanmamış sorular sıfırdır. Önce doğruluk puanı, eşitlikte tamamlanmış saniye cinsinden tur süresi karşılaştırılır; ikisi de eşitse beraberliktir. Doğru cevap/puan karşı taraf bitmeden açıklanmaz; kendi oturum yanıtlarındaki doğru sayısı da maskelenir. Süresi dolan tur, oturum/davetler okunurken idempotent tamamlanır.

En az bir cevap verilen günlük ilk beş maçta kazanana **30 XP + 5 elmas**, diğer oyuncuya **15 XP**; beraberlikte iki tarafa **15 XP**. Tamamen boş tur ödülsüzdür. Sonraki maçlar antrenmandır. Maçlar kişisel günlük görev veya akademik hâkimiyet üretmez. Ödül muhasebesi tekil maç olayına bağlıdır; yenileme/tekrar istek ikinci ödül oluşturmaz.

Haftalık lig İstanbul haftası boyunca kazanılan **gerçek XP toplamını** kullanır; maç XP'si dahildir. Eski ayrı `global_xp` katsayısı bu sıralamada kullanılmaz. Önceden kapanmış lig sonuçları yeniden yazılmaz.

## Dosyalar

- `src/components/student-dashboard.tsx`, `penguin.tsx`, `src/app/dopamin.css`: öğrenci kabuğu, marka, responsive tasarım.
- `src/components/rewards-panel.tsx`, `public-profile.tsx`: mağaza ve öğrenci profili.
- `src/modules/competition/service.ts`, `learning/service.ts`: süreli maç ve oturum akışı.
- `db/migrations/023_dopamin_cosmetics.sql`, `024_weekly_earned_xp.sql`, `025_timed_matches.sql`: kozmetik/yetki, XP ligi, maç kuralları.
- `mobile/`: Capacitor Android uygulaması. [APK kurulumu ve manuel test](android-testing.md).

Yereldeki mevcut öğrenci kayıtları ve alışverişler korunur. Gerçek AI, canlı barındırma, Supabase ve fiziksel Android testinin tamamlandığı iddia edilmez. [Önceden ertelenen ürün kararları](decisions-pending.md) ayrı takip edilir.

## Doğrulama sonucu

113 birim/entegrasyon testi ve 18 Chromium senaryosu geçti. Son cevap kutusu düzenlemesinden sonra ilgili 6 tarayıcı senaryosu yeniden geçti. Tip kontrolü, lint ve üretim derlemesi başarılı. 39 ürünün mobil önizlemesinde Axe ihlali ve yatay taşma bulunmadı. `src/tests/dopamin.integration.test.ts` seviye kilidi, idempotent satın alma, öğretmenden kozmetik gizleme, profil paylaşımı, konu kapsamı, Seri başlangıç engeli, bekleyen davette oynama, ret/süre aşımı, rastgele eşleşme, XP/token ve günlük ödül sınırını doğrular. `e2e/challenges.spec.ts` iki tarayıcı oturumuyla her iki maç modunu oynar. `e2e/dopamin-design.spec.ts` Biyoloji dersine dönüşü, aynı dersi yeniden seçmeyi, klavye/dokunmayı, penguen tepkilerini ve önizlemenin hesabı değiştirmediğini doğrular. APK yeniden derlendi; v2 imzası doğrulandı. Fiziksel telefon testi yapılmadı. [Kurulum rehberi](android-testing.md).

## 10 Ekim düzenlemesi

Öğrenci üst göstergeleri seri → seviye/XP → elmas sırasındadır. Alt profil kısayolu yalnız fotoğraf ve isimdir; kenar çubuğunda Atatürk'ün bilim sözü yer alır. Eşleştirme iki sütunlu kartlarla, sıralama fare/dokunma sürüklemesi veya klavye ile çalışır. Tek yönerge ve sabit cevap alanı kullanılır; sonuç gösterilirken cevap kontrollerinin yerini açıklama alır. Çıkış düğmesi ve tarayıcı geri hareketi ağlayan penguenli onay açar. Maç panelinde kılıçlı penguen ve seçilen modu belirten kısa animasyon vardır.

[Gemini kurulumu, sınırlar ve gerçek PDF testi](gemini.md).
