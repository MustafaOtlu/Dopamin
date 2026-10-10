# Dopamin'i Android'de dene

Hazır APK: `C:\Users\emreyalcib\Desktop\Dopamin\.data\releases\dopamin-debug.apk`.

Bu, telefonun ana ekranından açılan Android uygulamasıdır. İlk deneme sürümü bilgisayardaki sunucuya USB üzerinden bağlanır; bilgisayar açık, sunucu çalışır ve USB bağlı olmalı. APK tek başına çevrimdışı ders sunmaz. Canlı sunucu adresi bağlandığında USB gereksinimi kaldırılabilir.

## 1. Bilgisayarda sunucu

Uygulama şu anda [127.0.0.1:3000](http://127.0.0.1:3000) adresinde. Kapandıysa proje klasöründe PowerShell aç:

```powershell
cd C:\Users\emreyalcib\Desktop\Dopamin
npm.cmd run dev
```

Bu terminal açık kalsın. Sunucu zaten çalışıyorsa ikinci kez başlatma. Mevcut hesapların ve alışverişlerin korunur; yeniden seed çalıştırman gerekmez.

## 2. Telefonu bağla ve kur

1. Android telefonda **Geliştirici seçenekleri → USB hata ayıklama** açık olsun. Geliştirici seçenekleri kapalıysa Ayarlar → Telefon hakkında bölümünde **Derleme numarası** üzerine yedi kez dokun. Menü isimleri telefona göre değişebilir.
2. Telefonu veri aktarabilen USB kablosuyla bilgisayara bağla. Telefonda çıkan USB hata ayıklama iznini bu bilgisayar için onayla.
3. İkinci PowerShell terminalinde:

```powershell
cd C:\Users\emreyalcib\Desktop\Dopamin
powershell.exe -ExecutionPolicy Bypass -File .\scripts\install-android.ps1
```

Komut, bu proje içindeki Android aracını kullanarak 3000 portunu telefona yönlendirir, APK'yi kurar ve **Dopamin**'i açar. Android Studio kurman gerekmez. Aynı anda yalnız bir Android telefon/emülatör bağlı olsun.

Kabloyu çıkarıp yeniden bağlayınca aynı komutu tekrar çalıştır. `install -r` mevcut uygulama verisini korur. `unauthorized` görürsen telefon ekranındaki izni onayla; hiç cihaz görünmüyorsa kabloyu/telefonun USB sürücüsünü kontrol et. Uygulamada bağlantı ekranı görünürse sunucuyu ve USB bağlantısını kontrol edip **Yeniden dene**'ye bas.

## 3. Test hesapları

| Hesap                         | E-posta                    | Parola            |
| ----------------------------- | -------------------------- | ----------------- |
| Ece Yılmaz                    | `ogrenci@pusula.local`     | `PusulaDemo2026!` |
| Arda                          | `arda@pusula.local`        | `PusulaDemo2026!` |
| Doğrulanmış örnek akademisyen | `akademisyen@pusula.local` | `PusulaDemo2026!` |

Bunlar yerel demo hesaplarıdır. PC'de gizli pencere veya ayrı tarayıcı profiliyle Arda'ya, telefonda Ece'ye giriş yaparak iki oyuncuyu aynı anda deneyebilirsin.

## 4. Beş panelde denenecekler

- **Öğren:** Üstteki ders seçiciye dokun; yanındaki artı yeni ders ekler. Biyoloji seçip çalışmayı bitir veya ara ver: dönüşte Biyoloji seçili kalmalı. Bir konu yuvarlağına dokun. **Derse hazırlık** kısa kavram kartlarını, **Tekrar** o konunun sorularını açar. Penguen doğru cevapta alkışlar, yanlışta üzülür; üzerine dokununca tepki yeniden oynar.
- **Görevler:** Günlük adımları, öğretmen ödevlerini, haftalık hedefleri ve hatalarını aç.
- **Maç:** Aynı dersteki diğer hesabı seç. **Klasik → Davet et ve turunu oyna** hemen kendi 3 dakikanı başlatır; arkadaşın 7 gün içinde **Kabul et ve turunu oyna** der. **Seri → Odayı aç** seni bekleme odasına alır; diğer hesap **Odaya katıl** deyince ortak geri sayımdan sonra 2 dakika başlar. Yenileme süreyi sıfırlamaz. İki tur tamamlanınca sonuç ve ödüller görünür.
- **Mağaza:** 39 ürünün kategorilerini, kendi profilinle önizlemeyi, seviye kilitlerini ve aldığın ürünü kullanmayı dene. Önizlemede kendi adın ve mevcut kozmetiklerin görünür; bakiyen değişmez. Ece'nin eski token işlemleri ve satın aldıkları korunmuştur; bakiye otomatik doldurulmaz.
- **Profil:** Avatar/isim, başarımlar, seri, sahip oldukların ve geçmişi incele. En aşağıda hesap ayarları var. Profil paylaşımını açarsan başka öğrenci maç/lig listesindeki ismine tıklayarak profiline bakabilir. Akademisyen kozmetiklerini göremez.

Mobil sıra: **Görevler · Maç · Öğren · Mağaza · Profil**. Masaüstü sol menü: **Öğren · Görevler · Maç · Mağaza · Profil**.

## APK'yi tekrar üretmek

Bu bilgisayara gerekli araçlar proje altında hazırlandı. Android dosyalarını değiştirirsen:

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\scripts\build-android.ps1
```

Web arayüzündeki değişiklikler çalışan yerel sunucudan gelir; her CSS değişikliğinde APK derlemene gerek yoktur. APK, debug imzalıdır; mağaza yayını için canlı HTTPS adresi ve ayrı release imzası gerekir.

Paket: `app.dopamin.student`, sürüm `1.0`, minimum Android 7.0 (API 24). Derleme ve APK v2 imzası doğrulandı. Hazırlık sırasında bağlı Android cihaz bulunmadığından fiziksel cihazda açılış/dokunma testi henüz yapılmadı. Tarayıcıdaki mobil test bu testin yerine geçmez.

APK boyutu: 1.209.249 bayt (önceki 4.120.742 bayta göre %70,7 daha küçük). SHA-256: `57F8EEA3CBA171C6B313F6771623A3B8AAD29C52D075AD17E2A3FB3A0BDB4829`.

Teknik yapılandırma: [Capacitor yapılandırması](https://capacitorjs.com/docs/config), [Android ortamı](https://capacitorjs.com/docs/getting-started/environment-setup).

Boyut optimizasyonunda varsayılan derleme `compact` kullanılır. R8 erişilmeyen kodları ve kaynakları çıkarır; Capacitor eklentileri ve JavaScript köprü yöntemleri korunur. Debug imzası, paket adı ve bağlantı adresi aynıdır. Eski küçültülmemiş debug paketini gerektiğinde `scripts/build-android.ps1 -Unoptimized` ile üretebilirsin. Web varlıklarının 8 dosyası önceki APK ile birebir aynı; v2 imza doğrulaması geçti. Fiziksel telefon henüz bağlı olmadığından cihaz üzerindeki son açılış testi yapılmadı.

[Android R8 belgesi](https://developer.android.com/topic/performance/app-optimization/enable-app-optimization).
