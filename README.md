# Dopamin

Üniversite dersleri için kaynaklara dayalı etkileşimli öğrenme platformu. Öğretmen dersleri, kaynakları ve etkinlikleri yönetir; öğrenci günlük çalışmalarını ve tekrarlarını tamamlar.

## Yerel çalıştırma

Node.js 22.13 veya üzeri gerekir. Bağımlılıklar eksikse `npm ci` çalıştır.

1. `.env.local` yoksa `.env.example` dosyasını bu adla kopyala. Mevcut ayarları ezme.
2. Gemini için `.env.local` içindeki `AI_API_KEY` değerini doldur. Model, düşünme düzeyi ve bütçe ayarları aynı dosyadadır. Anahtar yokken manuel işlemler kullanılabilir.
3. Yeni, boş bir kurulumda `npm run db:seed` ile örnek hesapları oluştur. Mevcut `.data/postgres` klasörü taşındıysa önce uygulamayı açıp mevcut kayıtları kontrol et. Sunucu açıkken aynı veritabanında seed/migration çalıştırma.
4. `npm run dev` ile başlat; [yerel uygulamayı](http://127.0.0.1:3000) aç.

Örnek hesaplar: `akademisyen@pusula.local`, `ogrenci@pusula.local`; yerel örnek parola `PusulaDemo2026!`.

Taranmış PDF'ler için `npm run ocr:prepare` gerekir. Dosyalar `.data/files`, yerel veriler `.data/postgres` altında tutulur.

## PDF’den otomatik müfredat

Derste **Kaynaklar ve AI → Müfredat PDF yükle** seçeneğiyle öğretmen yalnız PDF’yi seçer. Metin çıkarıldıktan sonra Gemini konu ve kazanımları oluşturup derse otomatik ekler; zorunlu doğrulama formu yoktur. Önceden yüklenmiş PDF için kaynağı seçip **Müfredatı oluştur** kullanılabilir. Kazanımlar hazır olunca **Etkinlik üret** açılır.

PDF’deki açık hafta ve tarihler korunur. Eksik takvim için işlem tarihinden başlayan geçici haftalık plan kullanılır; **Müfredat → Takvimi düzenle** ile değiştirilebilir. Uzun belgelerin tüm metin parçaları bölümler halinde işlenir. Tamamlanan bölümler kaydedildiğinden kesinti sonrası yeniden deneme kaldığı yerden sürer. Kaynak alıntıları doğrulanmadan müfredat eklenmez; aynı konu/hafta/kazanım yeniden oluşturulmaz.

## Doğrulama

`npm test`, `npm run lint`, `npm run typecheck`, `npm run build`.

Tarayıcı testleri: `npm run test:e2e`. Ayrı veritabanı ve 3001 portunu kullanır.

## Belgeler

- [Gemini bağlantısı, kalite ayarları ve sınırlar](docs/gemini.md)
- [Taşıma onarımı ve kalite incelemesi](docs/gemini-quality-review.md)
- [Ürün deneyimi](docs/dopamin.md)
- [Android denemeleri](docs/android-testing.md)
