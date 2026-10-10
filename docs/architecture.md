# Pusula — teknik kararlar

V1.0 yol haritası bağımlılık sırasıyla uygulanır. Tek TypeScript/Next.js uygulaması,
sunucu tarafında ayrılmış domain modülleri, PostgreSQL migration'ları ve bağımsız worker.
Yerelde gerçek PostgreSQL motoru PGlite ile çalışır; canlıda Supabase PostgreSQL,
Supabase Auth ve özel Storage kullanılır. Canlı ortamda yerel auth/örnek veri açılmaz.

## Akış ve ekran haritası

Giriş/kayıt → Öğrenci: Bugün, Derslerim/yolculuk, Hatalarım, Ödevler, Lig,
Mağaza, Profil. Akademisyen: Genel bakış, Dersler/sınıf, Müfredat,
Etkinlik editörü/önizleme/yayın, Belgeler/kapsam/üretim incelemesi,
Öğrenci sonuçları, Ödev oluşturma/değerlendirme, Ayarlar.

İlk kabul akışı: doğrulanmış akademisyen → ders → davet → konu/kazanım →
üç tür manuel etkinlik → yayın → öğrenci kaydı → sınıfa katılım → oturum →
sunucuda değerlendirme → sürüme bağlı deneme → ders sahibinin sonuç ekranı.

## Yetki matrisi

| Eylem                 | Öğrenci                                             | Akademisyen                                  |
| --------------------- | --------------------------------------------------- | -------------------------------------------- |
| Profil/cevap/ilerleme | Kendi                                               | Kendi dersindeki öğrenciler, yalnızca o ders |
| Ders oluştur/düzenle  | Hayır                                               | Doğrulanmış, kendi dersi                     |
| Sınıfa katıl          | Geçerli kod                                         | Öğrenci üyeliği oluşturulmaz                 |
| Etkinlik gör          | Üye olduğu ders, yayımlanan sürüm; anahtar verilmez | Kendi dersi, tüm sürümler                    |
| Belge erişimi         | Ders sahibi izin verdiyse                           | Kendi dersi                                  |
| Ödül/bakiye değiştir  | Doğrudan asla                                       | Doğrudan asla                                |
| AI yayın              | Hayır                                               | Kaynak/şema denetiminden sonra inceleme/onay |

Sunucu kontrolü ve RLS birlikte uygulanır. Hassas tablolar istemci API'sine açılmaz.
İstekten alınan kullanıcı/rol/puan güvenilir kabul edilmez. SQL parametrelidir.
Hatalarda ayrıntılar yalnızca yapılandırılmış sunucu loglarında tutulur.

## Veri ve durum sözleşmeleri

Konu ≠ kazanım. Etkinlik bir kazanıma; değişmez etkinlik sürümü konuya/kaynağa;
deneme etkinlik sürümüne ve oturuma bağlıdır. Yayın sonrası değişiklik yeni sürümdür.
Oturum: in_progress → reviewing → completed; interruption devam ettirilebilir.
İlk deneme, oturum tekrarı ve Hatalarım tekrarı ayrı bağlamlardır.
Oturum tekrarı hata kaydını kapatmaz; yalnızca Hatalarım'da doğru yanıt kapatır.
Plan hazırlanıp saklanır; başladıktan sonra görev listesi sabittir.
İçerik yoksa görev verilmez ve seri cezalandırılmaz.
Müfredat değişikliği yalnızca başlanmamış planları geçersizleştirir.
Bir doğru cevap öğrenildi kararı oluşturmaz; farklı günler/etkinlikler gerekir.
Ödevler günlük hedef/seri hesabına katılmaz. Ödüller idempotent muhasebe kayıtlarıdır.
Token satın alma ve envanter ekleme tek transaction'dır.
Gerçek çalışma, hedef tamamlama ve seri koruma ayrı gün alanlarıdır.

## Ödül ekonomisi ve seri

Günlük adım: 40 kişisel ve yalnız o derste 40 rekabet XP'si. Tam günlük hedef:
10 token ve ders yükünden bağımsız 40 genel rekabet puanı. Gönüllü çalışma
kazanım başına bir kez 15 kişisel XP; doğru Hatalarım tekrarı kazanım/hafta
başına 5 kişisel XP. Bu iki tekrar türü rekabet puanı üretmez.

Ödül, alışveriş, telafi, koruma ve sandık aynı kullanıcı bakiye kilidi ile
transaction içinde seri hale gelir. Tekil olay anahtarları tekrar ödül vermez.
Uygulama rolü muhasebe tablolarına doğrudan yazamaz.

Seri hedef/telafi/koruma günleriyle ilerler; içeriksiz gün ne artırır ne bozar.
Bugün henüz bitmediği için bugünün bekleyen hedefi dünün serisini bozmaz.
Plan kaydı olan gün kendi içerik durumunu korur; kaydı olmayan geçmiş gün için
üyelik/yayın tarihi ve erişilebilir materyal kullanılır. Sonradan gelen materyal
geçmiş içeriksiz günleri cezalandırmaz. Hesap açılmadan önceki günler sayılmaz.

Ücretsiz telafi haftada bir, bugünün gerçek günlük hedefi tamamlanınca aynı
haftanın kaçırılan günü için kullanılır. Seri koruyucu son yedi gündeki bir
kaçırılan günü korur. İkisi geçmişte gerçek çalışma yapıldığı anlamına gelmez.
Sandık yedi hedef/telafi gerektirir; koruma/nötr gün yeterli değildir. Haftanın
son hedefinden sonra 50 token bir kez verilir. Ekonomi değerleri ilk sürüm
kararıdır; pilotun öğrenme/istismar verileriyle yeniden değerlendirilir.

## Öğrenme desteği

Öğrenci erişilebilir bir kazanım için kendi notunu iletir, günceller, kapatır veya
yeniden açar. Dersin doğrulanmış sahibi yanıt ekleyip bildirimi kapatabilir.
`set_gap_report` çağrısı aktif üyelik ve ders yetkisini tekrar doğrular; uygulama
rolü destek kayıtlarına veya geçmişe doğrudan yazamaz. Her değişiklik revizyon
ve gerçek aktörle değişmez `gap_events` geçmişine eklenir. Eski bir ekrandan
gelen revizyon başka kişinin yeni notunu kapatamaz; arayüz güncel kaydı yükler.
Aynı isteğin tekrarı yeni geçmiş satırı oluşturmaz.

Destek değişikliği yalnız ilgili öğrencinin bugünden sonraki başlanmamış
planlarını geçersizleştirir. Başlamış veya tamamlanmış plan, ilk cevap, hâkimiyet
ve XP etkilenmez. Özel not ve geçmiş yalnız öğrenciyle ders sahibine açıktır;
öğrencinin kişisel veri dışa aktarımına da dahil edilir.

## Rekabet ve gizlilik

Meydan okumalar aynı aktif dersteki iki öğrenciye aittir. Davet oluşturulduğunda
yayımlanmış en fazla beş sürüm ve müfredat referansları sabitlenir. Her öğrenci
ayrı tek oturumda ilk cevaplarını verir; tekrar ve hız puanı yoktur. Her sorunun
kısmi doğruluk puanı eşit ağırlıkla ortalanır. Sonuç iki öğrenci de bitince açılır;
puan eşitliği beraberliktir. Rakibin cevap/ödev/hâkimiyet verisi açılmaz. Günlük
hedef, Hatalarım, gerçek katılım ve ödül muhasebesi bu turlardan etkilenmez.

Küresel haftalık lig katılımı açık profil onayı gerektirir. İlk grup kişisel XP
bandıyla Kaşif/Gezgin/Usta olarak belirlenir; sonraki hafta önceki grubun sonucu
kullanılır. Grup en fazla 30 kişi tutar. Haftalık puan günlük hedef başına 40'tır,
kişisel ve sınıf XP'sinden ayrıdır. İptal edilen üyelik aynı hafta başka bir
gruba taşınamaz. Açık profil kapatıldığında üyelik çekilir. Eski grup sonuçları
sonraki katılımda veya bakım işleyicisinde bir kez dondurulur.
Beş kişiden küçük grupta seviye sabit kalır; eşitlik sınırını aşan
terfi/düşme yapılmaz. Üniversite üyeliği serbest profil metninden doğrulanmış
kurum üyeliği sayılmaz; kurum ligleri bu karar beklenirken uygulanmaz.

## AI ve dosyalar

AI yalnızca belge analizi ve içerik taslağı üretir; yetki, plan tamamlanması,
not, XP veya para değiştiremez. Kaynak metin talimat kabul edilmez. Çıktılar
şema/kaynak/cevap denetimi ve akademisyen incelemesinden geçer. Koordinatlar
AI tarafından doğru cevap kabul edilmez. Anahtarsız ortamda sahte AI üretilmez.
Belge private depolama, magic-byte/boyut denetimi, SHA-256 tekrar tespiti;
sayfa referanslı parçalar; arka plan kuyruğu, yeniden deneme ve işlem lease'i.

Taranmış PDF sayfaları çözünürlük/süre sınırı içinde Canvas ile render edilip
yerel Türkçe/İngilizce Tesseract ile okunur. Dil modelleri önceden hazırlanır;
OCR çıktısı yüzde güven ve inceleme işareti taşır, akademik doğruluk sayılmaz.
Kaynak yenileme ayrı belge/sürüm oluşturur. Eski alıntılar değişmez soru sürümünde
kalır; yeni üretim yalnız güncel kaynakları kullanır. Kaynağın bütün sürümlerini
kaldırma erişimi keser; fiziksel dosya/metin temizliği 30 gün sonra worker'dadır.
Metadata ve yayımlanmış sorunun kısa kaynak alıntısı geçmiş denetim için korunur.

## Hesap güvenliği

Web kaynakları ders bazında tam HTTPS adresine bağlı açık izindir. Worker,
izin ve ders kapsamı revizyonlarını işe sabitler; DNS/IP denetimi ve tek IP'ye
bağlanma ile yalnız o sayfanın HTML metnini alır. Öğrenciye açma ayrıca gerekir.
İzin değişimi eski metni, sıradaki işi ve yeni üretimi geçersizleştirir; yeniden
açılan izin eski kaydı yetkilendirmez. Web bölümleri PDF sayfalarıyla aynı alıntı
doğrulamasını kullanır. Ödevlerin ayrı PDF erişimi web iznini aşamaz.
Detaylar ve ağ sınırları [web kaynakları belgesinde](web-sources.md).

İşleyici her dakika geçerli lease token'ıyla on dakikalık süreyi yeniler. Devralan
işleyici yeni token alır; eski işleyici taslak/yayın/sonuç yazamaz. Kaynak ve soru
yazımlarında kilit sırası ders → iş → kaynak/soru şeklindedir. Deneme sınırını
dolduran kesintili iş otomatik döngüde kalmaz. Manuel deneme ders sahibine aittir;
güncel kaynak ve AI yapılandırması yeniden doğrulanır. İşin yayın tercihi veya
bütçe/saklama süresi değiştirilmez; kısmi üretim aynı işte saklanır.

Otomatik yayın açık ders sahibi onayına ve revizyonu sabitlenmiş iş politikasına
bağlıdır. Ayrı yapılandırılmış AI denetimi kaynak/cevap/belirsizlik/kazanım
kontrollerinden birinde başarısızsa soru yayımlanmaz. Sonuç değişmez soru sürümüne
kaydedilir; tercih veya soru sürümü değişirse otomatik yayın yetkisi düşer.
Yayın transaction'ı ders/soru/kaynakları kilitleyip güncel erişimi yeniden denetler.
Model incelemesi insan onayı olarak kaydedilmez; `reviewed_by` boş kalır.
Kontrol bütçesi veya bağlantısı kesilirse kaydedilmiş taslak yeniden üretilmez.

Yerel giriş ve şifre değişimi aynı kimlik bilgisi satırını kilitler; eski şifreyle
geç doğrulanan bir giriş şifre değişiminden sonra oturum oluşturamaz. Şifre değişimi
eski oturumları silip yalnız yeni bu cihaz oturumunu açar. Başka cihazları kapatma
kendi geçerli oturumunu korur. Supabase adapteri mevcut şifreyi sağlayıcıya girişle
doğrular ve güncelleme sonrası diğer oturumların yenilenmesini iptal eder.

Kurtarma callback'i sabit APP_ORIGIN ve kapalı yönlendirme listesi kullanır.
URL'deki next alanı kurtarma yetkisi sayılmaz. Sabitlenmiş SDK'nın PKCE verifier'ından
gelen recovery sonucu, doğrulanmış kullanıcı için 20 dakikalık tek kullanımlık
server grant'ına çevrilir. Grant hash'i yalnız sunucuya açık tabloda, ham token
HttpOnly çerezde tutulur. Başka kullanıcı, sahte/bitmiş veya tüketilmiş token
şifre değiştiremez. Gerçek e-posta/Supabase entegrasyonu henüz doğrulanmadı.

## Referanslar

AI bütçesi çağrı başlamadan ortak günlük kilitle rezervasyon ayırır. Fiyatlar
model için yapılandırılır; metin girdisinin UTF-8 bayt uzunluğu, şema/çerçeve payı
ve 6000 çıktı tokenı koruyucu tahmin için kullanılır. Kullanım alanları çıktı
geçerliliğinden önce kaydedilir; belirsiz bağlantıda rezervasyon silinmez.
[Responses çıktı sınırı](https://developers.openai.com/api/reference/resources/responses/methods/create)
görünen yanıtla birlikte akıl yürütme tokenlarını da kapsar. Önbellek indirimleri
uygulanmadığı için hesaplanan maliyet standart tarifeyle tahmindir.

- [Next.js App Router](https://nextjs.org/docs/app/getting-started/installation)
- [Supabase server-side auth](https://supabase.com/docs/guides/auth/server-side/creating-a-client?queryGroups=framework&framework=nextjs)
- [PGlite](https://pglite.dev/docs/)
- [Supabase şifre güvenliği](https://supabase.com/docs/guides/auth/password-security)
- [Supabase kurtarma](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail)
