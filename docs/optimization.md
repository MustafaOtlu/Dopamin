# Boyut optimizasyonu — 10 Ekim 2026

## Web

Öğrenci ve öğretmen arayüzleri aynı açılış paketinden ayrıldı. Hesap bilgisi bir kez alınır; yalnız ilgili rolün bileşeni indirilir. Öğretmenin soru düzenleyicisi gerektiğinde yüklenir. Soru türü etiketleri doğrulama şemasından ayrıldı; liste ekranı sırf etiketler için Zod yüklemez. Görseller, fontlar, yerleşim ve hesap verileri değiştirilmedi.

Üretim sunucusunda boş tarayıcı önbelleğiyle ölçülen ilk açılış JavaScript'i:

| Ölçüm                            |         Önce |        Sonra | Azalma |
| -------------------------------- | -----------: | -----------: | -----: |
| Öğrenci — sıkıştırılmış aktarım  | 229.729 bayt | 170.653 bayt |  %25,7 |
| Öğrenci — açılmış JavaScript     | 791.266 bayt | 571.557 bayt |  %27,8 |
| Öğretmen — sıkıştırılmış aktarım | 229.729 bayt | 191.094 bayt |  %16,8 |
| Öğretmen — açılmış JavaScript    | 791.266 bayt | 646.832 bayt |  %18,3 |

Bu rakamlar ilk açılışta kullanılan dosyalardır; bütün site dosyalarının toplamı değildir. Masaüstünde beş öğrenci paneli ve üç öğretmen paneli ile mobil öğren ekranı karşılaştırıldı: **9/9 ekran, sıfır farklı piksel**. Aynı izole veritabanı kullanıldı. Yerel açılış zamanları ağ/işlem yüküne bağlıdır; indirme azalması her ortam için kesin bir hız yüzdesi anlamına gelmez.

## Android

APK **4.120.742 → 1.209.249 bayt** (%70,7 azalma). R8 kod ve kaynak küçültme etkin; JavaScript köprüsü ve eklenti kuralları korunur. Debug imzası ve uygulama kimliği değişmedi. 8 web varlığının dosya özetleri aynı, APK v2 imzası doğrulandı. Fiziksel cihaz bağlı değildi. [Kurulum ve geri dönüş seçeneği](android-testing.md).

## Klasör temizliği

Toplam çalışma klasörü yaklaşık **6,31 GB → 3,15 GB**. Bu boyuta geliştirme bağımlılıkları ve Android araçları dahildir; APK boyutu değildir.

İlk temizlik **3.228.001.050 bayt** (yaklaşık 3,23 GB) kaldırdı: eski izole E2E veritabanları, kullanılmayan Next test çıktıları, eski derleme önbelleği yedeği ve açılmış Java/Android kurulum ZIP'leri. Aktif veritabanı, yüklenen PDF/fotoğraflar, API anahtarı, kaynak kodları, Android SDK/JDK ve geliştirme bağımlılıkları korunur. Test ve derleme önbellekleri çalıştıkça yeniden oluşabilir.

Windows'ta `npm run clean` yalnız izinli test/derleme yollarını temizler; 3001 test sunucusu açıksa durur. Silinecekleri görmek için:

`powershell.exe -ExecutionPolicy Bypass -File scripts/clean-workspace.ps1 -WhatIf`

`npm run test:e2e` her koşuya benzersiz bir veri klasörü verir; başarılı koşudan sonra sunucu kapandığında yalnız o klasörü kaldırır. Başarısız test verileri ve test raporları inceleme için tutulur. Canlı veritabanı bu araçların hedefi değildir.

## Doğrulama

- 132 Vitest testi, 24 dosya: geçti.
- 22 Playwright senaryosu: geçti; başarılı testin geçici verisi otomatik temizlendi.
- Lint, TypeScript ve üretim derlemesi: geçti.
- Karşılaştırma ölçümleri ve görüntüler yerelde `.data/optimization/` altında tutulur.
