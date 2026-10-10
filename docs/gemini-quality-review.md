# 10 Ekim 2026 — taşıma onarımı ve Gemini kalite incelemesi

İnceleme kullanıcının içerik kalitesi şikâyetine odaklandı. Sağlayıcı ve model değişmedi. İlk turda anahtar bulunmadığından canlı test yapılmadı; kullanıcı bağlantıyı yapılandırdıktan sonraki canlı denemeler aşağıda ayrı kaydedildi. Önce/sonra kalite veya hız artışı nicel olarak ölçülmüş değildir.

## Bulunan sorunlar

Kaynak sorgusu belgelerin sadece ilk 30 parçasını getiriyordu. Sonraki sayfalardaki kazanımlar modele ulaşmıyordu. Aynı sınır müfredat onayında geçerli alıntıların reddedilmesine de neden olabiliyordu.

Her yeni soru işi tür döngüsünü sıfırlıyordu. Varsayılan üç soruluk üretim sürekli doğru/yanlış, eşleştirme, sıralama türleriyle başlıyor; boşluk ve kategori türlerine ulaşmıyordu. Önceki sorular yalnız aynı işin başlıklarından ibaretti.

Model her tür için tüm türlere ait alanları dolduruyordu. Soru üretimindeki yapısal/alinti hatası işi doğrudan durduruyor, somut geri bildirimle düzeltme şansı vermiyordu. Gemini düşünme düzeyi sabit `low` idi.

## Uygulanan değişiklikler

Kaynak seçimi bütün izinli parçaları yerelde değerlendirir; kazanımla ilgili bölümleri ve komşu parçaları önceler. Müfredat analizi belge başına dengeli, bütün belge boyunca dağılmış örnekleme kullanır. Kaynakların tamamı tek isteğe sığmadığında kapsam bilgisi kaydedilir.

Tür bazında daha küçük çıktı sözleşmeleri, uygulama/yorumlama odaklı yönergeler, mevcut kazanım sorularını hesaba katan çeşitlilik ve sınırlı düzeltme eklendi. Bütçe, alıntı, iş sahipliği, kaynak erişimi ve yayın kontrolleri korunur. Ayrıntılar `docs/gemini.md` içinde.

## Taşımadan kaynaklanan onarımlar

24 TypeScript/arayüz dosyası ve 3 stil dosyası geri getirildi. Kaynak haritaları aynı bilgisayara taşınmış eski `.next/dev` ve `.next-build` derlemelerinden okundu; üçüncü taraf paket kaynakları kullanılmadı. Mevcut dosyalar ezilmedi. `bootstrap.ts` iç içe taşınmış `Dopamin/src/types` kopyasından alındı.

Kurtarılan dosyalar Gemini adaptörü, öğretmen/öğrenci panelleri, öğretmen çalışma masası/not defteri, profil görselleri, penguen bileşenleri, eşleştirme/sıralama bileşenleri, hazırlık ekranı, ortak yardımcılar ve üç ana stil dosyasını içerir. Öğrenci panelinin iki kaynak kopyası arasındaki tek fark Bootstrap tipinin import yoluydu; doğrudan tip dosyasını kullanan kopya alındı.

İç içe duran eksik `Dopamin/` kopyası silinmedi; ana projenin tip/lint taramasından çıkarıldı. Eksik `test-e2e.mjs` yerine mevcut Playwright yapılandırması doğrudan çalıştırılır. Seed'in bulunamayan ek demo içerik betiğine bağımlılığı kaldırıldı; seed dosyasında zaten bulunan temel ders/etkinlikler korunur. Eski ek demo içeriklerinin tamamı yeniden oluşturulmuş sayılmaz. Mevcut kullanıcı veritabanında seed çalıştırılmadı.

`.env.local` daha önce bulunmadığı için boş anahtarlı şablon oluşturuldu; gerçek anahtar yerelde eklenmelidir.

## Kalan sınırlar

Sözcük eşleştirmesi anlamsal veya diller arası arama değildir. Uzun belgeler örneklenir; görsel ve tabloların tüm anlamı metne taşınmayabilir. Aynı alıntının kaynakta bulunması cevabın akademik doğruluğunu kanıtlamaz. Son karar için gerçek ders PDF'leriyle öğretmen değerlendirmesi gerekir. Orta düşünme düzeyi ve gerekirse düzeltme çağrısı gecikme/maliyeti artırabilir.

Canlı değerlendirmede aynı kazanımdan üretilen sorular kaynak desteği, tek doğru cevap, kazanım uyumu, Türkçe açıklık ve tekrar açısından karşılaştırılmalıdır. Yeni çıktılar kontrol edilmeden otomatik yayın açılmamalıdır.

## Doğrulama sonuçları

- Genel test turu: 21 dosyada 128 test başarılı. Ardından eklenen geç sayfa/müfredat onayı regresyonu dahil odaklı tur: 3 dosyada 31 test başarılı. Son küçük istek bağlamı düzenlemesinden sonra 24 AI birim testi yeniden başarılı.
- `npm run lint`, değişen dosyalarda son lint/biçim kontrolü ve `npm run typecheck` başarılı.
- `npm run build` başarılı; kurtarılan ekranlar, stiller ve fotoğraf rotaları derlendi.
- `npm run test:e2e -- e2e/m1.spec.ts e2e/queue.spec.ts`: 4 Chromium senaryosu başarılı. Ders/etkinlik yönetimi, öğrenci çözümü, mobil taşma/gezinme, PDF yükleme/erişim ve kuyruk yetkileri kapsandı. Tam tarayıcı test paketi bu turda çalıştırılmadı.
- Eksik Chromium test bileşeni `.data/playwright-browsers` içine kuruldu. Playwright yapılandırması bu yerel kurulum varsa onu kullanır; açıkça verilmiş tarayıcı yolu ayarı önceliklidir.
- İlk derleme/tip üretimi Windows araç izin sınırına takıldı; normal yerel izinle tekrarlandığında tamamlandı. İlk tarayıcı turu eksik tarayıcı nedeniyle başlamadı; kurulumdan sonraki tur geçti.
- İlk turda gerçek Gemini isteği yapılmadı. Önceki bilgisayardan taşınmış canlı raporlar yeni değişikliklerin ölçümü olarak kullanılmadı.

## Otomatik müfredat ve canlı deneme

Öğretmenin istediği yeni akışta zorunlu müfredat doğrulama formu kaldırıldı. **Müfredat PDF yükle**, metin çıkarıldıktan sonra Gemini analizini otomatik sıraya alır. Mevcut kaynaklar **Müfredatı oluştur** ile işlenebilir. Yeni akış uzun PDF'nin tüm metin parçalarını sınırlı bölümler halinde işler; tamamlanan bölümleri kaydeder. Tüm alıntılar doğrulandıktan sonra konu/kazanımlar tek işlemde derse eklenir. Eksik tarih/hafta için geçici takvim açıkça belirtilir. Eski başarısız analizlerin yeniden denemesi de otomatik akışı kullanır.

- Kullanıcının yüklediği 40 sayfalık `1-İSG Kavram ve Kuralları-Giriş (Özet).pdf`, uygulama arayüzünden gerçek Gemini API ile işlendi: **5 konu, 19 kazanım** otomatik eklendi. Kazanımlar elle yazılmadı. Etkinlik üretimi düğmesi açıldı.
- Analiz öncesi/sonrası ekranda gösterilen birikimli maliyet farkı yaklaşık **$0.0164**; bu yerel fiyat ayarlarına dayalı tahmindir.
- Önceki canlı turda `Gemini PDF Denemesi` dersindeki PDF'den uygulama üzerinden 5 etkinlik üretilmiş ve incelemeye bırakılmıştı.
- Genel doğrulama: 22 dosyada 135 test geçti; ardından eski analizlerin yeniden denenmesi için eklenen test dahil otomatik müfredatın 7 odaklı testi geçti. Tip denetimi, lint ve üretim derlemesi başarılı.
- Yeni otomatik kazanımlardan “Reaktif ve proaktif yaklaşım arasındaki farkı açıklayabilmek” seçilip aynı İSG PDF'sinden arayüz üzerinden 1 gerçek Gemini etkinliği üretildi; incelemede bırakıldı. Bu ek çağrı için ekranda gösterilen tahmini maliyet farkı $0.0032.
- Son tarayıcı doğrulamasında ders/etkinlik yönetimi, mobil gezinme, PDF yükleme ve kuyruk yetkilerini kapsayan 4 Playwright senaryosu geçti. Kullanıcının mevcut veritabanından ayrı test veritabanı kullanıldı.
