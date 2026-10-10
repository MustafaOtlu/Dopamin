# Uygulama durumu — 9 Ekim 2026

## Dopamin öğrenci yenilemesi

Onaylanan yeni beş panel, penguenli karanlık tasarım, konu bazlı tekrar/hazırlık, süreli Klasik/Seri maç, haftalık gerçek XP, seviye kilitli 39 ürün ve öğrenciye özel kozmetikler uygulandı. Kurulabilir Android debug APK üretildi ve imzası doğrulandı. [Güncel ürün kuralları](dopamin.md) · [APK ve test rehberi](android-testing.md). Aşağıdaki eski kilometre taşlarındaki marka ve rekabet notları yeni kurallar tarafından güncellenmiştir.

Son doğrulama: 20 dosyada 113 birim/entegrasyon testi, 18/18 Chromium uçtan uca senaryo, TypeScript, ESLint ve ayrı `.next-build` üretim derlemesi geçti. Beş öğrenci panelinin mobil/masaüstü erişilebilirliği, sekiz alt görünüm ve yatay taşma kontrol edildi. İki ayrı hesapla Klasik/Seri maç, ortak başlangıç, yenilemede değişmeyen sayaç ve iki oyuncuya ödül tarayıcıda doğrulandı. Aynı seçili dersi tekrar seçince oluşabilen sonsuz yükleme düzeltildi. Demo giriş sınırını tüketmemek için ilgili testler gerçek oturumu yeniden kullanır; uygulamanın giriş sınırı değişmedi. Android cihaz bağlı olmadığından fiziksel cihaz denemesi kullanıcıya bırakılan doğrulama adımıdır.

Son arayüz düzeltmeleri: bütün emojiler özgün çizimlerle değişti; penguen alkış/üzülme/kutlama tepkileri ve dokunma/fare animasyonu aldı. Özel ders seçici ve yanına ders ekleme eklendi. Oturumdan dönüşte seçili ders korunuyor. Kişisel önizleme gerçek profil üzerinden çalışıyor; 39 önizlemenin mobil Axe/taşma taraması temiz. Klasik davet eden kabulü beklemeden oynar; Seri oda katılımıyla ortak başlar. Son cevap kutusu düzenlemesinden sonra ilgili 6 tarayıcı testi de yeniden geçti.

## M1 — doğrulandı

- Next.js 16.4 / React / TypeScript / Tailwind ve kalıcı PostgreSQL (yerel PGlite).
- Parametreli SQL migration'ları, sunucu yetkilendirmesi ve gerçek RLS.
- Yerel hesap/giriş/oturum; Supabase Auth adaptörü; akademisyen doğrulama kapısı.
- Ders, süreli/iptal edilebilir kod, benzersiz üyelik; öğrenci çıkarma.
- Konu/kazanım ayrımı; yayımlandıktan sonra değişmez etkinlik sürümleri.
- Altı etkinlik şeması/oyuncusu, manuel editör, önizleme ve yayın.
- Sunucuda değerlendirme, idempotent cevap kaydı, sürdürülebilir oturum.
- İlk deneme/oturum tekrarı/Hatalarım ayrımı; sadece Hatalarım doğru cevabı kapatır.
- Akademisyen sınıf sonuçları ve kazanım analizi; temel hâkimiyet tahmini.
- Altı tür, klavye alternatifleri ve görsel bölge editörü tarayıcıda doğrulandı.

## M2 — içerik hattı çalışıyor, kapsam eksikleri var

Özel PDF/görsel yükleme, imza/boyut/erişim kontrolleri ve SHA-256 tekrar tespiti;
gerçek PDF.js metin/sayfa/parça çıkarma; iş kuyruğu/lease/yeniden deneme;
yapılandırılmış AI sağlayıcı adaptörü; kapsam soruları; akademisyen tarafından
düzenlenip onaylanan müfredat; kaynak alıntısı doğrulanan ve inceleme bekleyen
etkinlikler; kullanım token ve tahmini maliyet kaydı; günlük ortak maliyet bütçesi
için atomik rezervasyon; tamamlanmayan istekte rezervasyonun korunması;
geçersiz AI çıktısında da kullanım kaydı; bütçe dolunca işin ertesi güne alınması.

Yeni: taranmış sayfaları gerçek render + yerel Türkçe/İngilizce OCR ile çıkarma;
sayfa/güven ve inceleme işareti; sınırlı süre/çözünürlük ve 20 taranmış sayfa sınırı.
Kaynak sürümü yenileme, önceki sürümü inceleme ve eski soru referanslarını koruma;
eşzamanlı hash tekrarının tek dosya oluşturması; kaldırılan PDF'yi yeniden yükleme;
erişimi hemen kapatma ve 30 gün sonunda idempotent fiziksel dosya/metin temizliği.
Yeni sürüm veya kaldırma, bekleyen eski taslak/üretim işini geçersizleştirir.

İsteğe bağlı otomatik yayın: ders sahibinin açık onayı, sunucudan sabitlenen tercih;
ayrı bütçeli AI kaynak/cevap/belirsizlik/kazanım denetimi; başarısız veya değişmiş
sorunun incelemede kalması. Yayın tercihi değişimi eski işlerin otomatik yetkisini
iptal eder. İnceleme bütçesi bittiğinde kaydedilmiş sorular yeniden üretilmez.
Bu hattın test sağlayıcısıyla doğrulanması gerçek akademik doğruluk kanıtı değildir.

Ders bazında izinli tam HTTPS adresleri, DNS/IP sabitlemeli web okuma ve özel
metin kayıtları eklendi. Kaynak/izin/kapsam revizyonu, değişmez sürüm, bölüm alıntısı,
öğrenciye ayrı paylaşım ve izin kapatmada erişim/üretim iptali çalışıyor. İzni
yeniden açmak eski metni yetkilendirmiyor. Gerçek MDN sayfası çalışan uygulamada
okundu. Test verisinde okuma sırasında izin iptali/işleyici değişimi dosya sızıntısı
oluşturmuyor; ödev PDF erişimi web iznini aşamıyor. [Ağ sınırları](web-sources.md).

Eksikler: gerçek AI/Supabase bağlantısı; görsel/tablo semantiği;
akademisyen onaylı çok disiplinli AI değerlendirme seti.

## M3 — yerelde doğrulandı

Kişisel ve bütün dersleri kapsayan günlük plan; önem/hafta/ön koşul/eksik/aralıklı
tekrar öncelikleri; dersler arasında dengeli sıra; hâkimiyete göre görev boyu;
sabit plan ve sürüm referansları; tamamlanınca yeni günlük görev eklenmemesi;
gelecekteki içerikle boş günün doldurulmaması; müfredat revizyonlarının yalnız
başlanmamış planları yenilemesi. Yeni yayın/üyelik geçmiş tarihe uygulanmaz.

## M4 — yerelde doğrulandı

Hatalarım ve ileri öğrenme; farklı soru/günlerden hâkimiyet tahmini; özel geçmiş
ve sabit sayfalama; sınıf/günlük katılım/kazanım analizi; öğrenciye özel ve dersle
sınırlı analiz; analizden hedefli ödev. İnteraktif veya metin/link/özel PDF ödevleri;
hedef kitle/soru sürümü sabitleme; ilk deneme puanı; son tarih/geç teslim;
geri çekme, iade, yeniden teslim ve revizyon geçmişi; not/geri bildirim;
kapatma/açma/süre uzatma.

Öğrenci kazanım için özel destek notu bırakabilir; notunu güncelleyebilir,
bildirimi kapatabilir veya yeniden açabilir. Akademisyen öğrenci analizinden
notu görür ve yanıtlayıp kapatır. Revizyon çakışması eski ekranın yeni notu
ezmesini önler; gerçek aktörlü geçmiş saklanır. Yalnız öğrencinin başlanmamış
planları yenilenir, çalışma/başarı/XP değişmez. Beş PostgreSQL testi ve iki
tarayıcı bağlamında öğrenci-hoca akışı doğrulandı.

## M5 — geliştirme sürüyor

Çalışan: olay bazlı XP/token; günlük adım için 40 XP ve günlük hedef için 10 token;
gönüllü kazanım çalışmasına bir kez XP; tekrarın rekabet puanı üretmemesi;
atomik/idempotent alışveriş; envanter, avatar/çerçeve/tema ve başarımlar;
ders bazlı haftalık sıralama/geçmiş haftalar; eşit puanda ortak sıra.

Yeni: ayrı gerçek çalışma/hedef/telafi/koruma kayıtları; içeriksiz günün nötr olması;
ardışık seri; haftada bir ücretsiz telafi (bugünün gerçek günlük hedefinden sonra,
aynı haftanın kaçırılan günü); koruyucunun bir kez kullanılması (son yedi gün);
yedi hedef/telafi ile bir kez 50 token sandığı. Koruyucu sandık hedefi veya gerçek
çalışma sayılmaz. PostgreSQL ve tarayıcı doğrulaması geçti.

Çalışan rekabet: sınıf arkadaşına davet/kabul/red/iptal; iki öğrenci için aynı
değişmez en fazla beş soru; tek ilk cevap; sonuçların iki tur sonrası açılması;
ortak puan/beraberlik ve özel geçmiş; davet süresi ve oluşturma sınırı. Bunlar
öğrenme hâkimiyeti, Hatalarım, günlük hedef veya XP üretmez.

İsteğe bağlı küresel haftalık lig: açık profil için katılım onayı; en fazla 30
kişilik ve üç seviyeli gruplar; günlük hedeften ders sayısından bağımsız 40 puan;
geçmiş sonuçların sonraki katılımda dondurulması; en az beş kişilik gruplarda
eşitlikleri ayırmadan üst/alt yüzde 20 için seviye geçişi; görünürlüğü kapatınca
ligden çıkış; aynı hafta grup değiştirmeye izin verilmemesi.

Küresel eski gruplar yeni katılım olmasa da bakım işleyicisiyle kapatılır.
Eksikler: doğrulanmış üniversite toplulukları/üniversiteler arası sezonlar;
gerçek kullanıcı sayısında adalet/istismar değerlendirmesi. Kurum doğrulama kararı ertelendi.

## M6 — hesap ve yönetim araçları gelişiyor

İşlem merkezi ders bazında sıradaki/işlenen/zamanı bekleyen/inceleme isteyen işleri
gösterir. Yalnız ders sahibi tamamlanamayan güncel kaynak işini en fazla beş kez
yeniden deneyebilir; ücretli kısmi üretim korunur. Bütçe beklemesi ve dosya saklama
süresi yeniden deneme düğmesiyle aşılamaz. Uzun işlerde dakika başına lease
yenilemesi, her devralmada ayrı token ve yazım öncesi sahiplik denetimi vardır.
Süresi dolup deneme sınırını dolduran kesintili iş kullanıcı incelemesine geçer.

Ders adı/kodu/dönemi/rengini düzenleme; davet süresini gösterme, kod iptali,
eşzamanlı kod yenilemede tek aktif davet; ders arşivleme/geri açma arayüzleri.
Arşiv üyelik ve geçmiş sonuçları korur, eski kodu yeniden etkinleştirmez.
Öğrenci çıkarılırken başlanmamış planlar geçersizleştirilir.

Yerel şifre değişimi mevcut şifre doğrulama, 12 karakterlik yeni şifre,
kimlik bilgisi kilidi ve bütün eski oturumları iptal ederek tek yeni oturum açar.
Diğer cihazları kapatma arayüzü hazır. Supabase parola değişimi/doğrulama,
PKCE callback ve e-posta kurtarma adaptörleri hazır; kurtarma yetkisi süreli,
tek kullanımlık, kullanıcıya özel ve yalnız sunucudan erişilebilir.
Gerçek Supabase/e-posta teslimi doğrulanmadı; yerelde kurtarma kapalıdır.

Kişisel JSON veri indirme; öğretmenin geniş ders yetkisine rağmen yalnız kendisine
ait kayıtlar; kimlik bilgisi/token/depolama anahtarı hariç. Sonucu açılmamış meydan
okuma puanları maskelenir. Dosyaların metadata'sı dahil, ham dosyaları ayrı indirilir.

Ortak metin/durum kontrastları, adlandırılmış dialog ve odak dönüşü, mobil
menünün kapalıyken gizlenmesi/açıkken odağı tutması, Escape, ders sekmelerinin
ok/Home/End tuşları ve bağlı paneller tamamlandı. Altı oyun türü axe taramasına
eklendi. Yerel örnek veride 28 ekran/durum taramasında otomatik ihlal bulunmadı;
otomatik karar verilemeyen bulgular raporda korunur. Gerçek ekran okuyucu ve
kullanıcı değerlendirmesi bekliyor; kapsam `docs/accessibility.md` içindedir.

Soru geçişi sırasında önceki geri bildirim yeni soru yüklenene kadar korunur.
Gecikmiş ağ yanıtı eski cevap düğmelerini açmaz; başarısız yükleme tekrar
denenebilir. Tarayıcı testi isteği bekleterek bu durumu ayrıca doğrular.

## Test kanıtı

- Son tam kontrolde 104 Vitest testi (19 dosya), lint, TypeScript ve üretim derlemesi geçti.
- Erişilebilirlik, destek ve web kaynağı akışıyla 16 Chromium testi tek çalıştırmada geçti:
  manuel yayın/katılma/oynama/analiz, mobil görünüm, PDF erişimi, günlük plan/
  yanlış tekrarı/devam/mağaza/lig onayı ve çıkış, ödev iade/yeniden teslim,
  kalan üç oyun türü ve iki öğrencili meydan okuma, kaynak sürümü/kaldırma,
  ders ayarları/kod iptali/arşivden açma, şifre değişimi/diğer cihazlar/veri indirme,
  işlem merkezinden gerçek PDF yeniden deneme; öğrenci destek notu/yanıt/geçmiş,
  eski ekran çatışması ve yeniden açma; panel/form/oyun erişilebilirlik taraması,
  mobil menü ve dialog klavyesi; geciktirilmiş soru geçişi; web metni indirme/paylaşma,
  izin kapatınca dosya erişiminin kesilmesi ve yeniden açmanın eski kaydı yetkilendirmemesi.
- Son kaynak/kilit düzenlemelerinden sonra web, PDF/AI ve otomatik yayın kapsamındaki
  22 Vitest testi, üretim derlemesi ve yukarıdaki tam Chromium turu yeniden geçti.
- Web okuma için URL/IP/DNS sabitleme, yönlendirme, gövde/sıkıştırma sınırı,
  karakter kümesi, izin iptali ve lease devralma testleri var. Gerçek MDN okuması
  yerel uygulamada ayrıca yapıldı; gerçek AI çağrısı yerine sayılmaz.
- CI dosyası hazır; uzak CI ve canlı dağıtım doğrulanmadı.

## Devam eden işler

M5 rekabet ve M2 kapsam eksikleri; M6 gerçek hesap kurtarma entegrasyonu,
hesap silme, genel dosya yaşam döngüsü ve
geri yükleme, hata/performans izleme ve yük testi, gerçek ekran okuyucu/cihaz değerlendirmesi,
gerçek kurum doğrulaması, AI doğruluk değerlendirmesi ve kullanıcı pilotu.
Yapılmamış adımlar tamamlanmış sayılmaz.

## Dış erişim gerektiren adımlar

Supabase proje URL/anahtarları ve PostgreSQL bağlantısı; AI sağlayıcı anahtarı/model;
canlı barındırma hesabı; akademisyen doğrulama sürecinin kurum tarafından sahiplenilmesi;
gerçek akademisyen ve öğrencilerle pilot. Yerel kod ve kurulum hazırlıkları yapılır;
gerçek bağlantı/pilot/yayın kanıtı olmadan bu aşamalar onaylanmaz.


## Öğretmen defteri — 9 Ekim 2026

Classroom, Canvas ve Moodle araştırması sonrası öğretmen çalışma masası, dersler arası bekleyen işler ve teslim ajandası, filtreli not defteri, CSV dışa aktarım, konu/yayın durumu araması ve katılım filtreleri eklendi. Öğretmen alanına bağımsız açık/karanlık defter görünümü uygulandı; oyun sıralaması arayüzden ve öğretmen API erişiminden kaldırıldı. Araştırma bağlantıları, kapsam ve deneme adımları [teacher-workspace.md](teacher-workspace.md) içinde.

Doğrulama: 119 Vitest testi, 20 Chromium testi, lint, TypeScript ve üretim derlemesi geçti. 12 görünüm ve 6 öğretmen dialogunun otomatik erişilebilirlik taramasında ihlal bulunmadı. Son çalışma yerelde http://127.0.0.1:3000 adresinde açıldı.
