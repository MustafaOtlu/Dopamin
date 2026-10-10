# Erişilebilirlik kontrolleri

## Dopamin öğrenci arayüzü — 9 Ekim 2026

Öğrencide mobil çekmece yerine sürekli görünen beşli alt menü kullanılır; akademisyen menüsü aşağıda anlatılan çekmece davranışını korur. Öğrenci panelleri 390 ve 1440 pikselde axe, klavye odağı, konu/hazırlık pencereleri ve yatay taşma kontrollerinden geçti. Öğren ekranında görev kutusu yoktur.

Koyu arayüzde lig puanı, işlem geçmişi, seri takvimi, başarımlar ve altı oyun türünün metin/zemin renkleri düzeltildi. Yerel Ece hesabıyla haftalık görev, ödevler, hatalar, lig, sınıf sıralaması, envanter, geçmiş ve ürün önizlemesi de tarandı; bu sekiz görünümde otomatik ihlal veya yatay taşma bulunmadı. Yeniden çalıştırılabilir araçlar `scripts/audit-dopamin.mjs` ve `scripts/audit-dopamin-details.mjs`; sonuçlar `.data/previews/` altında tutulur. Otomatik araçların görüntü/gradient üzerinde kararsız kaldığı alanlar için aşağıdaki sınırlar geçerlidir.

## Önceki ortak ve akademisyen arayüzü

Ortak metin ve durum renkleri açık zeminlerde güçlendirildi. Renkli kartlardaki
beyaz yazılar için mor/okyanus arka planları koyulaştırıldı. Durumlar metin ve
ikonla birlikte sunulur; yalnız renkle aktarılmaz.

Gradientler otomatik araçta `incomplete` kalır. Son görsel kontrolde beyaz yazı
için en açık mor ve okyanus uç renkleri ayrıca hesaplandı: yaklaşık 5,25:1 ve
4,90:1. Üst etiketin zemini koyulaştırıldı; mobilde yazının arkasına taşan
dekoratif yol görseli kaldırıldı. Bu kontrol diğer kullanıcı içeriklerinin
veya ileride değişecek temaların okunabilirliğini garanti etmez.

Ana alana geçiş bağlantısı odağı içeriğe taşır. Mobilde kapalı menü klavyeye
ve ekran okuyucuya gizlidir. Açık menü adlandırılmış bir pencere olarak çalışır;
arka plan inert olur, Tab/Shift+Tab menüde kalır, Escape veya kapatma odağı
açan düğmeye döndürür. Masaüstü genişliğine dönüldüğünde mobil pencere kapanır.
Ortak dialog bileşeni başlığından ad alır ve aynı odak/kaçış davranışını kullanır.

Ders sekmeleri adlandırılmış panelle bağlıdır. Oklar önceki/sonraki, Home/End
ilk/son sekmeye geçer; yalnız seçili sekme normal Tab sırasındadır. Form alanları
etiketlidir. Oyunlarda doğru/yanlış düğmeleri, eşleştirme/kategori seçimleri,
sıralama taşıma düğmeleri ve görsel konum alanları klavye alternatifleridir.
`prefers-reduced-motion` animasyonları, geçişleri ve yumuşak kaydırmayı kapatır.

## Tekrarlanabilir kontroller

```powershell
npm run test:e2e -- e2e/accessibility.spec.ts e2e/m1.spec.ts e2e/games.spec.ts
```

İzole test verisinde giriş/kayıt/kurtarma, öğrenci/akademisyen ana sayfaları,
ders sekmeleri, destek penceresi, ödül, lig, geçmiş, profil ve meydan okuma
sayfaları axe ile taranır. Altı oyun türünün gerçek çözüm ekranları da mevcut
uçtan uca testlerde taranır. Kural kapatma veya ihlal istisnası yoktur.
İhlaller ve otomatik karar verilemeyen `incomplete` bulguları test raporuna eklenir.
Mobil menü, dialog, sekme, odak dönüşü, yatay taşma ve hareket azaltma ayrıca
klavye/boyut kontrollerinden geçer.

Çalışan yerel örnek ortamı yalnız okuyarak taramak için:

```powershell
node scripts/audit-accessibility.mjs
```

Bu araç varsayılan olarak `http://127.0.0.1:3000` adresindeki örnek hesapları
kullanır; canlı kullanıcılar için tasarlanmamıştır. Sonuçlar
`.data/accessibility/audit.json` dosyasına yazılır. Form göndermez, not veya
cevap oluşturmaz. Ekran durumu/açık kayıtlar sonuçları etkileyebilir.

## Sınırlar

Otomatik tarama erişilebilirliğin tamamını doğrulamaz. Özellikle PDF/görsel
açıklamalarının eğitim açısından yeterliliği, gradient/görsel üzerindeki yazı,
gerçek ekran okuyucuda geri bildirim akışı, yakınlaştırma ve farklı
cihaz/tarayıcı davranışı insan değerlendirmesi gerektirir. Bu kayıt WCAG
uygunluk sertifikası veya gerçek kullanıcı pilotu yerine geçmez.
[Playwright erişilebilirlik rehberi](https://playwright.dev/docs/accessibility-testing)
otomatik tarama ile kullanıcı değerlendirmesini birlikte önerir.

Pilot öncesinde NVDA/Firefox ve VoiceOver/Safari ile giriş → ders → altı oyun
→ geri bildirim → ödev/destek → çıkış akışı, yüzde 200/400 yakınlaştırma ve
ekran okuyucuyla görsel konum alternatifinin kullanılabilirliği gözden geçirilmeli.
