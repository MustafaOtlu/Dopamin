# Gemini ile kaynaklı soru üretimi

Gemini sunucu tarafında Google Interactions API üzerinden çalışır. `AI_PROVIDER=gemini` seçilir; anahtar yalnız `.env.local` içindedir, tarayıcıya gönderilmez. Bu dosya Git dışında tutulur. Mevcut OpenAI sağlayıcısı `AI_PROVIDER=openai` ile kullanılmaya devam eder.

## Öğretmen olarak deneme

1. Yerel uygulamada öğretmen hesabıyla giriş yap: `akademisyen@pusula.local`, parola `PusulaDemo2026!`.
2. Derslerim → ders → Kaynaklar bölümüne bir PDF yükle.
3. PDF hazır olduğunda kaynak olarak seç ve müfredat analizini başlat. Önerilen konuları, kazanımları ve varsa kapsam sorularını incele.
4. Yayımlanmış bir kazanım ve kaynak seçip soru üretimini başlat. İnceleme ekranında soru, cevap anahtarı ve sayfa alıntısını karşılaştır; uygun olanları yayımla.
5. Öğrenci tekrarları yalnız yayımlanmış soruları içerir.

## Sınırlar ve maliyet

- Uygulama PDF yüklemesini **20 MB / 300 sayfa** ile sınırlar. PDF metni yerel olarak sayfalara ayrılır; taranmış sayfalar OCR'dan geçer. Gemini'ye kaynağın metni ve sayfa numarası gönderilir. Bu sürüm diyagramları doğrudan Gemini görsel yorumlamasına göndermez.
- Bir üretim işi en fazla **10 belge / 10 soru** alır. İzinli belgelerin tüm parçaları yerelde taranır. Soru üretiminde kazanımla sözcük/başlık ilişkisine göre en fazla 18 parça, müfredat analizinde belgelerin başından ve sonundan dengeli örneklemeyle en fazla 30 parça seçilir. Kaynak metin toplamı 60.000 karakter, tek API gövdesi 500 KB, yanıt düşünme dahil 6.000 token ile sınırlıdır. Uzun PDF'lerin tamamı tek üretimde kapsanmış sayılmaz. İş sonucundaki `source_coverage` kapsam bilgisini kaydeder.
- Google'ın doğrudan PDF desteği 50 MB / 1.000 sayfaya kadardır; uygulamanın yerel sınırları daha küçüktür. [PDF belgeleri](https://ai.google.dev/gemini-api/docs/document-processing)
- Güncel bağlantı **Gemini 3.5 Flash-Lite** kullanır. 3.8 Flash ile analiz başarılı oldu, fakat soru üretiminde zaman aşımı görüldü; aynı şemadaki Flash-Lite denemesi yaklaşık 2 saniye sürdü. Günlük yerel üst bütçe 5 USD; **1 milyon girdi için 0,30 USD, çıktı için 2,50 USD** ayarlandı. Bunlar gerçek fatura değil, uygulamanın tahmini bütçe hesabıdır. Düşünme tokenları da çıktı hesabına dahildir. [Fiyatlandırma](https://ai.google.dev/gemini-api/docs/pricing)
- RPM/TPM/RPD kotaları anahtar başına değil, Google projesi ve kullanım katmanı bazındadır. Kesin hesabına ait kota sayılarını genel model listesi vermez; AI Studio içindeki kullanım sınırlarından görülür. 429 yanıtı kullanıcıya açıklanır; yerel kuyruk işleri sırayla yürütür, en fazla mevcut iş deneme hakkı kadar artan beklemeyle tekrarlar. [Kota belgesi](https://ai.google.dev/gemini-api/docs/rate-limits)
- Google'ın kabul etmediği ayrıntılı şema kısıtları istekte açıklamaya dönüştürülür; dönen içerik özgün Zod şemasıyla tam olarak doğrulanır. Sayfa/alıntı doğrulaması ve öğretmen onayı korunur. [Yapılandırılmış çıktı](https://ai.google.dev/gemini-api/docs/structured-output)
- API çağrıları `store:false` kullanır. Kullanım bildirilen başarısız/eksik çıktılar da maliyete yazılır; zaman aşımında olası ücret için ayrılan bütçe saklanır.

## Test araçları

`scripts/test-gemini-live.ts` GitHub sürümünden korundu. Gerçek istek yapar ve ücret/kota kullanabilir. Güncel otomatik müfredat ve üretim akışı öğretmen panelinden denenebilir. Normal Vitest/Playwright çalıştırmaları gerçek Gemini anahtarı kullanmaz.

## 10 Ekim: içerik kalitesi iyileştirmeleri

- Sağlayıcı ve model değiştirilmedi. Gemini bağlantı dosyası taşınmış derlemenin kaynak haritasından kurtarıldı.
- `AI_GEMINI_THINKING_LEVEL` varsayılanı `medium`. Bu, önceki sabit `low` ayarından daha fazla düşünmeye izin verir; süre ve maliyet artabilir. Flash-Lite için bu düzey [Google'ın düşünme belgesinde](https://ai.google.dev/gemini-api/docs/thinking) desteklenir. Hız öncelikliyse `low` seçilebilir; farklı bir modele geçerken desteklenen düzey kontrol edilmelidir.
- Her etkinlik türü yalnız gereken alanları ister. Kullanılmayan boş diziler, boş metinler ve ilgisiz cevap alanları üretilmez. Tam cevap ve kaynak doğrulaması sunucuda sürer.
- Üretim yönergesi kazanımdaki eyleme uygun kısa uygulamalar, neden-sonuç ve kavram yanılgılarını ölçmeye odaklanır. Kaynakta bulunmayan sıralama ilişkileri yasaklanır. Bunun anlamsal olarak her çıktıda uygulandığı otomatik kontrollerle kanıtlanamaz; öğretmen incelemesi gerekir.
- Önceki üretimler ve mevcut kazanım soruları içerikleriyle birlikte dikkate alınır. Türler yeni işler arasında döner; her üç soruluk iş yeniden ilk üç türle başlamaz. Doğru/yanlış soruları için istenen doğruluk değeri dönüşümlüdür.
- Aynı soru metni/öğeleri, belirsiz eşleştirme ve cevapla eşleşmeyen boşluklar reddedilir. Yapısal veya alıntı hatasında en fazla bir düzeltme çağrısı yapılır. Düzeltme de bütçeye yazılır; hâlâ geçersizse iş öğretmen müdahalesi bekler. Kota, erişim ve ağ hataları bu ek denemeyi başlatmaz.
- Daha sonraki PDF sayfaları müfredat onayında da doğrulanabilir; eski ilk 30 parça sınırı burada kaldırıldı.

Kaynak seçimi yerel sözcük eşleştirmesi kullanır; anlam benzerliği veya diller arası çeviri motoru değildir. Türkçe kazanım ile tamamen İngilizce kaynak arasındaki ilişki zayıf kalabilir. Görseller hâlâ modele gönderilmez. Öğretmen incelemesi ve otomatik yayın izinleri değişmedi.

Bu bilgisayarda API anahtarı aktarılmadığından yeni değişikliklerle canlı kalite/hız karşılaştırması yapılmadı. `.env.local` şablonu hazırlandı; `AI_API_KEY` yerelde doldurulduktan sonra sunucu yeniden başlatılmalı. Anahtar paylaşılması veya Git'e eklenmesi gerekmez.


## 10 Ekim 2026 gerçek bağlantı testi

Yerel öğretmen hesabında **Gemini PDF Denemesi (GEMTEST)** dersi hazır. Bir sayfalık algoritma PDF'i yüklendi, metni çıkarıldı ve Gemini ile müfredat analizi tamamlandı. Son üretim işi Flash-Lite ile **5 farklı türde** soru oluşturdu: doğru/yanlış, eşleştirme, sıralama, boşluk tamamlama ve kategorilere ayırma. Şema, cevap yapısı ve kaynak sayfasındaki birebir alıntı kontrolleri geçti.

İçerik incelemesinde doğru/yanlış önermesi Türkçeye çevrildi, boşluk etiketleri cevapları göstermeyen sıra adlarına dönüştürüldü. Bu ikinci düzeltme artık üretim dönüşümünde de uygulanır. İlk denemelerin tekrarlı eşleştirme taslakları arşivlendi. Beş güncel soru öğretmen incelemesine bırakıldı; öğrencilere otomatik yayımlanmadı.

Kuyruk kayıtları, soru içeriği ve kullanım ölçümleri yerelde `.data/gemini-live-report.json` dosyasındadır. Google'dan kullanım verisi dönen çağrıların raporlanan toplam tahmini bedeli yaklaşık **0,02 USD** oldu; zaman aşımına uğrayan çağrılar ve doğrudan teşhis denemeleri bu toplama dahil değildir. Kesin ücret AI Studio'da görülür.
