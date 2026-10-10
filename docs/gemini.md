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
- Bir üretim işi en fazla **10 belge / 10 soru** alır. Kaynak bağlamı en fazla 30 metin parçasıdır; tek API gövdesi 500 KB, yanıt düşünme dahil 6.000 token ile sınırlıdır. Uzun PDF'lerin tamamı tek üretimde kapsanmış sayılmaz.
- Google'ın doğrudan PDF desteği 50 MB / 1.000 sayfaya kadardır; uygulamanın yerel sınırları daha küçüktür. [PDF belgeleri](https://ai.google.dev/gemini-api/docs/document-processing)
- Güncel bağlantı **Gemini 3.5 Flash-Lite** kullanır. 3.8 Flash ile analiz başarılı oldu, fakat soru üretiminde zaman aşımı görüldü; aynı şemadaki Flash-Lite denemesi yaklaşık 2 saniye sürdü. Günlük yerel üst bütçe 5 USD; **1 milyon girdi için 0,30 USD, çıktı için 2,50 USD** ayarlandı. Bunlar gerçek fatura değil, uygulamanın tahmini bütçe hesabıdır. Düşünme tokenları da çıktı hesabına dahildir. [Fiyatlandırma](https://ai.google.dev/gemini-api/docs/pricing)
- RPM/TPM/RPD kotaları anahtar başına değil, Google projesi ve kullanım katmanı bazındadır. Kesin hesabına ait kota sayılarını genel model listesi vermez; AI Studio içindeki kullanım sınırlarından görülür. 429 yanıtı kullanıcıya açıklanır; yerel kuyruk işleri sırayla yürütür, en fazla mevcut iş deneme hakkı kadar artan beklemeyle tekrarlar. [Kota belgesi](https://ai.google.dev/gemini-api/docs/rate-limits)
- Google'ın kabul etmediği ayrıntılı şema kısıtları istekte açıklamaya dönüştürülür; dönen içerik özgün Zod şemasıyla tam olarak doğrulanır. Sayfa/alıntı doğrulaması ve öğretmen onayı korunur. [Yapılandırılmış çıktı](https://ai.google.dev/gemini-api/docs/structured-output)
- API çağrıları `store:false` kullanır. Kullanım bildirilen başarısız/eksik çıktılar da maliyete yazılır; zaman aşımında olası ücret için ayrılan bütçe saklanır.

## Test araçları

`scripts/test-gemini-live.ts` gerçek istek yapar ve ücret/kota kullanabilir. Aynı test dersini ve işi `.data/gemini-live-report.json` üzerinden sürdürür. Rapor ve oturum dosyaları Git dışındadır. Normal Vitest/Playwright çalıştırmaları gerçek Gemini anahtarı kullanmaz.


## 10 Ekim 2026 gerçek bağlantı testi

Yerel öğretmen hesabında **Gemini PDF Denemesi (GEMTEST)** dersi hazır. Bir sayfalık algoritma PDF'i yüklendi, metni çıkarıldı ve Gemini ile müfredat analizi tamamlandı. Son üretim işi Flash-Lite ile **5 farklı türde** soru oluşturdu: doğru/yanlış, eşleştirme, sıralama, boşluk tamamlama ve kategorilere ayırma. Şema, cevap yapısı ve kaynak sayfasındaki birebir alıntı kontrolleri geçti.

İçerik incelemesinde doğru/yanlış önermesi Türkçeye çevrildi, boşluk etiketleri cevapları göstermeyen sıra adlarına dönüştürüldü. Bu ikinci düzeltme artık üretim dönüşümünde de uygulanır. İlk denemelerin tekrarlı eşleştirme taslakları arşivlendi. Beş güncel soru öğretmen incelemesine bırakıldı; öğrencilere otomatik yayımlanmadı.

Kuyruk kayıtları, soru içeriği ve kullanım ölçümleri yerelde `.data/gemini-live-report.json` dosyasındadır. Google'dan kullanım verisi dönen çağrıların raporlanan toplam tahmini bedeli yaklaşık **0,02 USD** oldu; zaman aşımına uğrayan çağrılar ve doğrudan teşhis denemeleri bu toplama dahil değildir. Kesin ücret AI Studio'da görülür.
