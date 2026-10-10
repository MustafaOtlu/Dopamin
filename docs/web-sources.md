# İzinli web kaynakları

Dersin varsayılanı `documents_only`. Akademisyen Kaynaklar ve AI ekranından
`approved_web` kapsamını açar ve tam HTTPS sayfa adresini ekler. Alan adının
tamamına veya sayfadaki diğer bağlantılara izin verilmez. En fazla 20 etkin
adres ve adres başına tek sıradaki/çalışan okuma vardır.

## Okuma ve erişim

- `web_fetch` işi izin kimliği, izin revizyonu ve ders kapsamı revizyonunu sunucudan alır.
- Worker ağ isteğinden önce, metin/dosya yazmadan önce ve her AI çağrısından önce
  ilgili izin yeniden denetlenir. Yazım ayrıca mevcut iş lease'ine bağlıdır.
- İzinli HTTPS sayfası bir kez okunur; HTML içinden script çalıştırılmadan metin çıkarılır.
  Çerez, oturum, tarayıcı, alt kaynak yükleme veya yönlendirme takibi yoktur.
- DNS sonuçlarının tamamı genel internet adresi olmalıdır. İstek doğrulanan tek
  IP'ye sabitlenir, TLS sertifikası asıl alan adına karşı doğrulanır. IP adresleri,
  özel/ayrılmış IP aralıkları, yerel adlar, kimlik bilgisi ve özel port reddedilir.
- DNS ve ağ için 20 saniye, sıkıştırılmış/açılmış gövde için 2 MiB, metin için
  500.000 karakter sınırı vardır. PDF bu yolla alınmaz; normal PDF yükleme kullanılır.
- HTTP/meta karakter kümesi dikkate alınır. Script, form, gezinme ve gizli DOM
  metni çıkarılır; HTML veya uzak görsel doğrudan uygulamada gösterilmez.

Metin özel depolamada `text/plain; charset=utf-8` dosyasıdır. Supabase Storage
kurulumunda özel bucket'ın izinli MIME listesinde `text/plain` da bulunmalıdır.
Gerçek Supabase bağlantısı henüz doğrulanmadı. Ham HTML saklanmaz.

## Sürüm ve alıntı

Her kayıt kaynak URL'sini, okunma zamanını ve izin revizyonlarını taşır. `page`
alanı PDF'de sayfa, web kaydında 1800 karakterlik metin bölümü anlamındadır;
arayüz web için “Bölüm” gösterir. AI'ya bu anlam ve kaynak türü gönderilir.
Alıntı, ilgili belge kimliği/bölüm içindeki metne karşı doğrulanır.

Aynı metin aynı izinle yeniden okunduğunda ikinci dosya/sürüm oluşturulmaz.
Metin veya izin revizyonu değiştiğinde yeni değişmez kaynak sürümü oluşur.
Eski yayımlanmış soru/alıntı geçmişi korunur; yeni üretim güncel kayıtla sınırlıdır.

İzni veya dersin web kapsamını kapatmak öğrenci paylaşımını durdurur ve bekleyen
üretim/taslakları geçersizleştirir. Yeniden açmak eski kayıtları yetkilendirmez:
güncel izinle tekrar okumak ve gerekiyorsa yeniden öğrenciye açmak gerekir.
Ödev PDF'lerinin ayrı RLS izni, web kaydı için erişim sağlayamaz. Kaynağı kaldırma
tüm sürümleri kapatır ve mevcut 30 günlük dosya temizliği kuyruğunu kullanır.

## Doğrulama ve sınırlar

`web-reader.test.ts` URL/IP/DNS sabitleme, yönlendirme, içerik türü, sıkıştırma,
süre, karakter kümesi ve güvenilmeyen HTML'yi doğrular.
`web-sources.integration.test.ts` gerçek PostgreSQL/RLS, dosya, sürüm, alıntı,
izin iptali ve işleyici değişimi yarışlarını sınar. Tarayıcı testi paylaşma,
indirme, izin kapatma/açma ve mobil erişilebilirliği kapsar. Tarayıcı verisi
yalnız E2E seed aşamasındaki sabit HTML'den gelir; üretim API'sinde sahte okuma yoktur.

Yerel çalışan uygulamada MDN'nin algoritma sayfası gerçek HTTPS isteğiyle
9 Ekim 2026'da okunup kaydedildi. Bu tek alan adı denemesi bütün sitelerde
başarı veya akademik doğruluk kanıtı değildir. JavaScript/login gerektiren
sayfalar, genel site taraması ve görsel/tablo semantiği bu okuyucunun kapsamında değildir.

Referanslar: [OWASP SSRF denetimleri](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html),
[Node HTTPS](https://nodejs.org/api/https.html),
[Cheerio metin yükleme](https://cheerio.js.org/docs/basics/loading/).
